// recommend.js (키워드 언급량 기반 추천 강화 버전)
// - Sidebar에서 오는 "사진 / 뷰맛집", "공부 / 작업" 같은 문자열을 분해/정규화해서 매칭률 개선
// - prefs 값이 string/array 섞여도 안전하게 처리
// - 지역 한글 입력도 region 코드와 매칭되게 보강
// - AND 필터 결과 0개일 때 점수 기반 soft fallback (랜덤 금지 유지)
// - ✅ cafe_stats.keyword_counts_json(리뷰 키워드 언급량)을 점수에 반영 + 근거(keyword_hits) 반환

const REGION_KEYWORDS = {
  gwangju: "광주",
  naju: "나주",
  damyang: "담양",
  jangseong: "장성",
  janseong: "장성", // 오타/레거시 처리
  hwasun: "화순",
  hwasoon: "화순", // 오타/레거시 처리
};

// 한글 지역 → 코드 보강(주소가 비어있는 데이터도 대비)
const REGION_ALIAS_TO_CODE = {
  광주: "gwangju",
  광주광역시: "gwangju",
  나주: "naju",
  담양: "damyang",
  장성: "jangseong",
  화순: "hwasun",

  // ✅ 레거시 코드/오타 보정
  janseong: "jangseong",
  hwasoon: "hwasun",
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

function buildMentionCountMap(cafe) {
  const raw = cafe?.keyword_counts_json;
  const m = new Map();

  // 1) keyword_counts_json: [{text,value}] or {token:count}
  if (Array.isArray(raw)) {
    for (const it of raw) {
      const k = normalizeTag(it?.text);
      const v = Number(it?.value);
      if (!k || !Number.isFinite(v) || v <= 0) continue;
      m.set(k, (m.get(k) || 0) + v);
    }
  } else if (raw && typeof raw === "object") {
    for (const [k0, v0] of Object.entries(raw)) {
      const k = normalizeTag(k0);
      const v = Number(v0);
      if (!k || !Number.isFinite(v) || v <= 0) continue;
      m.set(k, (m.get(k) || 0) + v);
    }
  }

  // 2) top_keywords fallback(언급량이 없을 때 최소한의 근거)
  const top = Array.isArray(cafe?.top_keywords) ? cafe.top_keywords : [];
  if (top.length) {
    // 상위일수록 가중치를 조금 더 줌(가짜 count)
    let w = Math.min(10, top.length + 2);
    for (const t of top) {
      const k = normalizeTag(t);
      if (!k) continue;
      if (!m.has(k)) m.set(k, w);
      w = Math.max(1, w - 1);
    }
  }

  return m;
}

function computeMentionEvidence(cafe, weightedWants, maxHits = 5) {
  const m = buildMentionCountMap(cafe);
  if (!m.size || !weightedWants.length) return { mentionScore: 0, hits: [] };

  let mentionScore = 0;
  const hits = [];

  for (const { token, w } of weightedWants) {
    const key = normalizeTag(token);
    if (!key || key.length < 2) continue;

   // exact
    let bestKey = null;
    let bestCount = 0;
    if (m.has(key)) {
      bestKey = key;
      bestCount = m.get(key) || 0;
    } else {
      // partial(너무 짧은 토큰은 제외)
      for (const [k, c] of m.entries()) {
        if (k === key) continue;
        if (k.includes(key) || key.includes(k)) {
          if (c > bestCount) {
            bestKey = k;
            bestCount = c;
          }
        }
      }
    }

    if (bestKey && bestCount > 0) {
      // log 스케일로 과도한 쏠림 방지
     const add = w * Math.log1p(bestCount);
      mentionScore += add;
      hits.push({ text: bestKey, value: bestCount });
    }
  }

  hits.sort((a, b) => (b.value || 0) - (a.value || 0));
  return { mentionScore, hits: hits.slice(0, maxHits) };
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
  const out = [];
  for (const r of arr) {
    const lower = r.toLowerCase();
    out.push(r);

    if (REGION_ALIAS_TO_CODE[r]) out.push(REGION_ALIAS_TO_CODE[r]);
    if (REGION_KEYWORDS[lower]) out.push(lower);

    // ✅ 레거시 코드/오타 → 표준 코드 보강
    if (REGION_ALIAS_TO_CODE[lower]) out.push(REGION_ALIAS_TO_CODE[lower]);
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

    // 2) alias(오타/레거시 포함) → 표준 코드로도 비교
    const aliasCode = REGION_ALIAS_TO_CODE[prefRaw] || REGION_ALIAS_TO_CODE[prefLower];
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
    cafe.keywords_text,
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
  const wantMenu = normalizePrefList(prefs.menu);
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
    const atmosSet = new Set([...(cafe.atmosphereSet || new Set())].map(normalizeTag).filter(Boolean));
    const tasteSet = new Set([...(cafe.tasteSet || new Set())].map(normalizeTag).filter(Boolean));
    const purposeSet = new Set([...(cafe.purposeSet || new Set())].map(normalizeTag).filter(Boolean));
    if (!includesAllTags(atmosSet, wantAtmosSet)) return false;
    if (!includesAllTags(tasteSet, wantTasteSet)) return false;
    if (!includesAllTags(purposeSet, wantPurposeSet)) return false;

    return true;
  });

  // ✅ AND 결과가 0개면: 랜덤 대신 “점수 기반 soft fallback”
  if (afterAndFilter.length > 0) {
    candidates = afterAndFilter;
  }

  function scoreCafeDetailed(cafe) {
    let score = 0;

    const match = {
      atmosphere: [],
      taste: [],
      purpose: [],
      menu: wantMenu.slice(),
      required: wantRequired.slice(),
      keyword_hits: [],
    };

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
      const atmosSet = new Set([...(cafe.atmosphereSet || new Set())].map(normalizeTag).filter(Boolean));
      let matches = 0;
      for (const tag of atmosSet) {
        if (wantAtmosSet.has(tag)) {
          matches++;
          match.atmosphere.push(tag);
        }
      }
      score += matches * 2.0;
      if (cafe.photo_spot_flag && wantAtmosSet.has("사진")) score += 4.0;
      if (wantAtmosSet.has("뷰") && (atmosSet.has("뷰") || atmosSet.has("전망"))) score += 2.0;
    }

    // 맛/메뉴 매칭
    if (wantTasteSet.size) {
      const tasteSet = new Set([...(cafe.tasteSet || new Set())].map(normalizeTag).filter(Boolean));
      let matches = 0;
      for (const tag of tasteSet) {
        if (wantTasteSet.has(tag)) {
          matches++;
          match.taste.push(tag);
        }
      }
      score += matches * 2.0;

      if (wantTasteSet.has("커피") || wantTasteSet.has("커피맛")) score += coffee * 1.5;
      if (wantTasteSet.has("디저트") || wantTasteSet.has("빵")) score += dessert * 1.0;
    }

    // 목적 매칭
    if (wantPurposeSet.size) {
      const purposeSet = new Set([...(cafe.purposeSet || new Set())].map(normalizeTag).filter(Boolean));
      let matches = 0;
      for (const tag of purposeSet) {
        if (wantPurposeSet.has(tag)) {
          matches++;
          match.purpose.push(tag);
        }
      }
      score += matches * 2.0;

      if (wantPurposeSet.has("데이트")) score += date * 2.0;
      if (wantPurposeSet.has("공부") || wantPurposeSet.has("작업")) score += study * 1.5;
    }

    // 메뉴 키워드가 들어온 경우(예: 블루베리케이크)는 “정렬”에서 조금 우선
    if (wantMenu.length > 0) score += 2.5;

    // 필수조건이 있을수록 조금 우선
    if (wantRequired.length > 0) score += 1.5;

    // ✅ 언급량 기반 점수(핵심)
    const weightedWants = [
      ...wantMenu.map((t) => ({ token: t, w: 1.5 })),
      ...wantTaste.map((t) => ({ token: t, w: 1.2 })),
      ...wantAtmos.map((t) => ({ token: t, w: 1.0 })),
      ...wantPurpose.map((t) => ({ token: t, w: 1.0 })),
      ...wantRequired.map((t) => ({ token: t, w: 0.7 })),
    ];
    const { mentionScore, hits } = computeMentionEvidence(cafe, weightedWants, 5);

    // mentionScore가 전체를 집어삼키지 않도록 클리핑 + 가중치
    const clipped = Math.min(20, mentionScore);
    score += clipped * 0.8;

    return { totalScore: score, mention_score: clipped, keyword_hits: hits };
   }

    // 중복 제거(보기용)
  //   match.atmosphere = [...new Set(match.atmosphere)];
  //   match.taste = [...new Set(match.taste)];
  //   match.purpose = [...new Set(match.purpose)];

  //   return { score, match, keyword_hits: match.keyword_hits };
  // }

  // 서버가 기대하는 형태: “카페 객체 배열”에 score + match/근거 붙여서 반환
  return candidates
    .map((cafe) => {
      const d = scoreCafeDetailed(cafe);
      return { ...cafe, score: d.totalScore, mention_score: d.mention_score, keyword_hits: d.keyword_hits };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK);
}
