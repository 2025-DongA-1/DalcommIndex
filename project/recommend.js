// recommend.js

// 지역 코드(영문) → 한글 키워드 매핑 (주소용)
const REGION_KEYWORDS = {
  gwangju: "광주",
  naju: "나주",
  damyang: "담양",
  jangseong: "장성",
  janseong: "장성", // 혹시 기존 오타가 들어와도 처리
  hwasoon: "화순",
  hwasun: "화순" // 혹시 표기 흔들려도 처리
};

function normalizeStr(v) {
  return (v ?? "").toString().trim();
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

    // 2) 주소에 한글 지명 포함되는 경우
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
    cafe.summary
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
    cafe.summary
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return wantRequired.every((r) => {
    const req = normalizeStr(r).toLowerCase();
    if (!req) return true;

    // 자주 쓰는 필수조건은 조금 더 “의미 기반”으로 체크
    if (req.includes("주차")) {
      // "주차 가능"이거나 주차 관련 정보가 있고 불가가 아닌 경우를 통과로
      if (!parking || parking === "정보 없음") return false;
      if (parking.includes("불가")) return false;
      return true;
    }

    if (req.includes("반려") || req.includes("애견") || req.includes("펫")) {
      return companion.includes("반려") || companion.includes("애견") || hay.includes("반려");
    }

    if (req.includes("노키즈")) {
      return hay.includes("노키즈");
    }

    // 그 외는 전체 텍스트에서 포함 여부로 처리
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

  const regionsPref = prefs.region || [];
  const wantAtmos = prefs.atmosphere || [];
  const wantTaste = prefs.taste || [];
  const wantPurpose = prefs.purpose || [];
  const wantMenu = prefs.menu || [];
  const wantRequired = prefs.required || [];

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

  if (afterAndFilter.length === 0) {
    // taste만 선택해서 0개가 된 경우에만 taste 필터 완화
    const onlyTasteSelected =
      wantTasteSet.size > 0 && wantAtmosSet.size === 0 && wantPurposeSet.size === 0;

    if (!onlyTasteSelected) return [];
    // candidates 유지 (단, 지역/메뉴/필수조건은 유지된 상태)
  } else {
    candidates = afterAndFilter;
  }

  // 3) 점수 계산
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
    if (wantMenu && wantMenu.length > 0) score += 2.5;

    // 필수조건이 많을수록 조금 우선
    if (wantRequired && wantRequired.length > 0) score += 1.5;

    return score;
  }

  // ✅ 서버가 기대하는 형태: “카페 객체 배열”에 score만 붙여서 반환
  const scoredCafes = candidates
    .map((cafe) => ({ ...cafe, score: scoreCafe(cafe) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK);

  return scoredCafes;
}
