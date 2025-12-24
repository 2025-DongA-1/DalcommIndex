// data_db.js
import { pool } from "./db.js";

function safeJsonParse(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v; // mysql2가 object로 줄 때도 대비
  try {
    const parsed = JSON.parse(v);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeStr(v) {
  return (v ?? "").toString().trim();
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstUrlFromJson(jsonVal) {
  const j = safeJsonParse(jsonVal, null);
  if (!j) return null;
  if (typeof j === "string") return j;
  if (Array.isArray(j)) return j.find((x) => typeof x === "string") || null;
  if (typeof j === "object") {
    // {kakao:"...", naver:"..."} 같은 형태도 대비
    for (const k of Object.keys(j)) {
      if (typeof j[k] === "string") return j[k];
    }
  }
  return null;
}

function toTokenSet(v) {
  // v가 배열/문자열/JSON 문자열이어도 처리
  const j = safeJsonParse(v, v);
  const arr = Array.isArray(j)
    ? j
    : typeof j === "string"
      ? j.split(/[|,]/g)
      : [];
  return new Set(arr.map(normalizeStr).filter(Boolean));
}

function setToPipe(setObj) {
  return [...(setObj || new Set())].join("|");
}

function tokensFromKeywordCounts(keywordCountsRaw, maxItems = 60) {
    const pairs = [];
  if (Array.isArray(keywordCountsRaw)) {
      for (const item of keywordCountsRaw) {
        const text = normalizeStr(item?.text);
        const value = Number(item?.value);
        if (text && Number.isFinite(value) && value > 0) pairs.push([text, value]);
      }
    } else if (keywordCountsRaw && typeof keywordCountsRaw === "object") {
      for (const [k, v] of Object.entries(keywordCountsRaw)) {
        const text = normalizeStr(k);      const value = Number(v);
        if (text && Number.isFinite(value) && value > 0) pairs.push([text, value]);
      }
    }
    pairs.sort((a, b) => (b[1] || 0) - (a[1] || 0));
  const out = [];
  for (const [text] of pairs) {    out.push(text);
    if (out.length >= maxItems) break;
  }  return out;
}

export async function loadCafesFromDB() {
  // cafe_stats는 "최신 updated_at 1건"을 붙이는 방식 (프로젝트에 맞게 period_end 기준으로 바꿔도 됩니다)
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
      c.external_ids_json,
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
    ) s ON s.cafe_id = c.cafe_id
  `);

  return rows.map((r) => {
    const scoreBy = safeJsonParse(r.score_by_category_json, {});
    const topKeywords = safeJsonParse(r.top_keywords_json, []);
    const keywordCounts = safeJsonParse(r.keyword_counts_json, null);
    const keywordTokens = tokensFromKeywordCounts(keywordCounts, 60);

    const recoTags = toTokenSet(scoreBy?.reco_tags ?? scoreBy?.recoTags ?? []);
    const companionTags = toTokenSet(scoreBy?.companion_tags ?? scoreBy?.companionTags ?? []);
    const atmosphereTags = toTokenSet(scoreBy?.atmosphere_tags ?? scoreBy?.atmosphereTags ?? []);
    const menuTags = toTokenSet(scoreBy?.menu_tags ?? scoreBy?.menuTags ?? []);
    const tasteTags = toTokenSet(scoreBy?.taste_tags ?? scoreBy?.tasteTags ?? []);
    const parking = normalizeStr(scoreBy?.parking) || "정보 없음";

    // DB(lat/lon) -> 프론트(Map/Kakao)에서 쓰는 x/y로 변환: x=lon, y=lat
    const x = numOrNull(r.lon);
    const y = numOrNull(r.lat);

    const url = firstUrlFromJson(r.map_urls_json);

    // recommend.js가 기대하는 구조(최소한)로 맞춤
    const name = normalizeStr(r.name);
    const address = normalizeStr(r.address);

    const menuSet = new Set([...menuTags]);
    const tasteSet = new Set([...tasteTags]); // 맛 기반
    const atmosphereSet = new Set([...atmosphereTags]);
    const purposeSet = new Set([...companionTags]);

    const searchText = [
      name,
      address,
      normalizeStr(r.region),
      [...menuSet].join(" "),
      [...tasteSet].join(" "),
      [...atmosphereSet].join(" "),
      [...purposeSet].join(" "),
      Array.isArray(topKeywords) ? topKeywords.join(" ") : "",
      keywordTokens.join(" "),
      parking,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      id: Number(r.cafe_id),                 // ✅ Chat/Map/Detail에서 공통으로 쓰는 ID
      region: normalizeStr(r.region),        // 화면표시용
      name,
      address,
      url,
      x,
      y,

      // 추천/필터용(기존 recommend.js 호환)
      summary: Array.isArray(topKeywords) && topKeywords.length
        ? `키워드: ${topKeywords.slice(0, 6).join(", ")}`
        : "",

      atmosphere_norm: setToPipe(atmosphereSet),
      taste_norm: setToPipe(tasteSet),
      purpose_norm: setToPipe(purposeSet),
      menu_norm: setToPipe(menuSet),
      companion_norm: "",

      menuSet,
      atmosphereSet,
      tasteSet,
      purposeSet,

      menu: [...menuTags].join(", "),
      main_dessert: [...menuTags][0] || "",
      main_coffee: "",
      parking,

      // 점수는 cafe_stats.score_total을 사용
      coffee_score: 0,
      dessert_score: 0,
      date_score: 0,
      study_score: 0,
      popularity_score: Number(r.score_total || 0) || 0,
      score: Number(r.score_total || 0) || 0,

      // 상세페이지에서 이미지/외부ID도 쓸 수 있게 원본 유지
      images_json: r.images_json,
      external_ids_json: r.external_ids_json,

      review_count_total: Number(r.review_count_total || 0) || 0,
      review_count_recent: Number(r.review_count_recent || 0) || 0,
      last_mentioned_at: r.last_mentioned_at ?? null,

      // ✅ 챗봇 추천(언급량 기반)에 필요
      keyword_counts_json: keywordCounts,
      top_keywords: Array.isArray(topKeywords) ? topKeywords : [],
      keywords_text: keywordTokens.join(" "),

      searchText,
    };
  });
}
