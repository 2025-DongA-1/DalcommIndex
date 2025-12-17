// data.js (최종 형태 확인)

import fs from "fs";
import { parse } from "csv-parse/sync";

function toTagSet(value) {
  if (!value || typeof value !== "string") return new Set();
  return new Set(
    value
      .split("|")
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

function parseBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}

function parseNum(v) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

// ✅ dessert_cafes_gemini.csv 사용
export function loadCafes(csvPath = "dessert_cafes_gemini.csv") {
  const file = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(file, {
    columns: true,
    skip_empty_lines: true
  });

  const cafes = rows.map((row) => {
    // 1) CSV 원본 컬럼 읽기 + ; → | 통일
    const rawAtmosphere =
      (row.atmosphere_norm || row.atmosphere || "").replace(/;/g, "|");
    const rawTaste =
      (row.taste_norm || row.taste || "").replace(/;/g, "|");
    const rawPurpose =
      (row.purpose_norm || row.purpose || "").replace(/;/g, "|");
    const rawCompanion =
      (row.companion_norm || row.companion || "").replace(/;/g, "|");

    // 2) Set로 변환 (필터/점수 계산용)
    const atmosphereSet = toTagSet(rawAtmosphere);
    const tasteSet = toTagSet(rawTaste);
    const purposeSet = toTagSet(rawPurpose);

    return {
      // 기본 정보
      region: row.region || "",
      name: row.name || "",
      address: row.address || "",
      x: parseNum(row.x),
      y: parseNum(row.y),
      url: row.url || "",
      summary: row.summary || "",

      // 태그 (문자열) – 화면 + 응답용
      atmosphere_norm: rawAtmosphere,
      taste_norm: rawTaste,
      purpose_norm: rawPurpose,
      companion_norm: rawCompanion,

      // 태그 Set (매칭용)
      atmosphereSet,
      tasteSet,
      purposeSet,

      // 🍰 메뉴 관련 컬럼들 (그대로 들고 있기)
      menu: row.menu || "",
      main_dessert: row.main_dessert || "",
      main_coffee: row.main_coffee || "",
      parking: row.parking || "",

      // 점수/플래그
      photo_spot_flag: parseBool(row.photo_spot_flag),
      coffee_score: parseNum(row.coffee_score),
      dessert_score: parseNum(row.dessert_score),
      date_score: parseNum(row.date_score),
      study_score: parseNum(row.study_score),
      popularity_score: parseNum(row.popularity_score)
    };
  });

  console.log(`Loaded ${cafes.length} cafes from ${csvPath}`);
  return cafes;
}



