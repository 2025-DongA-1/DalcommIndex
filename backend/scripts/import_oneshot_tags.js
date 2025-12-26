// scripts/import_oneshot_tags.js
import fs from "fs";
import path from "path";
import { pool } from "../db.js"; // 프로젝트 경로에 맞게 조정

function normName(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()［］\[\]{}]/g, "");
}

function regionAliases(regionLabel) {
  const r = String(regionLabel ?? "").trim();

  // CSV가 "광주 북구" 형태면 "북구"도 후보로 넣기
  const short = r.startsWith("광주 ") ? r.replace(/^광주\s+/, "").trim() : r;

  // DB region 실데이터 기준(당신 출력값)
  const map = {
    // 광주
    "광주 동구": ["동구"],
    "동구": ["동구"],
    "광주 서구": ["서구"],
    "서구": ["서구"],
    "광주 남구": ["남구"],
    "남구": ["남구"],
    "광주 북구": ["북구"],
    "북구": ["북구"],
    "광주 광산구": ["광산구"],
    "광산구": ["광산구"],

    // 기타 지역 (CSV는 '나주/담양/화순'으로 올 가능성이 높음)
    "나주": ["나주시"],
    "나주시": ["나주시"],
    "담양": ["담양군"],
    "담양군": ["담양군"],
    "화순": ["화순군"],
    "화순군": ["화순군"],
  };

  // 후보군: 원문 r, short, 그리고 매핑 결과
  const out = new Set([r, short]);
  (map[r] ?? []).forEach((x) => out.add(x));
  (map[short] ?? []).forEach((x) => out.add(x));

  return [...out].map((x) => String(x).trim()).filter(Boolean);
}

function parseCsvLine(line) {
  // CSV가 표준 형태라고 가정(쉼표/따옴표 포함)
  // Node 내장 CSV 파서가 없으므로, 실무에서는 csv-parse 사용 권장.
  // 여기서는 의존성 없이 빠르게 처리하기 위해 가장 안전한 방법으로: JSON을 쓰지 않는 단순 CSV일 때만 사용하세요.
  // 권장: npm i csv-parse 후 아래 주석의 구현으로 교체.

  throw new Error(
    "이 스크립트는 csv-parse 사용을 권장합니다. 아래 안내대로 csv-parse로 실행하세요."
  );
}

await pool.query("SELECT 1");

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/import_oneshot_tags.js <path/to/all_blog_links_cafe_tags_oneshot.csv>");
    process.exit(1);
  }

  // 1) cafes 전체 로드 → (regionAlias + normName) 매핑 테이블 구성
  const [cafes] = await pool.query(`SELECT cafe_id, name, region FROM cafes`);
  const keyToId = new Map();

  for (const c of cafes) {
    const n = normName(c.name);
    const region = String(c.region ?? "").trim();
    // region이 코드(dong-gu)든 한글(광주 동구)이든 다 잡히게 alias 확장
    const aliases = new Set([region, ...(regionAliases(region))]);

    for (const a of aliases) {
      const k = `${String(a).trim()}::${n}`;
      if (!keyToId.has(k)) keyToId.set(k, Number(c.cafe_id));
    }
  }

  // 2) csv-parse 사용
  const { parse } = await import("csv-parse/sync");
  const raw0 = fs.readFileSync(csvPath, "utf-8");

  // ✅ BOM 제거(가장 중요)
  const raw = raw0.replace(/^\uFEFF/, "");

  // ✅ 헤더도 BOM/공백 제거
  const records = parse(raw, {
    columns: (headers) =>
      headers.map((h) => String(h ?? "").replace(/^\uFEFF/, "").trim()),
    skip_empty_lines: true,
  });

  let ok = 0;
  let miss = 0;

  const misses = [];

  for (const r of records) {
    const region = String(r.region ?? r["\uFEFFregion"] ?? "").trim();
    const name = String(r.name ?? r["\uFEFFname"] ?? "").trim();
    const nKey = normName(name);

    const aliases = regionAliases(region);
    let cafeId = null;
    for (const a of aliases) {
      const k = `${String(a).trim()}::${nKey}`;
      if (keyToId.has(k)) {
        cafeId = keyToId.get(k);
        break;
      }
    }

    if (!cafeId) {
      miss += 1;
      misses.push({ region, name });
      continue;
    }

    await pool.query(
      `
      INSERT INTO cafe_tags
        (cafe_id, theme_raw, dessert_raw, purpose_raw, mood_raw, must_raw)
      VALUES
        (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        theme_raw=VALUES(theme_raw),
        dessert_raw=VALUES(dessert_raw),
        purpose_raw=VALUES(purpose_raw),
        mood_raw=VALUES(mood_raw),
        must_raw=VALUES(must_raw)
      `,
      [
        cafeId,
        r.theme ?? null,
        r.dessert ?? null,
        r.purpose ?? null,
        r.mood ?? null,
        r.must ?? null,
      ]
    );

    ok += 1;
  }

  console.log(`[import oneshot] OK=${ok}, MISS=${miss}`);
  if (misses.length) {
    const out = path.resolve(process.cwd(), "oneshot_misses.json");
    fs.writeFileSync(out, JSON.stringify(misses, null, 2), "utf-8");
    console.log(`Miss list written: ${out}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
