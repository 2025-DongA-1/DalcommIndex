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
import { extractPreferences, generateRecommendationMessage, buildFollowUpQuestion } from "./gpt.js";


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

// ===== user_reviews 평점(AVG) 캐시 =====
const __userRatingCache = { expiresAt: 0, map: new Map() };
const USER_RATING_CACHE_TTL_MS = 2 * 60 * 1000;

async function getUserRatingAggMap() {
  const now = Date.now();
  if (__userRatingCache.expiresAt > now && __userRatingCache.map && __userRatingCache.map.size) {
    return __userRatingCache.map;
  }

  // DB 미설정이면 평점 집계 불가
  if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
    return new Map();
  }

  try {
    const ok = await tableExists("user_reviews");
    if (!ok) return new Map();

    const [rows] = await pool.query(
      `SELECT cafe_id, AVG(rating) AS avg_rating
         FROM user_reviews
        WHERE rating IS NOT NULL
        GROUP BY cafe_id`
    );

    const map = new Map();
    for (const r of rows) {
      const id = Number(r.cafe_id);
      const avg = r.avg_rating == null ? null : Number(r.avg_rating);
      if (Number.isFinite(id) && Number.isFinite(avg)) map.set(id, Number(avg.toFixed(2)));
    }

    __userRatingCache.map = map;
    __userRatingCache.expiresAt = now + USER_RATING_CACHE_TTL_MS;
    return map;
  } catch (e) {
    console.warn("[user_reviews] rating agg failed:", e?.message || e);
    return new Map();
  }
}

const __colCache = new Map();
async function usersHasColumn(col) {
  if (__colCache.has(col)) return __colCache.get(col);
  const [rows] = await pool.query("SHOW COLUMNS FROM users LIKE ?", [col]);
  const ok = rows.length > 0;
  __colCache.set(col, ok);
  return ok;
}

/** ====== keyword_dict 캐시(카테고리별) ====== */
const __kwCache = new Map();
const KW_CACHE_TTL_MS = 10 * 60 * 1000; // 10분

async function getActiveKeywordDict(category) {
  const key = String(category || "").trim();
  if (!key) return [];

  const now = Date.now();
  const cached = __kwCache.get(key);
  if (cached && cached.expiresAt > now) return cached.items;

  try {
    const [rows] = await pool.query(
      `SELECT canonical_keyword, synonyms_json, weight
       FROM keyword_dict
       WHERE category = ? AND is_active = 1
       ORDER BY weight DESC, canonical_keyword ASC`,
      [key]
    );

    const items = (rows || [])
      .map((r) => {
        const canonical = normalizeStr(r.canonical_keyword);
        const synRaw = safeJsonParse(r.synonyms_json, []);
        const synArr = Array.isArray(synRaw) ? synRaw : [];
        const synonyms = uniq([canonical, ...synArr].map((x) => normalizeStr(x)).filter(Boolean));
        return {
          canonical,
          synonyms,
          weight: Number(r.weight ?? 1) || 1,
        };
      })
      .filter((x) => x.canonical);

    __kwCache.set(key, { items, expiresAt: now + KW_CACHE_TTL_MS });
    return items;
  } catch (e) {
    // 테이블/권한 문제 등: 빈 배열로 폴백(짧게 캐시)
    __kwCache.set(key, { items: [], expiresAt: now + 30 * 1000 });
    return [];
  }
}


function mergeKeywordDicts(...lists) {
  const m = new Map();

  const push = (it) => {
    const canonical = normalizeStr(it?.canonical);
    if (!canonical) return;

    const prev = m.get(canonical);
    if (!prev) {
      m.set(canonical, {
        canonical,
        synonyms: Array.isArray(it.synonyms) ? it.synonyms : [canonical],
        weight: Number(it.weight ?? 1) || 1,
      });
      return;
    }

    const prevSyn = Array.isArray(prev.synonyms) ? prev.synonyms : [canonical];
    const nextSyn = Array.isArray(it.synonyms) ? it.synonyms : [canonical];
    const synonyms = uniq([...prevSyn, ...nextSyn].map((x) => normalizeStr(x)).filter(Boolean));
    const weight = Math.max(Number(prev.weight ?? 1) || 1, Number(it.weight ?? 1) || 1);

    m.set(canonical, { canonical, synonyms, weight });
  };

  for (const list of lists) {
    const arr = Array.isArray(list) ? list : [];
    for (const it of arr) push(it);
  }

  return [...m.values()].sort(
    (a, b) => (Number(b.weight ?? 1) - Number(a.weight ?? 1)) || String(a.canonical).localeCompare(String(b.canonical), "ko")
  );
}

function buildTokenSet(topKeywords = [], menuTags = [], tasteTags = [], atmosphereTags = [], purposeTags = []) {
  const raw = [...topKeywords, ...menuTags, ...tasteTags, ...atmosphereTags, ...purposeTags]
    .map((x) => normalizeStr(x))
    .filter(Boolean);

  const set = new Set();
  for (const t of raw) {
    // 토큰 내부에 구분자가 섞여있을 수 있어 추가 분해
    const parts = String(t).split(/[|,·/()\[\]\s]+/g);
    for (const p of parts) {
      const v = normalizeStr(p);
      if (v) set.add(v);
    }
  }
  return set;
}

function matchCanonicalsFromDict(tokenSet, dictItems, maxItems = 8) {
  if (!tokenSet || !dictItems?.length) return [];
  const out = [];

  for (const it of dictItems) {
    const syns = Array.isArray(it.synonyms) ? it.synonyms : [];
    let hit = false;

    for (const s of syns) {
      const ss = normalizeStr(s);
      if (!ss) continue;

      // ✅ 정확 일치만(부분 문자열 매칭 금지) → "이드" 같은 오탐 방지
      if (tokenSet.has(ss)) {
        hit = true;
        break;
      }
    }

    if (hit) out.push(it.canonical);
    if (out.length >= maxItems) break;
  }

  return uniq(out);
}


/** ✅ 전역(공유) 데이터셋 변수: 반드시 선언되어야 함 */
let cafes = [];
let cafesLoadedFrom = null;

/** ✅ 챗봇 mock 옵션(원하지 않으면 0으로 두면 됨) */
const CHATBOT_MOCK = process.env.CHATBOT_MOCK === "1";
const mockCafes = []; // 필요하면 샘플 데이터를 넣으세요. 없으면 빈 배열.

/** ===============================
 * ✅ 챗봇 컨텍스트(연속 대화) 저장소
 * - 기본은 인메모리(Map)라서 서버 재시작 시 초기화됩니다.
 * - 운영에서 다중 인스턴스를 쓰면 Redis 같은 외부 저장소로 교체하세요.
 * =============================== */
const chatSessions = new Map();
const CHAT_SESSION_TTL_MS = 30 * 60 * 1000; // 30분
const CHAT_RESULTS_PER_TURN = 3; // ✅ 카드(결과) 개수: 3개

function uniq(arr) {
  return Array.from(new Set(Array.isArray(arr) ? arr : []));
}

function normalizePrefObj(p) {
  const x = p && typeof p === "object" ? p : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return {
    region: arr(x.region),
    atmosphere: arr(x.atmosphere),
    taste: arr(x.taste),
    purpose: arr(x.purpose),
    menu: arr(x.menu),
    required: arr(x.required),
    minSentiment: num(x.minSentiment),
  };
}


function stablePrefsKey(prefs) {
  const p = normalizePrefObj(prefs);
  const sort = (a) => uniq(a).slice().sort();
  return JSON.stringify({
    region: sort(p.region),
    atmosphere: sort(p.atmosphere),
    taste: sort(p.taste),
    purpose: sort(p.purpose),
    menu: sort(p.menu),
    required: sort(p.required),
    minSentiment: Number(p.minSentiment || 0),
  });
}

function isMoreRequest(text) {
  const t = (text || "").toString();
  return /(다른\s*곳|다른\s*데|더\s*(?:추천|알려)|추가\s*(?:추천|알려)|또\s*(?:추천|알려)|다음\s*(?:추천|카페))/i.test(t);
}

function mergePrefs(base, delta, userMessage) {
  const a = normalizePrefObj(base);
  const b = normalizePrefObj(delta);
  const msg = (userMessage || "").toString();

  // ✅ "바꿔줘/대신/말고" 등은 기존 조건을 교체하고 싶다는 힌트로 간주
  const replaceHint = /(대신|말고|바꿔|변경|다른\s*(?:분위기|목적|메뉴|지역))/i.test(msg);

  // region은 보통 단일 선택 성격이 강해서: 새 값이 들어오면 교체
  const region = b.region.length ? uniq(b.region) : uniq(a.region);

  return {
    region,
    atmosphere: replaceHint && b.atmosphere.length ? uniq(b.atmosphere) : uniq([...a.atmosphere, ...b.atmosphere]),
    taste: replaceHint && b.taste.length ? uniq(b.taste) : uniq([...a.taste, ...b.taste]),
    purpose: replaceHint && b.purpose.length ? uniq(b.purpose) : uniq([...a.purpose, ...b.purpose]),
    menu: replaceHint && b.menu.length ? uniq(b.menu) : uniq([...a.menu, ...b.menu]),
    required: replaceHint && b.required.length ? uniq(b.required) : uniq([...a.required, ...b.required]),
    minSentiment: Math.max(a.minSentiment || 0, b.minSentiment || 0),
  };
}

function getChatSession(sessionId) {
  const s = chatSessions.get(sessionId);
  if (!s) return null;
  if (!s.updatedAt || Date.now() - s.updatedAt > CHAT_SESSION_TTL_MS) {
    chatSessions.delete(sessionId);
    return null;
  }
  return s;
}

// 주기적 GC(선택): 오래된 세션 정리
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of chatSessions.entries()) {
    if (!v?.updatedAt || now - v.updatedAt > CHAT_SESSION_TTL_MS) chatSessions.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

// function uniq(arr) {
//   return Array.from(new Set((arr || []).map((v) => String(v || "").trim()).filter(Boolean)));
// }

// // "대신/말고/변경" 등이 있으면 해당 필드를 '교체' 우선으로 처리
// function mergePrefs(prevPrefs, nextPrefs, userMessage = "") {
//   const a = normalizePrefObj(prevPrefs);
//   const b = normalizePrefObj(nextPrefs);

//   const replaceHint = /(대신|말고|바꿔|변경|정정)/.test(userMessage);

//   return {
//     // ✅ 지역은 혼합 추천이 어색한 경우가 많아서: 새 지역이 나오면 교체, 아니면 유지
//     region: b.region.length ? uniq(b.region) : uniq(a.region),

//     // ✅ 나머지는 기본적으로 누적, replaceHint면 교체
//     atmosphere: replaceHint && b.atmosphere.length ? uniq(b.atmosphere) : uniq([...a.atmosphere, ...b.atmosphere]),
//     taste: replaceHint && b.taste.length ? uniq(b.taste) : uniq([...a.taste, ...b.taste]),
//     purpose: replaceHint && b.purpose.length ? uniq(b.purpose) : uniq([...a.purpose, ...b.purpose]),
//     menu: replaceHint && b.menu.length ? uniq(b.menu) : uniq([...a.menu, ...b.menu]),
//     required: replaceHint && b.required.length ? uniq(b.required) : uniq([...a.required, ...b.required]),

//     minSentiment: Math.max(a.minSentiment || 0, b.minSentiment || 0),
//   };
// }

// function getChatSession(sessionId) {
//   const s = chatSessions.get(sessionId);
//   if (!s) return null;
//   if (!s.updatedAt || Date.now() - s.updatedAt > CHAT_SESSION_TTL_MS) {
//     chatSessions.delete(sessionId);
//     return null;
//   }
//   return s;
// }

// // 주기적 GC(선택): 오래된 세션 정리
// setInterval(() => {
//   const now = Date.now();
//   for (const [k, v] of chatSessions.entries()) {
//     if (!v?.updatedAt || now - v.updatedAt > CHAT_SESSION_TTL_MS) chatSessions.delete(k);
//   }
// }, 5 * 60 * 1000).unref?.();


function pickCafeResultFields(cafe) {
    // ✅ 사진 원본 후보들(데이터셋에 있는 키들 최대한 흡수)
  const rawPhotos =
    cafe.photos ??
    cafe.imageUrls ??
    cafe.images ??
    cafe.images_json ??
    cafe.imagesJson ??
    null;

  // ✅ 문자열/JSON/배열 모두 처리해서 "URL 배열"로 만들기
  const photos = (() => {
    const j = safeJsonParse(rawPhotos, null); // server.js에 이미 있음 :contentReference[oaicite:7]{index=7}
    let arr = [];

    if (Array.isArray(j)) arr = j;
    else if (typeof j === "string") {
      arr = j
        .split(/[,\n|]/g)
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      arr = [];
    }

    // ✅ 중복 제거 + 프로토콜 보정 + 이상값 제거
    const out = [];
    const set = new Set();
    for (let u of arr) {
      if (!u) continue;
      u = String(u).trim();
      if (u.startsWith("//")) u = `https:${u}`;
      if (!/^https?:\/\//i.test(u)) continue;
      if (set.has(u)) continue;
      set.add(u);
      out.push(u);
    }
    return out;
  })();

  // ✅ 대표 1장(PlacePopup이 image_url도 읽습니다 :contentReference[oaicite:8]{index=8})
  const image_url =
    cafe.image_url ??
    cafe.img_url ??
    cafe.thumbnail ??
    photos[0] ??
    firstFromJsonArray(cafe.images_json ?? cafe.imagesJson); // server.js에 이미 있음 :contentReference[oaicite:9]{index=9}


  return {
    // ✅ PlacePopup이 우선 사용하는 키
    cafe_id: cafe.cafe_id ?? cafe.id,

    // 기존 호환(맵/리스트에서 id 쓰는 코드가 있을 수 있어 같이 유지)
    id: cafe.id ?? cafe.cafe_id,
    region: cafe.region,
    name: cafe.name,
    address: cafe.address,
    url: cafe.url,
    // 추가: user_reviews 평균 별점 (없으면 null)
    rating:
      cafe.rating == null
        ? null
        : (Number.isFinite(Number(cafe.rating)) ? Number(cafe.rating) : null),
    // (선택) user_reviews 리뷰 수 (없으면 0)
    reviewCountUser: Number(cafe.reviewCountUser || 0) || 0,
    mention_score: Number.isFinite(Number(cafe.mention_score)) ? Number(cafe.mention_score) : undefined,
    keyword_hits: Array.isArray(cafe.keyword_hits) ? cafe.keyword_hits : undefined,
    summary: cafe.summary,
    atmosphere: cafe.atmosphere || cafe.atmosphere_norm,
    purpose: cafe.purpose || cafe.purpose_norm,
    taste: cafe.taste || cafe.taste_norm,
    companion: cafe.companion || cafe.companion_norm,
    menu: cafe.menu,
    main_dessert: cafe.main_dessert,
    main_coffee: cafe.main_coffee,
    parking: normalizeStr(cafe.parking),
    x: cafe.x,
    y: cafe.y,
    
    // ✅ 추가: 팝업 사진용
    image_url,
    photos,
    // (선택) PlacePopup은 images도 보니 같이 넣어도 좋습니다
    images: photos,
  };
}

/** 지도 필터 */
async function handleFilter(req, res) {
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
    const ratingMap = await getUserRatingAggMap();
    
    const results = recs.map((c) => {
      const out = pickCafeResultFields(c);
      const cid = Number(out.id ?? c.id);
      const avg = Number.isFinite(cid) ? ratingMap.get(cid) : null;
      out.rating = avg == null ? null : avg; // ✅ PlacePopup에서 place.rating으로 사용
      return out;
    });

    return res.json({ ok: true, results });
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
  const s = (v ?? "").toString().trim();
  const lower = s.toLowerCase();
  if (!s || s === "\\N" || lower === "null" || lower === "undefined" || lower === "nan") return "";
  return s;
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

// ===== 도로명(로/길/대로) 기반 상권 키 추출 =====
function extractSiDoFromAddress(address) {
  const a = normalizeStr(address);
  const noParen = a.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = noParen.split(/\s+/).filter(Boolean);

  // 가장 우선: '광주광역시', '전라남도' 같은 토큰이 그대로 들어있는 경우
  const sidoToken = parts.find((t) => /(특별시|광역시|특별자치시|자치시|도)$/.test(t) || /시$/.test(t) || /도$/.test(t));
  if (sidoToken) return sidoToken;

  // 축약/변형 표기 보정(프로젝트 범위: 광주/전남)
  if (noParen.includes("광주")) return "광주광역시";
  if (noParen.includes("전라남도") || noParen.includes("전남")) return "전라남도";
  if (noParen.includes("전라북도") || noParen.includes("전북")) return "전라북도";

  return "";
}

function extractGuFromAddress(address) {
  const a = normalizeStr(address);
  const noParen = a.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = noParen.split(/\s+/).filter(Boolean);
  // "광주광역시 동구 ..." 형태에서 "동구"를 우선으로 잡음
  const gu = parts.find((t) => /(구|군)$/.test(t));
  return gu || "";
}

function roadKeyFromAddress(address) {
  const a = normalizeStr(address);
  const noParen = a.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = noParen.split(/\s+/).filter(Boolean);
  const road = parts.find((t) => /(로|길|대로)$/.test(t));
  return road || "";
}

function roadAreaKeyFromAddress(address) {
  const sido = extractSiDoFromAddress(address);
  const gu = extractGuFromAddress(address);
  const road = roadKeyFromAddress(address);

  // 일관성 목표: 가능한 한 "시/도 + 구/군 + 도로명" 형태로
  if (sido && gu && road) return `${sido} ${gu} ${road}`;
  if (sido && road) return `${sido} ${road}`;
  if (gu && road) return `${gu} ${road}`;
  if (sido && gu) return `${sido} ${gu}`;
  if (road) return road;
  if (gu) return gu;
  if (sido) return sido;
  return "";
}

function splitTagsFromScoreBy(scoreBy) {
  const menuRaw = normalizeStr(scoreBy?.menu_tags ?? scoreBy?.menuTags ?? "");
  const tasteRaw = normalizeStr(scoreBy?.taste_tags ?? scoreBy?.tasteTags ?? "");
  const atmosphereRaw = normalizeStr(scoreBy?.atmosphere_tags ?? scoreBy?.atmosphereTags ?? "");
  const purposeRaw = normalizeStr(scoreBy?.purpose_tags ?? scoreBy?.purposeTags ?? "");

  const menuTags = menuRaw ? menuRaw.split(/[|,]/g).map((x) => x.trim()).filter(Boolean) : [];
  const tasteTags = tasteRaw ? tasteRaw.split(/[|,]/g).map((x) => x.trim()).filter(Boolean) : [];
  const atmosphereTags = atmosphereRaw ? atmosphereRaw.split(/[|,]/g).map((x) => x.trim()).filter(Boolean) : [];
  const purposeTags = purposeRaw ? purposeRaw.split(/[|,]/g).map((x) => x.trim()).filter(Boolean) : [];
  const parking = normalizeStr(scoreBy?.parking ?? "");

  return { menuTags, tasteTags, atmosphereTags, purposeTags, parking };
}

function tokensFromKeywordCounts(keywordCountsRaw, maxItems = 80) {
  const pairs = [];

  // 1) 배열 형태: [["말차",12], ...] 또는 [{text,value}, ...]
  if (Array.isArray(keywordCountsRaw)) {
    for (const it of keywordCountsRaw) {
      if (!it) continue;

      if (Array.isArray(it) && it.length >= 2) {
        const text = normalizeStr(it[0]);
        const value = Number(it[1]);
        if (text && Number.isFinite(value) && value > 0) pairs.push([text, value]);
        continue;
      }

      if (typeof it === "object") {
        const text = normalizeStr(it.text ?? it.word ?? it.token ?? it.keyword);
        const value = Number(it.value ?? it.count ?? it.cnt ?? it.freq);
        if (text && Number.isFinite(value) && value > 0) pairs.push([text, value]);
      }
    }
  }

  // 2) 객체 형태: {"말차":12, ...}
  if (
    !pairs.length &&
    keywordCountsRaw &&
    typeof keywordCountsRaw === "object" &&
    !Array.isArray(keywordCountsRaw)
  ) {
    for (const [k, v] of Object.entries(keywordCountsRaw)) {
      const text = normalizeStr(k);
      const value = Number(v);
      if (text && Number.isFinite(value) && value > 0) pairs.push([text, value]);
    }
  }

  pairs.sort((a, b) => (b[1] || 0) - (a[1] || 0));

  const out = [];
  for (const [text] of pairs) {
    if (!text) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}


// ===== creator insights helpers (키워드 집계/조합) =====
function keywordPairsFromCounts(keywordCountsRaw, topKeywordsArr = [], maxItems = 80) {
  const out = [];

  // 1) 배열 형태: [["말차",12], ...] 또는 [{text,value}, ...]
  if (Array.isArray(keywordCountsRaw)) {
    for (const it of keywordCountsRaw) {
      if (!it) continue;

      if (Array.isArray(it) && it.length >= 2) {
        const text = normalizeStr(it[0]);
        const value = Number(it[1]);
        if (text && Number.isFinite(value) && value > 0) out.push({ text, value });
        continue;
      }

      if (typeof it === "object") {
        const text = normalizeStr(it.text ?? it.word ?? it.token ?? it.keyword);
        const value = Number(it.value ?? it.count ?? it.cnt ?? it.freq);
        if (text && Number.isFinite(value) && value > 0) out.push({ text, value });
      }
    }
  }

  // 2) 객체 형태: {"말차":12, ...}
  if (
    !out.length &&
    keywordCountsRaw &&
    typeof keywordCountsRaw === "object" &&
    !Array.isArray(keywordCountsRaw)
  ) {
    for (const [k, v] of Object.entries(keywordCountsRaw)) {
      const text = normalizeStr(k);
      const value = Number(v);
      if (text && Number.isFinite(value) && value > 0) out.push({ text, value });
    }
  }

  // 3) fallback: keyword_counts_json이 비어있으면 topKeywords로 임시 가중치 생성
  if (!out.length && Array.isArray(topKeywordsArr) && topKeywordsArr.length) {
    const base = Math.min(50, topKeywordsArr.length);
    for (let i = 0; i < base; i++) {
      const text = normalizeStr(topKeywordsArr[i]);
      if (!text) continue;
      out.push({ text, value: base - i });
    }
  }

  // 중복 제거(최대값 유지) + 정렬 + 상위 maxItems 제한
  const m = new Map();
  for (const it of out) {
    const key = normalizeStr(it.text);
    if (!key) continue;
    m.set(key, Math.max(Number(m.get(key) || 0), Number(it.value || 0)));
  }

  return Array.from(m.entries())
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, maxItems);
}

function buildDictIndex(dictItems = []) {
  const syn2canon = new Map();
  const canon2weight = new Map();

  for (const it of Array.isArray(dictItems) ? dictItems : []) {
    const canonical = normalizeStr(it?.canonical);
    if (!canonical) continue;
    canon2weight.set(canonical, Number(it?.weight ?? 1) || 1);

    const syns = Array.isArray(it?.synonyms) ? it.synonyms : [canonical];
    for (const s of syns) {
      const ss = normalizeStr(s);
      if (!ss) continue;
      // 동일 synonym이 여러 canonical에 걸리는 경우: 먼저 들어온 것을 우선(사전 정렬/가중치에 의해 결정)
      if (!syn2canon.has(ss)) syn2canon.set(ss, canonical);
    }
  }

  return { syn2canon, canon2weight };
}

function scoreByMentionAndPresence(mentionCount, cafeCount, weight = 1) {
  const m = Math.max(Number(mentionCount || 0), 0);
  const c = Math.max(Number(cafeCount || 0), 0);
  const w = Math.max(Number(weight || 1), 0.1);
  // 설명 가능: 언급량(70%) + 등장 카페수(30%), 로그 스케일
  return (0.7 * Math.log1p(m) + 0.3 * Math.log1p(c)) * w;
}


function deriveThemesAndDesserts({ topKeywords = [], menuTags = [], recoTags = [], dessertDict = [] }) {
  const tokenSet = buildTokenSet(topKeywords, menuTags, recoTags);
  const hay = Array.from(tokenSet).join(" ");
  const themes = ["dessert"];

  if (/(사진|포토|포토존|인스타|감성)/.test(hay)) themes.push("photo");
  if (/(공부|작업|노트북|콘센트)/.test(hay)) themes.push("study");
  if (/(데이트|연인|커플)/.test(hay)) themes.push("date");
  if (/(가족|아이|키즈|유모차)/.test(hay)) themes.push("family");
  if (/(주문|레터링|커스텀|케이크)/.test(hay)) themes.push("cake");

  // ✅ DB keyword_dict(디저트) 기반 추출
  let desserts = [];
  if (Array.isArray(dessertDict) && dessertDict.length) {
    desserts = matchCanonicalsFromDict(tokenSet, dessertDict, 8);
  } else {
    // 폴백(이전 하드코딩 로직)
    const DESSERT_CANDIDATES = ["케이크", "마카롱", "말차", "소금빵", "크로플", "휘낭시에", "빙수", "푸딩"];
    desserts = DESSERT_CANDIDATES.filter((d) => hay.includes(d));
  }

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
      s.top_keywords_json,
      s.keyword_counts_json
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


/** ✅ 키워드 사전 조회(디버그/관리용) */
app.get("/api/keywords", async (req, res) => {
  try {
    if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
      return res.status(503).json({ message: "DB 설정이 필요합니다." });
    }

    const category = normalizeStr(req.query.category || "");
    const allowed = new Set(["atmosphere", "taste", "purpose", "dessert", "drink", "meal"]);
    if (category && !allowed.has(category)) {
      return res.status(400).json({ message: "category 값이 올바르지 않습니다." });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 500), 1), 2000);

    const sql = `
      SELECT keyword_id, category, canonical_keyword, synonyms_json, weight, is_active, updated_at
      FROM keyword_dict
      WHERE is_active = 1
      ${category ? "AND category = ?" : ""}
      ORDER BY category ASC, canonical_keyword ASC
      LIMIT ?
    `;

    const params = category ? [category, limit] : [limit];
    const [rows] = await pool.query(sql, params);

    return res.json({ items: rows || [] });
  } catch (e) {
    console.error("[api/keywords]", e);
    return res.status(500).json({ message: "키워드 조회 실패" });
  }
});

/** ✅ 창업자 인사이트: 메뉴/조합/컨셉(목적/분위기/맛) 랭킹 */
app.get("/api/creator/insights", async (req, res) => {
  try {
    if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
      return res.status(503).json({ message: "DB 설정이 필요합니다." });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
    const pairsLimit = Math.min(Math.max(Number(req.query.pairsLimit || 20), 1), 200);

    const rows = await queryCafesWithLatestStats();

    // ✅ keyword_dict 로드(내부 캐시): 메뉴/목적/분위기/맛
    const dictDessert = await getActiveKeywordDict("dessert");
    const dictDrink = await getActiveKeywordDict("drink");
    const dictMeal = await getActiveKeywordDict("meal");
    const dictPurpose = await getActiveKeywordDict("purpose");
    const dictAtmosphere = await getActiveKeywordDict("atmosphere");
    const dictTaste = await getActiveKeywordDict("taste");

    const idxDessert = buildDictIndex(dictDessert);
    const idxDrink = buildDictIndex(dictDrink);
    const idxMeal = buildDictIndex(dictMeal);
    const idxPurpose = buildDictIndex(dictPurpose);
    const idxAtmosphere = buildDictIndex(dictAtmosphere);
    const idxTaste = buildDictIndex(dictTaste);

    // synonym -> [{category, canonical, weight}, ...]
    const tokenHits = new Map();
    const addIdxToHits = (category, idx) => {
      for (const [syn, canonical] of idx.syn2canon.entries()) {
        const arr = tokenHits.get(syn) || [];
        const weight = Number(idx.canon2weight.get(canonical) ?? 1) || 1;
        const exists = arr.some((h) => h.category === category && h.canonical === canonical);
        if (!exists) arr.push({ category, canonical, weight });
        tokenHits.set(syn, arr);
      }
    };

    addIdxToHits("dessert", idxDessert);
    addIdxToHits("drink", idxDrink);
    addIdxToHits("meal", idxMeal);
    addIdxToHits("purpose", idxPurpose);
    addIdxToHits("atmosphere", idxAtmosphere);
    addIdxToHits("taste", idxTaste);

    const aggMenus = new Map();       // key: "category||canonical"
    const aggPurpose = new Map();     // key: "purpose||canonical"
    const aggAtmos = new Map();
    const aggTaste = new Map();
    const aggPairs = new Map();       // key: "a||b"

    const upsertAgg = (map, key, base) => {
      const prev = map.get(key);
      if (!prev) {
        map.set(key, base);
        return base;
      }
      // merge
      prev.mentionCount += base.mentionCount;
      prev.cafeCount += base.cafeCount;
      // weight는 더 큰 값을 유지
      prev.weight = Math.max(Number(prev.weight ?? 1) || 1, Number(base.weight ?? 1) || 1);
      return prev;
    };

    for (const r of rows) {
      const topKeywords = safeJsonParse(r.top_keywords_json, []);
      const topKeywordsArr = Array.isArray(topKeywords) ? topKeywords : [];
      const keywordCountsRaw = safeJsonParse(r.keyword_counts_json, null);

      // ✅ 카페 단위 토큰/가중치 목록(가능하면 keyword_counts_json 기반)
      const pairs = keywordPairsFromCounts(keywordCountsRaw, topKeywordsArr, 80);

      // ✅ 카페 내 중복 등장(동의어 중복 등)으로 cafeCount가 여러 번 올라가는 것 방지
      const seenKeys = new Set();

      // ✅ 메뉴 조합용: 카페 단위 메뉴 canonical->count
      const menuCanonCounts = new Map();
      const menuCanonCategory = new Map(); // canonical -> category(최초 히트 기준)

      for (const it of pairs) {
        const token = normalizeStr(it?.text);
        const value = Number(it?.value || 0) || 0;
        if (!token || value <= 0) continue;

        const hits = tokenHits.get(token);
        if (!hits || !hits.length) continue;

        for (const h of hits) {
          const k = `${h.category}||${h.canonical}`;
          const cafeCountInc = seenKeys.has(k) ? 0 : 1;
          if (!seenKeys.has(k)) seenKeys.add(k);

          const base = {
            category: h.category,
            keyword: h.canonical,
            mentionCount: value,
            cafeCount: cafeCountInc,
            weight: Number(h.weight ?? 1) || 1,
          };

          if (h.category === "dessert" || h.category === "drink" || h.category === "meal") {
            upsertAgg(aggMenus, k, base);

            // pair용 집계
            menuCanonCounts.set(h.canonical, (menuCanonCounts.get(h.canonical) || 0) + value);
            if (!menuCanonCategory.has(h.canonical)) menuCanonCategory.set(h.canonical, h.category);
          } else if (h.category === "purpose") {
            upsertAgg(aggPurpose, k, base);
          } else if (h.category === "atmosphere") {
            upsertAgg(aggAtmos, k, base);
          } else if (h.category === "taste") {
            upsertAgg(aggTaste, k, base);
          }
        }
      }

      // ✅ 메뉴 조합(카페 단위 상위 K개만)
      const topMenu = Array.from(menuCanonCounts.entries())
        .map(([canonical, cnt]) => ({ canonical, cnt }))
        .sort((a, b) => (b.cnt || 0) - (a.cnt || 0))
        .slice(0, 12);

      for (let i = 0; i < topMenu.length; i++) {
        for (let j = i + 1; j < topMenu.length; j++) {
          const a = topMenu[i];
          const b = topMenu[j];
          const aa = a.canonical;
          const bb = b.canonical;
          if (!aa || !bb || aa === bb) continue;

          const aFirst = String(aa).localeCompare(String(bb), "ko") <= 0;
          const x = aFirst ? aa : bb;
          const y = aFirst ? bb : aa;
          const key = `${x}||${y}`;

          const strengthInc = Math.min(Number(a.cnt || 0), Number(b.cnt || 0));
          const prev = aggPairs.get(key) || {
            a: x,
            b: y,
            strength: 0,
            cafeCount: 0,
            aCategory: menuCanonCategory.get(x) || "menu",
            bCategory: menuCanonCategory.get(y) || "menu",
          };

          prev.strength += strengthInc;
          prev.cafeCount += 1;
          aggPairs.set(key, prev);
        }
      }
    }

    const finalize = (arr) =>
      arr
        .map((x) => ({
          ...x,
          score: scoreByMentionAndPresence(x.mentionCount, x.cafeCount, x.weight),
        }))
        .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.mentionCount || 0) - (a.mentionCount || 0))
        .slice(0, limit);

    const menus = finalize(Array.from(aggMenus.values()));
    const purpose = finalize(Array.from(aggPurpose.values()));
    const atmosphere = finalize(Array.from(aggAtmos.values()));
    const taste = finalize(Array.from(aggTaste.values()));

    const pairs = Array.from(aggPairs.values())
      .map((p) => ({
        ...p,
        score: 0.7 * Math.log1p(Number(p.strength || 0)) + 0.3 * Math.log1p(Number(p.cafeCount || 0)),
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.cafeCount || 0) - (a.cafeCount || 0))
      .slice(0, pairsLimit);

    return res.json({
      menus,
      pairs,
      purpose,
      atmosphere,
      taste,
      meta: {
        cafesUsed: rows.length,
        asOf: new Date().toISOString(),
        note:
          "시간대별 누적 데이터가 아닌 '현재 수집된 리뷰 텍스트(카페별 keyword_counts_json/top_keywords_json)' 기반 언급량 집계입니다.",
      },
    });
  } catch (e) {
    console.error("[api/creator/insights]", e);
    return res.status(500).json({ message: "창업자 인사이트 생성 실패" });
  }
});



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

    // ✅ keyword_dict(디저트) 로드(요청당 1회, 내부 캐시)
    const dessertDict = mergeKeywordDicts(
      await getActiveKeywordDict("dessert"),
      await getActiveKeywordDict("drink"),
      await getActiveKeywordDict("meal")
    );

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
// ✅ keyword_counts_json(상대적으로 더 많은 토큰)도 같이 반영해서 디저트 매칭 커버리지↑
const keywordCountsRaw = safeJsonParse(r.keyword_counts_json, null);
const keywordCountTokens = tokensFromKeywordCounts(keywordCountsRaw, 80);
const keywordsForMatch = uniq([...topKeywordsArr, ...keywordCountTokens]);
      const extReviewCount = Number(r.review_count_total || 0) || 0;
      const ua = userAgg.get(Number(r.cafe_id)) || { count: 0, avg: null };

      const userReviewCount = ua.count || 0;
      const userRatingAvg = ua.avg == null ? null : Math.round(Number(ua.avg) * 10) / 10;

      const combinedReviewCount = userReviewCount;


      const { menuTags, tasteTags, atmosphereTags, purposeTags , parking } = splitTagsFromScoreBy(scoreBy);
      const { themes: derivedThemes, desserts: derivedDesserts } = deriveThemesAndDesserts({
        topKeywords: keywordsForMatch,
        menuTags,
        tasteTags,
        atmosphereTags,
        purposeTags,
        dessertDict,
      });

      const regionKey = classifyRegionKey({ region: r.region, address: r.address });

      // ✅ 도로명(상권) 키
      const sidoText = extractSiDoFromAddress(r.address);
      const guText = extractGuFromAddress(r.address);
      const roadKey = roadKeyFromAddress(r.address);
      const roadAreaKey = roadAreaKeyFromAddress(r.address);
      const areaKind = roadKey ? "road" : guText ? "gu" : "other";

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
        road_key: roadKey,
        road_area_key: roadAreaKey,
        sido_text: sidoText,
        area_kind: areaKind,
        gu_text: guText,
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
          s.top_keywords_json,
          s.keyword_counts_json
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
      const combinedReviewCount = userReviewCount;

      const scoreBy = safeJsonParse(r.score_by_category_json, {});
      const topKeywords = safeJsonParse(r.top_keywords_json, []);
      const topKeywordsArr = Array.isArray(topKeywords) ? topKeywords : [];
      const keywordCountsRaw = safeJsonParse(r.keyword_counts_json, null);

      const { menuTags, tasteTags, atmosphereTags, purposeTags, parking } = splitTagsFromScoreBy(scoreBy);
      const photos = arrayFromJson(r.images_json);
      const mapUrl = firstFromJsonArray(r.map_urls_json);

      const tags = Array.from(new Set([...topKeywordsArr, ...menuTags, ...tasteTags, ...atmosphereTags, ...purposeTags].map((x) => normalizeStr(x)).filter(Boolean)))
        .slice(0, 12);

      const keywordCounts = (() => {
        const out = [];

        // 배열 형태 처리
        if (Array.isArray(keywordCountsRaw)) {
          for (const it of keywordCountsRaw) {
            if (!it) continue;

            // [["말차",12], ...]
            if (Array.isArray(it) && it.length >= 2) {
              const text = normalizeStr(it[0]);
              const value = Number(it[1]);
              if (text && Number.isFinite(value) && value > 0) out.push({ text, value });
              continue;
            }

            // [{text,value}, {token,cnt} ...]
            if (typeof it === "object") {
              const text = normalizeStr(it.text ?? it.word ?? it.token ?? it.keyword);
              const value = Number(it.value ?? it.count ?? it.cnt ?? it.freq);
              if (text && Number.isFinite(value) && value > 0) out.push({ text, value });
            }
          }
        }

        // 객체 형태 처리: {"말차":12, ...}
        if (
          !out.length &&
          keywordCountsRaw &&
          typeof keywordCountsRaw === "object" &&
          !Array.isArray(keywordCountsRaw)
        ) {
          for (const [k, v] of Object.entries(keywordCountsRaw)) {
            const text = normalizeStr(k);
            const value = Number(v);
            if (text && Number.isFinite(value) && value > 0) out.push({ text, value });
          }
        }

        // fallback: keyword_counts_json이 비어있으면 topKeywords로 임시 가중치 생성
        if (!out.length && topKeywordsArr.length) {
          const base = Math.min(40, topKeywordsArr.length);
          for (let i = 0; i < base; i++) {
            const text = normalizeStr(topKeywordsArr[i]);
            if (!text) continue;
            out.push({ text, value: base - i });
          }
        }

        // 중복 제거(최대값 유지) + 정렬 + 상위 60개 제한
        const m = new Map();
        for (const it of out) {
          const key = normalizeStr(it.text);
          if (!key) continue;
          m.set(key, Math.max(Number(m.get(key) || 0), Number(it.value || 0)));
        }

        return Array.from(m.entries())
          .map(([text, value]) => ({ text, value }))
          .sort((a, b) => (b.value || 0) - (a.value || 0))
          .slice(0, 60);
      })();


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
          rating: userRatingAvg,
          reviewCountRecent: Number(r.review_count_recent || 0) || 0,
          lastMentionedAt: r.last_mentioned_at ?? null,
          score: Number(r.score_total || 0) || 0,
          parking: parking || "정보 없음",
          mainMenu: menuTags.slice(0, 6).join(", ") || "대표메뉴 정보 없음",
          atmosphere: atmosphereTags.slice(0, 6).join(", ") || "분위기 정보 없음",
          taste: tasteTags.slice(0, 6).join(", ") || "맛 정보 없음",
          purpose: purposeTags.slice(0, 6).join(", ") || "동반 정보 없음",
          tags,
          topKeywords: topKeywordsArr,
          menuTags,
          keywordCounts,
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

      const { message, sessionId, prevPrefs } = req.body || {};
      const userMessage =
        typeof message === "string" && message.trim() ? message.trim() : "광주 분위기 좋은 카페 추천해줘";

      // ✅ 세션: 같은 브라우저/페이지에서 연속 질문이면 sessionId를 유지해서 보내도록(프론트에서 구현)
      const sid = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "";
      const isMore = isMoreRequest(userMessage);

      // 사용자가 "초기화"를 요청하면 컨텍스트 리셋
      if (sid && /^(초기화|리셋|reset)$/i.test(userMessage)) {
        chatSessions.delete(sid);
        return res.json({
          ok: true,
          warning,
          sessionId: sid,
          message: "대화 조건을 초기화했어요. 원하시는 지역/분위기/목적을 다시 말씀해 주세요.",
          prefs: { region: [], atmosphere: [], taste: [], purpose: [], menu: [], required: [], minSentiment: 0 },
          results: [],
        });
      }

      const session = sid ? getChatSession(sid) : null;
      const basePrefs = session?.prefs || prevPrefs || {};

      let deltaPrefs;
      try {
        deltaPrefs = await extractPreferences(userMessage);
      } catch {
        deltaPrefs = { region: [], atmosphere: [], taste: [], purpose: [], menu: [], required: [], minSentiment: 0 };
      }

      // ✅ (핵심) 이전 질문을 기억하도록 basePrefs + deltaPrefs를 병합
      const prefs = mergePrefs(basePrefs, deltaPrefs, userMessage);

      // ✅ 조건이 바뀌면(새로운 질의) 이전에 보여준 카페 목록(seenIds) 초기화
      const key = stablePrefsKey(prefs);
      const nextSession = session || (sid ? { prefs: {}, prefsKey: "", seenIds: [], followUpAsked: false, updatedAt: 0 } : null);
      if (nextSession && !isMore && nextSession.prefsKey && nextSession.prefsKey !== key) {
        nextSession.seenIds = [];
        nextSession.followUpAsked = false;
      }

      // ✅ 추천 결과: 기본은 3개만 카드로 보여주기
      // - "다른 곳도 추천"이면 기존에 보여준 카페는 제외하고 다음 3개를 반환
      const poolK = Math.max(CHAT_RESULTS_PER_TURN * 20, 30);
      const pool = recommendCafes(prefs, cafesForChat, poolK);
      const seenSet = new Set(nextSession?.seenIds || []);
      let recs = pool.filter((c) => !seenSet.has(c.id)).slice(0, CHAT_RESULTS_PER_TURN);
      if (!recs.length) recs = pool.slice(0, CHAT_RESULTS_PER_TURN);

      let replyMessage;
      try {
        replyMessage = await generateRecommendationMessage(userMessage, prefs, recs);
      } catch {
        replyMessage =
          recs.length > 0
            ? `조건에 맞는 카페 ${recs.length}곳을 찾았어요. 아래 결과를 확인해 주세요.`
            : `조건에 맞는 카페를 찾지 못했어요. 조건을 조금 완화해보세요.`;
      }

      // ✅ 후속 질문은 "한 번만"(그리고 "다른 곳도 추천" 같은 추가 요청에는 붙이지 않음)
      if (nextSession && !isMore && !nextSession.followUpAsked) {
        const followUp = buildFollowUpQuestion(prefs);
        if (followUp) {
          replyMessage = `${replyMessage}\n\n${followUp}`;
          nextSession.followUpAsked = true;
        }
      }

      // ✅ 세션 갱신
      if (sid) {
        const ids = recs.map((c) => c.id).filter(Boolean);
        if (nextSession) {
          nextSession.prefs = prefs;
          nextSession.prefsKey = key;
          nextSession.seenIds = uniq([...(nextSession.seenIds || []), ...ids]).slice(-300);
          nextSession.updatedAt = Date.now();
          chatSessions.set(sid, nextSession);
        }
      }

      return res.json({
        ok: true,
        warning,
        message: replyMessage,
        prefs,
        results: recs.map(pickCafeResultFields),
        sessionId: sid || undefined,
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
