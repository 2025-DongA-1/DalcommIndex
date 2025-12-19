// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter, { authRequired } from "./auth.js";
import { createMeRouter } from "./me.js";
import { pool } from "./db.js";

import { loadCafes } from "./data.js";          // CSV fallback
import { loadCafesFromDB } from "./data_db.js"; // DB loader(있어야 함)

import { recommendCafes } from "./recommend.js";
import { extractPreferences, generateRecommendationMessage } from "./gpt.js";

const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * ✅ /auth, /api 라우터는 데이터 로딩 여부와 관계없이 항상 등록
 */
app.use("/auth", authRouter);
app.use("/api", createMeRouter());

const parseCsv = (v) =>
  normalizeStr(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** ====== 테이블/컬럼 존재 여부 캐시(리뷰/설정 기능용) ====== */
const __tableCache = new Map();
async function tableExists(tableName) {
  if (__tableCache.has(tableName)) return __tableCache.get(tableName);
  const [rows] = await pool.query("SHOW TABLES LIKE ?", [tableName]);
  const ok = rows.length > 0;
  __tableCache.set(tableName, ok);
  return ok;
}

const __colCache = new Map();
async function usersHasColumn(col) {
  if (__colCache.has(col)) return __colCache.get(col);
  const [rows] = await pool.query("SHOW COLUMNS FROM users LIKE ?", [col]);
  const ok = rows.length > 0;
  __colCache.set(col, ok);
  return ok;
}

/** ✅ 전역(공유) 데이터셋 변수: 반드시 선언되어야 함 */
let cafes = [];
let cafesLoadedFrom = null;

/** ✅ 챗봇 mock 옵션(원하지 않으면 0으로 두면 됨) */
const CHATBOT_MOCK = process.env.CHATBOT_MOCK === "1";
const mockCafes = []; // 필요하면 샘플 데이터를 넣으세요. 없으면 빈 배열.

function pickCafeResultFields(cafe) {
  return {
    id: cafe.id,
    region: cafe.region,
    name: cafe.name,
    address: cafe.address,
    url: cafe.url,
    score: Number.isFinite(Number(cafe.score)) ? Number(cafe.score) : 0,
    summary: cafe.summary,
    atmosphere: cafe.atmosphere || cafe.atmosphere_norm,
    purpose: cafe.purpose || cafe.purpose_norm,
    taste: cafe.taste || cafe.taste_norm,
    companion: cafe.companion || cafe.companion_norm,
    menu: cafe.menu,
    main_dessert: cafe.main_dessert,
    main_coffee: cafe.main_coffee,
    parking: cafe.parking,
    x: cafe.x,
    y: cafe.y,
  };
}

/** 지도 필터 */
function handleFilter(req, res) {
  try {
    if (!cafes.length) {
      return res.json({
        ok: true,
        results: [],
        warning: "카페 데이터(CSV/DB)가 아직 준비되지 않았습니다.",
      });
    }
    const prefs = req.body || {};
    const recs = recommendCafes(prefs, cafes, 200);
    return res.json({ ok: true, results: recs.map(pickCafeResultFields) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Filter internal server error" });
  }
}

/** ========= Search / Detail API용 유틸 ========= */
function safeJsonParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  try {
    const parsed = JSON.parse(v);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function firstFromJsonArray(v) {
  const j = safeJsonParse(v, null);
  if (!j) return "";
  if (typeof j === "string") return j;
  if (Array.isArray(j)) return typeof j[0] === "string" ? j[0] : "";
  return "";
}

function arrayFromJson(v) {
  const j = safeJsonParse(v, []);
  if (Array.isArray(j)) return j.filter((x) => typeof x === "string");
  if (typeof j === "string") return [j];
  return [];
}

function normalizeStr(v) {
  return (v ?? "").toString().trim();
}

function sanitizeThumb(thumb) {
  const s = normalizeStr(thumb);
  const lower = s.toLowerCase();

  if (!s || s === "\\N" || lower === "null") return null;
  if (lower.startsWith("file://") || lower.startsWith("file:/")) return null; // file:///n/ 등 차단
  if (/^[a-zA-Z]:\\/.test(s)) return null; // C:\... 형태 차단

  return s;
}

function classifyRegionKey({ region, address }) {
  const r = normalizeStr(region);
  const a = normalizeStr(address);
  const hay = `${r} ${a}`;

  if (hay.includes("광주 동구") || r === "동구" || r === "광주 동구") return "dong-gu";
  if (hay.includes("광주 남구") || r === "남구" || r === "광주 남구") return "nam-gu";
  if (hay.includes("광주 북구") || r === "북구" || r === "광주 북구") return "buk-gu";
  if (hay.includes("광주 서구") || r === "서구" || r === "광주 서구") return "seo-gu";
  if (hay.includes("광주 광산구") || r === "광산구" || r === "광주 광산구") return "gwangsan-gu";

  if (hay.includes("화순")) return "hwasun";
  if (hay.includes("담양")) return "damyang";
  if (hay.includes("나주")) return "naju";

  return "all";
}

function neighborhoodFromAddress(address) {
  const a = normalizeStr(address);
  const parts = a.split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts[1] : "";
}

function splitTagsFromScoreBy(scoreBy) {
  const menuRaw = normalizeStr(scoreBy?.menu_tags ?? scoreBy?.menuTags ?? "");
  const recoRaw = normalizeStr(scoreBy?.reco_tags ?? scoreBy?.recoTags ?? "");

  const menuTags = menuRaw ? menuRaw.split(/[|,]/g).map((x) => x.trim()).filter(Boolean) : [];
  const recoTags = recoRaw ? recoRaw.split(/[|,]/g).map((x) => x.trim()).filter(Boolean) : [];
  const parking = normalizeStr(scoreBy?.parking ?? "");

  return { menuTags, recoTags, parking };
}

function deriveThemesAndDesserts({ topKeywords = [], menuTags = [], recoTags = [] }) {
  const hay = [...topKeywords, ...menuTags, ...recoTags].join(" ");
  const themes = ["dessert"];

  if (/(사진|포토|포토존|인스타|감성)/.test(hay)) themes.push("photo");
  if (/(공부|작업|노트북|콘센트)/.test(hay)) themes.push("study");
  if (/(데이트|연인|커플)/.test(hay)) themes.push("date");
  if (/(가족|아이|키즈|유모차)/.test(hay)) themes.push("family");
  if (/(주문|레터링|커스텀|케이크)/.test(hay)) themes.push("cake");

  const DESSERT_CANDIDATES = ["케이크", "마카롱", "말차", "소금빵", "크로플", "휘낭시에", "빙수", "푸딩"];
  const desserts = DESSERT_CANDIDATES.filter((d) => hay.includes(d));

  return { themes: Array.from(new Set(themes)), desserts };
}

async function queryCafesWithLatestStats() {
  const [rows] = await pool.query(`
    SELECT
      c.cafe_id,
      c.name,
      c.address,
      c.region,
      c.lat,
      c.lon,
      c.map_urls_json,
      c.images_json,
      s.score_total,
      s.review_count_total,
      s.review_count_recent,
      s.last_mentioned_at,
      s.score_by_category_json,
      s.top_keywords_json
    FROM cafes c
    LEFT JOIN (
      SELECT s1.*
      FROM cafe_stats s1
      JOIN (
        SELECT cafe_id, MAX(updated_at) AS mx
        FROM cafe_stats
        GROUP BY cafe_id
      ) t
      ON t.cafe_id = s1.cafe_id AND t.mx = s1.updated_at
    ) s
    ON s.cafe_id = c.cafe_id
  `);

  return rows;
}

/** ========= 부트스트랩(데이터 로딩 후 라우트 오픈) ========= */
async function bootstrap() {
  // 1) DB 우선 로딩
  try {
    cafes = await loadCafesFromDB();
    cafesLoadedFrom = "DB";
    console.log(`[server] cafes loaded: ${cafes.length} (DB)`);
  } catch (e) {
    console.warn("[server] DB load failed. fallback to CSV.", e?.message || e);

    // 2) CSV fallback
    try {
      const CAFES_CSV = process.env.CAFES_CSV || "dessert_cafes_gemini.csv";
      cafes = loadCafes(CAFES_CSV);
      cafesLoadedFrom = CAFES_CSV;
      console.log(`[server] cafes loaded: ${cafes.length} (${CAFES_CSV})`);
    } catch (e2) {
      cafes = [];
      cafesLoadedFrom = null;
      console.warn("[server] cafes not ready yet. continue with empty cafes.", e2?.message || e2);
    }
  }

  /** 헬스/상태 */
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/status", (req, res) =>
    res.json({
      ok: true,
      cafesCount: cafes.length,
      cafesLoadedFrom,
      db: { configured: !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME) },
    })
  );

  /** ✅ 검색 페이지용: 목록 */
app.get("/api/cafes", async (req, res) => {
  try {
    if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
      return res.status(503).json({ message: "DB 설정이 필요합니다." });
    }

    // ✅ CSV 파싱(복수 선택 지원)
    const regions = parseCsv(req.query.region).filter((r) => r !== "all");
    const themes = parseCsv(req.query.themes);
    const desserts = parseCsv(req.query.desserts);

    const q = normalizeStr(req.query.q || "").toLowerCase();
    const sort = normalizeStr(req.query.sort || "relevance");

    const rows = await queryCafesWithLatestStats();

    // ✅ 회원리뷰(달콤인덱스) 집계: cafe_id별 count/avg
    let userAgg = new Map();
    if (await tableExists("user_reviews")) {
      const [aggRows] = await pool.query(
        `SELECT cafe_id, COUNT(*) AS user_review_count, AVG(rating) AS user_rating_avg
        FROM user_reviews
        GROUP BY cafe_id`
      );

      userAgg = new Map(
        aggRows.map((r) => [
          Number(r.cafe_id),
          {
            count: Number(r.user_review_count || 0) || 0,
            avg: r.user_rating_avg == null ? null : Number(r.user_rating_avg),
          },
        ])
      );
    }

    let items = rows.map((r) => {
      const scoreBy = safeJsonParse(r.score_by_category_json, {});
      const topKeywords = safeJsonParse(r.top_keywords_json, []);
      const topKeywordsArr = Array.isArray(topKeywords) ? topKeywords : [];
      const extReviewCount = Number(r.review_count_total || 0) || 0;
      const ua = userAgg.get(Number(r.cafe_id)) || { count: 0, avg: null };

      const userReviewCount = ua.count || 0;
      const userRatingAvg = ua.avg == null ? null : Math.round(Number(ua.avg) * 10) / 10;

      const combinedReviewCount = extReviewCount + userReviewCount;


      const { menuTags, recoTags, parking } = splitTagsFromScoreBy(scoreBy);
      const { themes: derivedThemes, desserts: derivedDesserts } = deriveThemesAndDesserts({
        topKeywords: topKeywordsArr,
        menuTags,
        recoTags,
      });

      const regionKey = classifyRegionKey({ region: r.region, address: r.address });

      // ✅ thumb 서버에서 정리 (file:// 차단)
      const thumbRaw = firstFromJsonArray(r.images_json);
      const thumb = sanitizeThumb(thumbRaw);

      const excerpt =
        topKeywordsArr.length > 0
          ? `키워드: ${topKeywordsArr.slice(0, 6).join(", ")}`
          : normalizeStr(r.address);

      return {
        id: Number(r.cafe_id),
        name: normalizeStr(r.name),
        region: regionKey,
        neighborhood: neighborhoodFromAddress(r.address),
        score: Number(r.score_total || 0) || 0,
        rating: userRatingAvg,
        reviewCount: combinedReviewCount,
        reviewCountExternal: extReviewCount,
        reviewCountUser: userReviewCount,
        themes: derivedThemes,
        desserts: derivedDesserts,
        thumb,
        why: topKeywordsArr.slice(0, 3),
        excerpt,
        _address: normalizeStr(r.address),
        _regionText: normalizeStr(r.region),
        _parking: parking,
      };
    });

    // ✅ 지역: 복수 선택이면 OR (선택 지역 중 하나라도)
    if (regions.length) items = items.filter((x) => regions.includes(x.region));

    if (q) {
      items = items.filter((x) => {
        const hay = `${x.name} ${x.neighborhood} ${x.excerpt} ${x._address} ${x._regionText}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // ✅ themes/desserts: 복수 선택이면 OR (some)
    //    (카테고리 간에는 AND로 조합됨: region + themes + desserts + q)
    if (themes.length) items = items.filter((x) => themes.some((t) => (x.themes || []).includes(t)));
    if (desserts.length) items = items.filter((x) => desserts.some((d) => (x.desserts || []).includes(d)));

    if (sort === "score") items.sort((a, b) => (b.score || 0) - (a.score || 0));
    if (sort === "reviews") items.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    if (sort === "relevance") items.sort((a, b) => (b.score || 0) - (a.score || 0));

    return res.json({ items });
  } catch (e) {
    console.error("[api/cafes]", e);
    return res.status(500).json({ message: "카페 목록 조회 실패" });
  }
});

  /** ✅ 상세 페이지용: 단건 */
  app.get("/api/cafes/:id", async (req, res) => {
    try {
      if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
        return res.status(503).json({ message: "DB 설정이 필요합니다." });
      }

      const cafeId = Number(req.params.id);
      if (!Number.isFinite(cafeId)) return res.status(400).json({ message: "잘못된 cafe_id" });

      const [rows] = await pool.query(
        `
        SELECT
          c.cafe_id,
          c.name,
          c.address,
          c.region,
          c.lat,
          c.lon,
          c.map_urls_json,
          c.images_json,
          s.score_total,
          s.review_count_total,
          s.review_count_recent,
          s.last_mentioned_at,
          s.score_by_category_json,
          s.top_keywords_json
        FROM cafes c
        LEFT JOIN (
          SELECT s1.*
          FROM cafe_stats s1
          JOIN (
            SELECT cafe_id, MAX(updated_at) AS mx
            FROM cafe_stats
            GROUP BY cafe_id
          ) t
          ON t.cafe_id = s1.cafe_id AND t.mx = s1.updated_at
        ) s
        ON s.cafe_id = c.cafe_id
        WHERE c.cafe_id = ?
        LIMIT 1
        `,
        [cafeId]
      );

      if (!rows.length) return res.status(404).json({ message: "카페를 찾을 수 없습니다." });

      const r = rows[0];

      // ✅ 회원리뷰 집계(해당 카페)
      let userReviewCount = 0;
      let userRatingAvg = null;

      if (await tableExists("user_reviews")) {
        const [agg] = await pool.query(
          `SELECT COUNT(*) AS cnt, AVG(rating) AS avg
          FROM user_reviews
          WHERE cafe_id = ?`,
          [cafeId]
        );

        const row = agg?.[0] || {};
        userReviewCount = Number(row.cnt || 0) || 0;
        userRatingAvg = row.avg == null ? null : Math.round(Number(row.avg) * 10) / 10;
      }

      const extReviewCount = Number(r.review_count_total || 0) || 0;
      const combinedReviewCount = extReviewCount + userReviewCount;

      const scoreBy = safeJsonParse(r.score_by_category_json, {});
      const topKeywords = safeJsonParse(r.top_keywords_json, []);
      const topKeywordsArr = Array.isArray(topKeywords) ? topKeywords : [];

      const { menuTags, recoTags, parking } = splitTagsFromScoreBy(scoreBy);
      const photos = arrayFromJson(r.images_json);
      const mapUrl = firstFromJsonArray(r.map_urls_json);

      const tags = Array.from(new Set([...topKeywordsArr, ...menuTags, ...recoTags].map((x) => normalizeStr(x)).filter(Boolean)))
        .slice(0, 12);

      return res.json({
        cafe: {
          id: Number(r.cafe_id),
          cafe_id: Number(r.cafe_id),
          name: normalizeStr(r.name),
          region: normalizeStr(r.region),
          address: normalizeStr(r.address),
          x: r.lon ?? null,
          y: r.lat ?? null,
          mapUrl,
          photos,
          reviewCount: combinedReviewCount,          // ✅ A: 합산값
          reviewCountExternal: extReviewCount,       // 옵션
          userReviewCount,                          // 회원리뷰 개수
          userRatingAvg,                            // ✅ B: 회원 평균 평점
          reviewCountRecent: Number(r.review_count_recent || 0) || 0,
          lastMentionedAt: r.last_mentioned_at ?? null,
          score: Number(r.score_total || 0) || 0,
          parking: parking || "정보 없음",
          mainMenu: menuTags.slice(0, 6).join(", ") || "대표메뉴 정보 없음",
          atmosphere: recoTags.slice(0, 6).join(", ") || "분위기 정보 없음",
          tags,
          topKeywords: topKeywordsArr,
          menuTags,
          recoTags,
        },
      });
    } catch (e) {
      console.error("[api/cafes/:id]", e);
      return res.status(500).json({ message: "카페 상세 조회 실패" });
    }
  });

  /** ✅ (회원) 리뷰 목록/작성 */
app.get("/api/cafes/:id/user-reviews", async (req, res) => {
  try {
    if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
      return res.status(503).json({ message: "DB 설정이 필요합니다." });
    }

    const cafeId = Number(req.params.id);
    if (!Number.isFinite(cafeId)) return res.status(400).json({ message: "잘못된 cafe_id" });

    // 테이블이 아직 없으면 빈 배열(프론트는 그대로 동작)
    if (!(await tableExists("user_reviews"))) {
      return res.json({ items: [] });
    }

    const limit = Math.min(Number(req.query.limit || 20), 50);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const hasSettings = await usersHasColumn("settings_json");
    const selectSettings = hasSettings ? ", u.settings_json" : "";

    const [rows] = await pool.query(
      `SELECT
          r.review_id AS id,
          r.user_id AS userId,
          r.rating,
          r.content,
          r.created_at,
          r.updated_at,
          u.nickname${selectSettings}
       FROM user_reviews r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.cafe_id = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [cafeId, limit, offset]
    );

    const items = rows.map((r) => {
      let nickname = r.nickname ?? "사용자";
      if (hasSettings && r.settings_json) {
        try {
          const s = JSON.parse(r.settings_json);
          if (s && s.profilePublic === false) nickname = "익명";
        } catch {
          // ignore
        }
      }
      return {
        id: Number(r.id),
        userId: Number(r.userId),
        nickname,
        rating: Number(r.rating),
        content: r.content ?? "",
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return res.json({ items });
  } catch (e) {
    console.error("[api/cafes/:id/user-reviews]", e);
    return res.status(500).json({ message: "회원 리뷰 조회 실패" });
  }
});

app.post("/api/cafes/:id/user-reviews", authRequired, async (req, res) => {
  try {
    if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
      return res.status(503).json({ message: "DB 설정이 필요합니다." });
    }
    if (!(await tableExists("user_reviews"))) {
      return res
        .status(501)
        .json({ message: "user_reviews 테이블이 없습니다. (1번 단계: 테이블 생성이 필요합니다)" });
    }

    const cafeId = Number(req.params.id);
    if (!Number.isFinite(cafeId)) return res.status(400).json({ message: "잘못된 cafe_id" });

    const userId = Number(req.user.sub);
    const rating = Number(req.body?.rating);
    const content = String(req.body?.content || "").trim();

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "평점(rating)은 1~5 사이여야 합니다." });
    }
    if (!content) return res.status(400).json({ message: "리뷰 내용(content)을 입력해주세요." });

    // 카페 존재 확인(에러 메시지 명확화)
    const [cafeRows] = await pool.query("SELECT cafe_id FROM cafes WHERE cafe_id = ? LIMIT 1", [cafeId]);
    if (!cafeRows.length) return res.status(404).json({ message: "카페를 찾을 수 없습니다." });

    try {
      await pool.query(
        `INSERT INTO user_reviews (cafe_id, user_id, rating, content)
         VALUES (?, ?, ?, ?)`,
        [cafeId, userId, rating, content]
      );
      return res.status(201).json({ ok: true, created: true });
    } catch (e) {
      // (cafe_id, user_id) UNIQUE가 있다면: 다시 작성 시 업데이트
      if (e?.code === "ER_DUP_ENTRY") {
        try {
          const [result] = await pool.query(
            `UPDATE user_reviews
             SET rating = ?, content = ?, updated_at = NOW()
             WHERE cafe_id = ? AND user_id = ?`,
            [rating, content, cafeId, userId]
          );
          return res.json({ ok: true, updated: result.affectedRows > 0 });
        } catch (e2) {
          // updated_at 컬럼이 없는 경우에도 동작하도록 fallback
          if (e2?.code === "ER_BAD_FIELD_ERROR") {
            const [result2] = await pool.query(
              `UPDATE user_reviews
               SET rating = ?, content = ?
               WHERE cafe_id = ? AND user_id = ?`,
              [rating, content, cafeId, userId]
            );
            return res.json({ ok: true, updated: result2.affectedRows > 0 });
          }
          throw e2;
        }
      }
      throw e;
    }
  } catch (e) {
    console.error("[api/cafes/:id/user-reviews/post]", e);
    return res.status(500).json({ message: "회원 리뷰 작성 실패" });
  }
});


  // 프론트가 /filter 또는 /api/filter로 호출해도 둘 다 OK
  app.post("/filter", handleFilter);
  app.post("/api/filter", handleFilter);

  /** 챗봇 추천 */
  app.post("/api/chat", async (req, res) => {
    try {
      const cafesForChat = cafes.length ? cafes : CHATBOT_MOCK ? mockCafes : [];
      const warning =
        cafes.length ? null : CHATBOT_MOCK ? "현재 카페 데이터가 없어 샘플 데이터로 응답 중입니다. (CHATBOT_MOCK=1)" : null;

      if (!cafesForChat.length) {
        return res.json({
          ok: true,
          message: "아직 카페 데이터(CSV/DB)가 준비되지 않았습니다. 우선 챗봇 연결만 확인하려면 .env에 CHATBOT_MOCK=1을 넣어주세요.",
          prefs: {},
          results: [],
        });
      }

      const { message } = req.body || {};
      const userMessage =
        typeof message === "string" && message.trim() ? message.trim() : "광주 분위기 좋은 카페 추천해줘";

      let prefs;
      try {
        prefs = await extractPreferences(userMessage);
      } catch {
        prefs = { region: [], atmosphere: [], taste: [], purpose: [], menu: [], required: [] };
      }

      const recs = recommendCafes(prefs, cafesForChat, 5);

      let replyMessage;
      try {
        replyMessage = await generateRecommendationMessage(userMessage, prefs, recs);
      } catch {
        replyMessage =
          recs.length > 0
            ? `조건에 맞는 카페 ${recs.length}곳을 찾았어요. 아래 결과를 확인해 주세요.`
            : `조건에 맞는 카페를 찾지 못했어요. 조건을 조금 완화해보세요.`;
      }

      return res.json({
        ok: true,
        warning,
        message: replyMessage,
        prefs,
        results: recs.map(pickCafeResultFields),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: "Internal server error" });
    }
  });

  /** ✅ /api, /auth는 404도 JSON으로 반환 */
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      return res.status(404).json({ ok: false, message: "Not Found" });
    }
    next();
  });

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`- status:  http://localhost:${PORT}/api/status`);
    console.log(`- cafes:   http://localhost:${PORT}/api/cafes`);
  });
}

bootstrap().catch((e) => {
  console.error("[bootstrap fatal]", e);
  process.exit(1);
});
