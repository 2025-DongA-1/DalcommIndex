// backend/scripts/import_hwasun_wordcloud.mjs
import fs from "fs/promises";
import path from "path";
import process from "process";
import { pool } from "../db.js";

function normalizeStr(v) {
  return (v ?? "").toString().trim();
}

// 콤마/따옴표를 최소한으로 처리하는 CSV split
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" 이스케이프 처리
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }

    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseArgs(argv) {
  const args = { csv: "", topN: 60, algo: "v5", logEach: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--csv") args.csv = argv[++i] || "";
    else if (a === "--topN") args.topN = Number(argv[++i] || 60);
    else if (a === "--algo") args.algo = normalizeStr(argv[++i] || "v5");
    else if (a === "--logEach") args.logEach = true;
  }

  if (!args.csv) {
    throw new Error(
      "Usage: node scripts/import_hwasun_wordcloud.mjs --csv <hwasun-cafe.csv> [--topN 60] [--algo v5] [--logEach]"
    );
  }
  if (!Number.isFinite(args.topN) || args.topN <= 0) args.topN = 60;
  return args;
}

function cleanToken(t) {
  const s = normalizeStr(t);
  if (!s) return "";
  if (s.length < 2) return ""; // 너무 짧은 토큰 제거
  if (/^https?:\/\//i.test(s)) return ""; // URL 제거
  if (/^[0-9]+$/.test(s)) return ""; // 숫자만 제거
  return s;
}

async function loadCsvGroupedBySourceCafeId(csvPath) {
  const abs = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
  const raw = await fs.readFile(abs, "utf8");

  const lines = raw.split(/\r?\n/).filter((x) => x.trim().length > 0);
  if (lines.length < 2) return new Map();

  // BOM 제거
  lines[0] = lines[0].replace(/^\uFEFF/, "");

  // header 확인(예상: cafe_id,name,token,count)
  const header = splitCsvLine(lines[0]).map((x) => normalizeStr(x));
  const idxCafe = header.indexOf("cafe_id");
  const idxToken = header.indexOf("token");
  const idxCount = header.indexOf("count");

  if (idxCafe < 0 || idxToken < 0 || idxCount < 0) {
    throw new Error(`CSV header mismatch. got: ${header.join(",")}`);
  }

  // Map<source_cafe_id, Map<token, count>>
  const grouped = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const sourceCafeId = normalizeStr(cols[idxCafe]);
    const tokenRaw = cols[idxToken];
    const countRaw = cols[idxCount];

    if (!sourceCafeId) continue;

    const token = cleanToken(tokenRaw);
    const cnt = Number(countRaw);

    if (!token) continue;
    if (!Number.isFinite(cnt) || cnt <= 0) continue;

    if (!grouped.has(sourceCafeId)) grouped.set(sourceCafeId, new Map());
    const m = grouped.get(sourceCafeId);
    m.set(token, (m.get(token) || 0) + cnt);
  }

  return grouped;
}

async function loadSourceIdToCafeIdMap() {
  // external_ids_json.source_cafe_id → cafes.cafe_id (숫자 PK) 매핑
  const [rows] = await pool.query(`
    SELECT
      cafe_id,
      JSON_UNQUOTE(JSON_EXTRACT(external_ids_json, '$.source_cafe_id')) AS source_cafe_id
    FROM cafes
    WHERE JSON_EXTRACT(external_ids_json, '$.source_cafe_id') IS NOT NULL
  `);

  const m = new Map();
  for (const r of rows) {
    const cafeId = Number(r.cafe_id);
    const sourceId = normalizeStr(r.source_cafe_id);
    if (Number.isFinite(cafeId) && sourceId) m.set(sourceId, cafeId);
  }
  return m;
}

function buildWordCloudPayload(tokenMap, topN) {
  const arr = Array.from(tokenMap.entries())
    .map(([text, value]) => ({ text: normalizeStr(text), value: Number(value) }))
    .filter((x) => x.text && Number.isFinite(x.value) && x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);

  const topKeywords = arr.map((x) => x.text);

  return {
    keywordCountsJson: JSON.stringify(arr), // [{text,value},...]
    topKeywordsJson: JSON.stringify(topKeywords), // ["말차","소금빵",...]
  };
}

/**
 * ✅ 중복키 에러를 원천 차단하는 방식
 * - cafe_stats에 해당 cafe_id 행이 있으면: "최신 1행"만 UPDATE (워드클라우드 JSON만 갱신)
 * - 없으면: 최소 row INSERT
 *
 * 이 방식은 cafe_stats의 PK가 cafe_id 단일이어도 안전하고,
 * cafe_id별 여러 행을 저장하는 구조여도(스냅샷) 최신 1행만 갱신하므로 안전합니다.
 */
async function updateLatestOrInsert(conn, cafeId, topKeywordsJson, keywordCountsJson, algoVersion) {
  // 1) 최신 1행 UPDATE (있으면 여기서 끝)
  const [u] = await conn.query(
    `
    UPDATE cafe_stats
    SET
      top_keywords_json = ?,
      keyword_counts_json = ?,
      algo_version = ?,
      updated_at = NOW()
    WHERE cafe_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [topKeywordsJson, keywordCountsJson, algoVersion, cafeId]
  );

  if ((u?.affectedRows || 0) > 0) return "updated_latest";

  // 2) stats가 아예 없으면 최소 row INSERT
  const emptyScoreBy = JSON.stringify({});
  const [i] = await conn.query(
    `
    INSERT INTO cafe_stats (
      cafe_id,
      period_start,
      period_end,
      algo_version,
      score_total,
      score_by_category_json,
      review_count_total,
      review_count_recent,
      last_mentioned_at,
      top_keywords_json,
      keyword_counts_json,
      updated_at
    )
    VALUES (?, CURDATE(), CURDATE(), ?, 0, ?, 0, 0, NULL, ?, ?, NOW())
    `,
    [cafeId, algoVersion, emptyScoreBy, topKeywordsJson, keywordCountsJson]
  );

  return (i?.affectedRows || 0) > 0 ? "inserted_new" : "noop";
}

async function main() {
  const { csv, topN, algo, logEach } = parseArgs(process.argv);

  if (!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)) {
    throw new Error("DB env missing. Please set DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.");
  }

  console.log("[1/3] CSV 로딩:", csv);
  const grouped = await loadCsvGroupedBySourceCafeId(csv);
  console.log(" - source_cafe_id 수:", grouped.size);

  console.log("[2/3] cafes 매핑 로딩: external_ids_json.source_cafe_id → cafes.cafe_id");
  const sourceToCafeId = await loadSourceIdToCafeIdMap();
  console.log(" - 매핑 수:", sourceToCafeId.size);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let ok = 0;
    let miss = 0;
    let updated = 0;
    let inserted = 0;

    for (const [sourceId, tokenMap] of grouped.entries()) {
      const cafeId = sourceToCafeId.get(sourceId);
      if (!cafeId) {
        miss++;
        continue;
      }

      const { keywordCountsJson, topKeywordsJson } = buildWordCloudPayload(tokenMap, topN);
      const mode = await updateLatestOrInsert(conn, cafeId, topKeywordsJson, keywordCountsJson, algo);

      ok++;
      if (mode === "updated_latest") updated++;
      else if (mode === "inserted_new") inserted++;

      if (logEach) {
        console.log(` - cafe_id=${cafeId} (source=${sourceId}) => ${mode}`);
      }
    }

    await conn.commit();
    console.log("[3/3] 완료");
    console.log(" - 처리 성공:", ok);
    console.log(" - 최신행 업데이트:", updated);
    console.log(" - 신규 INSERT:", inserted);
    console.log(" - 매핑 실패(스킵):", miss);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

main().catch((e) => {
  console.error("[import_wordcloud] failed:", e?.message || e);
  process.exit(1);
});
