// data.js (실프로젝트 적용 버전)
// - CSV 경로를 data.js 기준으로 안정적으로 resolve
// - 태그 문자열을 다양한 구분자(| ; / , ·) 기준으로 정규화해서 Set 생성
// - 좌표가 비면 0이 아니라 null로 (프론트에서 !x,!y 체크 시 안전)
// - 카페 id를 (name+address) 기반으로 "항상 같은" 값으로 생성 (DB 연동 전까지 사용)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------
// 1) 유틸
// ------------------------
function normalizeStr(v) {
  return (v ?? "").toString().trim();
}

function parseBool(v) {
  if (typeof v === "boolean") return v;
  const s = normalizeStr(v).toLowerCase();
  return s === "true" || s === "1" || s === "y" || s === "yes";
}

function parseNumOrNull(v) {
  const s = normalizeStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// 간단한 안정 해시(동일 name+address => 동일 id)
function stableIdFromText(text) {
  const str = normalizeStr(text);
  let hash = 2166136261; // FNV-1a 기반 간단 구현
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // 음수 방지 + 짧게
  return `cafe_${(hash >>> 0).toString(16)}`;
}

// 태그 토큰 정규화(필요한 만큼만 가볍게)
function normalizeTagToken(token) {
  let t = normalizeStr(token);
  if (!t) return "";

  // 흔한 표기 흔들림 정리
  t = t.replace(/\s+/g, " "); // 중복공백 정리
  t = t.replace(/사진\s*찍기\s*좋은/gi, "사진");
  t = t.replace(/포토존/gi, "사진");
  t = t.replace(/뷰\s*맛집/gi, "뷰");
  t = t.replace(/작업\s*\/\s*공부/gi, "작업");
  t = t.replace(/공부\s*\/\s*작업/gi, "작업");
  t = t.replace(/브런치류?/gi, "브런치");

  return t;
}

// 다양한 구분자를 | 로 통일 후 Set 생성
function toTagSet(value) {
  const raw = normalizeStr(value);
  if (!raw) return new Set();

  // ; / , · 등 -> |
  const unified = raw
    .replace(/;/g, "|")
    .replace(/\s*\/\s*/g, "|")
    .replace(/,/g, "|")
    .replace(/·/g, "|")
    .replace(/\|+/g, "|");

  const tokens = unified
    .split("|")
    .map(normalizeTagToken)
    .filter(Boolean);

  return new Set(tokens);
}

// ------------------------
// 2) 메인 로더
// ------------------------
export function loadCafes(csvPath = "dessert_cafes_gemini.csv") {
  const absPath = path.isAbsolute(csvPath)
    ? csvPath
    : path.join(__dirname, csvPath);

  if (!fs.existsSync(absPath)) {
    throw new Error(
      `[data.js] CSV 파일을 찾을 수 없습니다: ${absPath}\n` +
        `- 해결: CSV를 data.js와 같은 폴더에 두거나, server.js에서 절대경로로 넘겨주세요.`
    );
  }

  const file = fs.readFileSync(absPath, "utf-8");
  const rows = parse(file, {
    columns: true,
    skip_empty_lines: true,
  });

  const cafes = rows.map((row) => {
    // 컬럼명 흔들림 대비(필요 최소)
    const name = normalizeStr(row.name || row.cafe_name || row.cafeName);
    const address = normalizeStr(row.address || row.addr);

    // 원본 태그 문자열: ; -> | 로 통일 (응답/화면 표시용)
    const rawAtmosphere = normalizeStr(row.atmosphere_norm || row.atmosphere).replace(/;/g, "|");
    const rawTaste = normalizeStr(row.taste_norm || row.taste).replace(/;/g, "|");
    const rawPurpose = normalizeStr(row.purpose_norm || row.purpose).replace(/;/g, "|");
    const rawCompanion = normalizeStr(row.companion_norm || row.companion).replace(/;/g, "|");

    // Set 생성(매칭/점수 계산용)
    const atmosphereSet = toTagSet(rawAtmosphere);
    const tasteSet = toTagSet(rawTaste);
    const purposeSet = toTagSet(rawPurpose);

    // 좌표
    const x = parseNumOrNull(row.x);
    const y = parseNumOrNull(row.y);

    // id 생성(DB 전 단계용)
    const id = normalizeStr(row.cafe_id || row.id) || stableIdFromText(`${name}|${address}`);

    // (선택) 추후 검색/매칭에 쓸 full-text 필드
    const searchText = [
      name,
      address,
      rawAtmosphere,
      rawTaste,
      rawPurpose,
      rawCompanion,
      normalizeStr(row.menu),
      normalizeStr(row.main_dessert),
      normalizeStr(row.main_coffee),
      normalizeStr(row.summary),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      // ✅ 서비스/DB 대비: id 추가
      id,

      // 기본 정보
      region: normalizeStr(row.region), // recommend.js가 사용
      name,
      address,
      x,
      y,
      url: normalizeStr(row.url),
      summary: normalizeStr(row.summary),

      // 태그(문자열) – 응답/화면 표시용
      atmosphere_norm: rawAtmosphere,
      taste_norm: rawTaste,
      purpose_norm: rawPurpose,
      companion_norm: rawCompanion,

      // 태그(Set) – recommend.js 매칭용
      atmosphereSet,
      tasteSet,
      purposeSet,

      // 메뉴 관련
      menu: normalizeStr(row.menu),
      main_dessert: normalizeStr(row.main_dessert),
      main_coffee: normalizeStr(row.main_coffee),
      parking: normalizeStr(row.parking),

      // 점수/플래그
      photo_spot_flag: parseBool(row.photo_spot_flag),
      coffee_score: Number(row.coffee_score || 0) || 0,
      dessert_score: Number(row.dessert_score || 0) || 0,
      date_score: Number(row.date_score || 0) || 0,
      study_score: Number(row.study_score || 0) || 0,
      popularity_score: Number(row.popularity_score || 0) || 0,

      // (선택) 검색용
      searchText,
    };
  });

  console.log(`[data.js] Loaded ${cafes.length} cafes from ${absPath}`);
  return cafes;
}
