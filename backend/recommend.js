// recommend.js (프로젝트 적용용 수정본)
// - Sidebar에서 오는 "사진 / 뷰맛집", "공부 / 작업" 같은 문자열을 분해/정규화해서 매칭률 개선
// - prefs 값이 string/array 섞여도 안전하게 처리
// - 지역 한글 입력도 region 코드와 매칭되게 보강
// - AND 필터 결과 0개일 때 점수 기반 soft fallback (랜덤 금지 유지)

const REGION_KEYWORDS = {
  gwangju: "광주",
  naju: "나주",
  damyang: "담양",
  jangseong: "장성",
  janseong: "장성", // 혹시 기존 오타가 들어와도 처리
  hwasoon: "화순",
  hwasun: "화순",
};

// 한글 지역 → 코드 보강(주소가 비어있는 데이터도 대비)
const REGION_ALIAS_TO_CODE = {
  "광주": "gwangju",
  "광주광역시": "gwangju",
  "나주": "naju",
  "담양": "damyang",
  "장성": "jangseong",
  "화순": "hwasun",
};

function normalizeStr(v) {
  return (v ?? "").toString().trim();
}

function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

// "사진 / 뷰맛집" "공부 / 작업" "가족 / 아이" 등 분해
function splitTokens(v) {
  const s = normalizeStr(v);
  if (!s) return [];
  return s
    .replace(/;/g, "|")
    .replace(/\s*\/\s*/g, "|")
    .replace(/,/g, "|")
    .replace(/·/g, "|")
    .replace(/\|+/g, "|")
    .split("|")
    .map((x) => normalizeStr(x))
    .filter(Boolean);
}

// 태그/키워드 정규화(필요한 것만 최소로)
function normalizeTag(t) {
  let x = normalizeStr(t);
  if (!x) return "";

  // 흔한 표기 흔들림 보정
  x = x.replace(/\s+/g, " ");
  x = x.replace(/뷰맛집/g, "뷰");
  x = x.replace(/포토존/g, "사진");
  x = x.replace(/사진찍기좋은|사진\s*찍기\s*좋은/g, "사진");
  x = x.replace(/작업\s*하기\s*좋은/g, "작업");
  x = x.replace(/공부\s*하기\s*좋은/g, "공부");

  // 목적/메뉴 쪽 흔한 동의어
  if (x === "카페투어") x = "카페 투어";
  if (x === "베이커리") x = "빵";

  return x;
}

// prefs에 들어온 배열/문자열을 -> "정규화된 토큰 배열"로
function normalizePrefList(v) {
  const arr = toArray(v);
  const out = [];
  for (const item of arr) {
    const tokens = splitTokens(item);
    for (const tok of tokens) {
      const n = normalizeTag(tok);
      if (n) out.push(n);
    }
  }
  // 중복 제거
  return [...new Set(out)];
}

function normalizeRegionPrefs(v) {
  const arr = normalizePrefList(v);
  // 지역은 태그 정규화만으로 부족해서(한글/코드 혼재) 한 번 더 보강
  const out = [];
  for (const r of arr) {
    const lower = r.toLowerCase();
    out.push(r);
    if (REGION_ALIAS_TO_CODE[r]) out.push(REGION_ALIAS_TO_CODE[r]);
    // "gwangju" 같은 코드가 오면 그대로
    if (REGION_KEYWORDS[lower]) out.push(lower);
  }
  return [...new Set(out)];
}

// cafe 한 건이 사용자가 원하는 지역에 속하는지 판단
function matchRegion(cafe, regionsPref) {
  if (!regionsPref || regionsPref.length === 0) return true;

  const code = normalizeStr(cafe.region).toLowerCase();
  const addr = normalizeStr(cafe.address);

  for (const pref of regionsPref) {
    const prefRaw = normalizeStr(pref);
    if (!prefRaw) continue;

    const prefLower = prefRaw.toLowerCase();

    // 1) region 코드가 같은 경우
    if (code && code === prefLower) return true;

    // 2) 한글 지역이 들어온 경우 -> 코드로도 비교
    const aliasCode = REGION_ALIAS_TO_CODE[prefRaw];
    if (aliasCode && code === aliasCode) return true;

    // 3) 주소에 한글 지명 포함되는 경우
    const ko = REGION_KEYWORDS[prefLower] || prefRaw;
    if (ko && addr.includes(ko)) return true;
  }
  return false;
}

// 메뉴 키워드(예: 블루베리케이크) 매칭
function matchMenuKeyword(cafe, wantMenu = []) {
  if (!wantMenu || wantMenu.length === 0) return true;

  const hay = [
    cafe.menu,
    cafe.main_dessert,
    cafe.main_coffee,
    cafe.taste_norm,
    cafe.summary,
    cafe.name,
    cafe.address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // 메뉴는 AND (모두 포함)
  return wantMenu.every((m) => {
    const key = normalizeStr(m).toLowerCase();
    if (!key) return true;
    return hay.includes(key);
  });
}

// 필수조건(required) 매칭 (주차/반려동물 등)
function matchRequired(cafe, wantRequired = []) {
  if (!wantRequired || wantRequired.length === 0) return true;

  const parking = normalizeStr(cafe.parking).toLowerCase();
  const companion = normalizeStr(cafe.companion_norm).toLowerCase();

  const hay = [
    cafe.parking,
    cafe.companion_norm,
    cafe.atmosphere_norm,
    cafe.taste_norm,
    cafe.purpose_norm,
    cafe.menu,
    cafe.main_dessert,
    cafe.main_coffee,
    cafe.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return wantRequired.every((r) => {
    const req = normalizeStr(r).toLowerCase();
    if (!req) return true;

    if (req.includes("주차")) {
      if (!parking || parking === "정보 없음") return false;
      if (parking.includes("불가") || parking.includes("없음")) return false;
      return true;
    }

    if (req.includes("반려") || req.includes("애견") || req.includes("펫")) {
      return companion.includes("반려") || companion.includes("애견") || hay.includes("반려");
    }

    if (req.includes("노키즈")) {
      return hay.includes("노키즈");
    }

    return hay.includes(req);
  });
}

// Set 안에 원하는 태그들이 "모두" 포함되어 있는지 검사
function includesAllTags(cafeSet, wantSet) {
  if (!wantSet || wantSet.size === 0) return true;
  if (!cafeSet || cafeSet.size === 0) return false;

  for (const t of wantSet) {
    if (!cafeSet.has(t)) return false;
  }
  return true;
}

export function recommendCafes(prefs, cafes, topK = 5) {
  prefs = prefs || {};
  cafes = Array.isArray(cafes) ? cafes : [];
  topK = Number.isFinite(Number(topK)) ? Math.max(1, Number(topK)) : 5;

  // ✅ 여기서 prefs를 “프로젝트 표준 토큰”으로 정규화
  const regionsPref = normalizeRegionPrefs(prefs.region);
  const wantAtmos = normalizePrefList(prefs.atmosphere);
  const wantTaste = normalizePrefList(prefs.taste);
  const wantPurpose = normalizePrefList(prefs.purpose);
  const wantMenu = normalizePrefList(prefs.menu);        // menu도 구분자/중복 정리
  const wantRequired = normalizePrefList(prefs.required);

  const wantAtmosSet = new Set(wantAtmos);
  const wantTasteSet = new Set(wantTaste);
  const wantPurposeSet = new Set(wantPurpose);

  const hasAnyCondition =
    regionsPref.length ||
    wantAtmos.length ||
    wantTaste.length ||
    wantPurpose.length ||
    wantMenu.length ||
    wantRequired.length;

  // 아무 조건도 못 잡았으면 랜덤 추천 금지
  if (!hasAnyCondition) return [];

  // 1) 지역/메뉴/필수조건 먼저 “강제 필터”
  let candidates = cafes
    .filter((cafe) => matchRegion(cafe, regionsPref))
    .filter((cafe) => matchMenuKeyword(cafe, wantMenu))
    .filter((cafe) => matchRequired(cafe, wantRequired));

  if (candidates.length === 0) return [];

  // 2) 분위기/맛/목적 AND 필터
  const afterAndFilter = candidates.filter((cafe) => {
    const atmosSet = cafe.atmosphereSet || new Set();
    const tasteSet = cafe.tasteSet || new Set();
    const purposeSet = cafe.purposeSet || new Set();

    if (!includesAllTags(atmosSet, wantAtmosSet)) return false;
    if (!includesAllTags(tasteSet, wantTasteSet)) return false;
    if (!includesAllTags(purposeSet, wantPurposeSet)) return false;

    return true;
  });

  // ✅ AND 결과가 0개면: 랜덤 대신 “점수 기반 soft fallback”
  // - 지역/메뉴/필수조건은 이미 필터된 상태이므로 품질 하락을 최소화
  if (afterAndFilter.length > 0) {
    candidates = afterAndFilter;
  }

  // 3) 점수 계산(기존 로직 유지 + 정규화 토큰 기준)
  function scoreCafe(cafe) {
    let score = 0;

    const coffee = Number(cafe.coffee_score || 0);
    const dessert = Number(cafe.dessert_score || 0);
    const date = Number(cafe.date_score || 0);
    const study = Number(cafe.study_score || 0);
    const pop = Number(cafe.popularity_score || 0);

    score += coffee * 0.5;
    score += dessert * 0.3;
    if (cafe.photo_spot_flag) score += 1.0;
    score += pop * 0.1;

    // 분위기 매칭
    if (wantAtmosSet.size) {
      const atmosSet = cafe.atmosphereSet || new Set();
      let matches = 0;
      for (const tag of atmosSet) if (wantAtmosSet.has(tag)) matches++;
      score += matches * 2.0;
      if (cafe.photo_spot_flag && wantAtmosSet.has("사진")) score += 4.0;
      if (wantAtmosSet.has("뷰") && (atmosSet.has("뷰") || atmosSet.has("전망"))) score += 2.0;
    }

    // 맛/메뉴 매칭
    if (wantTasteSet.size) {
      const tasteSet = cafe.tasteSet || new Set();
      let matches = 0;
      for (const tag of tasteSet) if (wantTasteSet.has(tag)) matches++;
      score += matches * 2.0;

      if (wantTasteSet.has("커피") || wantTasteSet.has("커피맛")) score += coffee * 1.5;
      if (wantTasteSet.has("디저트") || wantTasteSet.has("빵")) score += dessert * 1.0;
    }

    // 목적 매칭
    if (wantPurposeSet.size) {
      const purposeSet = cafe.purposeSet || new Set();
      let matches = 0;
      for (const tag of purposeSet) if (wantPurposeSet.has(tag)) matches++;
      score += matches * 2.0;

      if (wantPurposeSet.has("데이트")) score += date * 2.0;
      if (wantPurposeSet.has("공부") || wantPurposeSet.has("작업")) score += study * 1.5;
    }

    // 메뉴 키워드가 들어온 경우(예: 블루베리케이크)는 “정렬”에서 좀 더 우선
    if (wantMenu.length > 0) score += 2.5;

    // 필수조건이 있을수록 조금 우선
    if (wantRequired.length > 0) score += 1.5;

    return score;
  }

  // 서버가 기대하는 형태: “카페 객체 배열”에 score만 붙여서 반환
  return candidates
    .map((cafe) => ({ ...cafe, score: scoreCafe(cafe) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK);
}
