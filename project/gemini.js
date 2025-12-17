// gemini.js
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";

let model = null;
if (apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
} else {
  console.warn("[gemini] GEMINI_API_KEY가 설정되지 않아 규칙 기반만 사용합니다.");
}

/**
 * 1. 규칙 기반 선호 추출
 *    - region, atmosphere, taste, purpose
 *    - menu(소금빵, 케이크 등 구체 메뉴)
 *    - required(주차 가능 등 반드시 필요한 조건)
 *    - minSentiment(0~100, '진짜 맛집만' 같은 표현 있을 때 올림)
 */
function heuristicPreferences(message) {
  const text = (message || "").toString();

  const prefs = {
    region: [],
    atmosphere: [],
    taste: [],
    purpose: [],
    menu: [],
    required: [],
    minSentiment: 0
  };

  // 1) 지역
  if (text.includes("광주")) prefs.region.push("gwangju");
  if (text.includes("나주")) prefs.region.push("naju");
  if (text.includes("담양")) prefs.region.push("damyang");
  if (text.includes("장성")) prefs.region.push("jangseong");
  if (text.includes("화순")) prefs.region.push("hwasoon");

  // 2) 분위기
  const atmosMap = [
    {
      kw: ["사진찍기", "사진 찍기", "사진", "인생샷", "포토존", "뷰맛집"],
      tag: "사진"
    },
    {
      kw: ["감성", "인스타", "예쁜", "힙한"],
      tag: "감성"
    },
    {
      kw: ["조용한", "조용히", "차분한"],
      tag: "조용한"
    },
    {
      kw: ["야경", "강변", "전망", "뷰"],
      tag: "뷰"
    }
  ];
  for (const { kw, tag } of atmosMap) {
    if (kw.some((k) => text.includes(k))) {
      prefs.atmosphere.push(tag);
    }
  }

  // 3) 맛/메뉴(큰 카테고리)
  const tasteMap = [
    {
      kw: ["커피", "아메리카노", "라떼", "원두", "드립"],
      tag: "커피"
    },
    {
      kw: ["디저트", "케이크", "타르트", "베이커리", "빵", "소금빵", "베이글", "크로플", "마카롱"],
      tag: "디저트"
    },
    {
      kw: ["브런치", "식사"],
      tag: "브런치"
    }
  ];
  for (const { kw, tag } of tasteMap) {
    if (kw.some((k) => text.includes(k))) {
      prefs.taste.push(tag);
    }
  }

  // 4) 구체 메뉴 선호 (menu)
  const menuMap = [
    { kw: ["소금빵"], tag: "소금빵" },
    { kw: ["크로플"], tag: "크로플" },
    { kw: ["마카롱"], tag: "마카롱" },
    { kw: ["케이크", "당근케이크", "치즈케이크"], tag: "케이크" },
    { kw: ["타르트"], tag: "타르트" },
    { kw: ["베이글"], tag: "베이글" },
    { kw: ["브라우니"], tag: "브라우니" },
    { kw: ["샌드위치"], tag: "샌드위치" },
    { kw: ["브런치"], tag: "브런치" },
    { kw: ["아메리카노"], tag: "아메리카노" },
    { kw: ["라떼"], tag: "라떼" },
    { kw: ["콜드브루"], tag: "콜드브루" }
  ];
  for (const { kw, tag } of menuMap) {
    if (kw.some((k) => text.includes(k))) {
      prefs.menu.push(tag);
    }
  }

  // 5) 목적
  const purposeMap = [
    {
      kw: ["데이트", "커플", "연인", "남자친구", "여자친구", "소개팅"],
      tag: "데이트"
    },
    {
      kw: ["공부", "과제", "시험", "노트북", "작업", "스터디"],
      tag: "공부"
    },
    {
      kw: ["수다", "이야기"],
      tag: "수다"
    },
    {
      kw: ["산책", "드라이브"],
      tag: "나들이"
    }
  ];
  for (const { kw, tag } of purposeMap) {
    if (kw.some((k) => text.includes(k))) {
      prefs.purpose.push(tag);
    }
  }

  // 6) 필수 조건(required)
  //    - 주차 관련 요구: "주차", "주차장" + "꼭", "필수", "있어야", "편해야", "편했으면"
  if (/(주차|주차장)/.test(text) && /(꼭|필수|있어야|편해야|편했으면|무조건)/.test(text)) {
    prefs.required.push("주차 가능");
  }
  //    - "완전 조용한 곳만", "진짜 조용해야" 같은 표현 → 조용한 필수
  if (/(조용한 곳만|진짜 조용|완전 조용)/.test(text)) {
    prefs.required.push("조용한");
    prefs.atmosphere.push("조용한");
  }

  // 7) 최소 감성 점수(minSentiment)
  //    - "맛집", "진짜 맛있는", "후기 좋은", "실패 없는" 같은 표현이 있으면 70점 이상 요구
  let minSentiment = 0;
  if (/(맛집|존맛|JMT|jmt|찐맛집|진짜 맛있|후기 좋은|평가 좋은|실패 없는)/.test(text)) {
    minSentiment = 70;
  }
  prefs.minSentiment = minSentiment;

  // 8) 중복 제거
  prefs.region = [...new Set(prefs.region)];
  prefs.atmosphere = [...new Set(prefs.atmosphere)];
  prefs.taste = [...new Set(prefs.taste)];
  prefs.purpose = [...new Set(prefs.purpose)];
  prefs.menu = [...new Set(prefs.menu)];
  prefs.required = [...new Set(prefs.required)];

  return prefs;
}

// 배열 병합(중복 제거)
function mergeArr(a = [], b = []) {
  const s = new Set();
  a.forEach((v) => s.add(v));
  b.forEach((v) => s.add(v));
  return Array.from(s);
}

/**
 * 2. Gemini + 규칙 기반으로 선호도 추출
 */
export async function extractPreferences(userMessage) {
  // 1차: 규칙 기반
  const heur = heuristicPreferences(userMessage);

  // API 키 없으면 규칙 기반만
  if (!model) {
    return heur;
  }

  try {
    const prompt = `
사용자의 문장을 보고, 카페 추천 조건을 아래 JSON 형식으로만 추출해줘.
반드시 JSON만 출력하고, 다른 문장은 절대 쓰지 마.

필드 설명:
- region: 사용자가 특정 지역(광주, 나주, 담양, 장성, 화순 등)을 언급하면 배열에 넣어줘. 없으면 [].
  (영문 표기는 gwangju, naju, damyang, janseong, hwasoon 으로 맞춰줘)
- atmosphere: 원하는 분위기 키워드 (예: "사진", "감성", "조용한", "뷰" 등)
- taste: 맛/메뉴 관련 키워드 (예: "커피", "디저트", "빵", "브런치" 등)
- purpose: 목적 관련 키워드 (예: "데이트", "공부", "작업", "수다", "가족" 등)
- menu: 메인 디저트/커피나 브런치 등 구체적인 메뉴 선호 (예: "소금빵", "케이크", "크로플", "아메리카노" 등)
- required: 반드시 갖춰야 하는 조건 (예: "주차 가능", "조용한" 등)
- minSentiment: 0~100 사이 숫자. "진짜 맛집만", "평 좋은 곳"처럼 퀄리티를 강하게 요구하면 70 이상, 그 외에는 0 또는 낮은 값으로.

예시 출력:
{
  "region": ["gwangju"],
  "atmosphere": ["사진", "감성"],
  "taste": ["커피"],
  "purpose": ["데이트"],
  "menu": ["소금빵"],
  "required": ["주차 가능"],
  "minSentiment": 70
}

사용자 문장:
"${userMessage}"
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // JSON만 잘라내기
    let jsonText = text;
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1) {
      jsonText = text.slice(first, last + 1);
    }

    const obj = JSON.parse(jsonText);

    const gem = {
      region: Array.isArray(obj.region) ? obj.region : [],
      atmosphere: Array.isArray(obj.atmosphere) ? obj.atmosphere : [],
      taste: Array.isArray(obj.taste) ? obj.taste : [],
      purpose: Array.isArray(obj.purpose) ? obj.purpose : [],
      menu: Array.isArray(obj.menu) ? obj.menu : [],
      required: Array.isArray(obj.required) ? obj.required : [],
      minSentiment:
        typeof obj.minSentiment === "number"
          ? Math.max(0, Math.min(obj.minSentiment, 100))
          : 0
    };

    // 규칙 + Gemini 결과 합치기
    return {
      region: mergeArr(heur.region, gem.region),
      atmosphere: mergeArr(heur.atmosphere, gem.atmosphere),
      taste: mergeArr(heur.taste, gem.taste),
      purpose: mergeArr(heur.purpose, gem.purpose),
      menu: mergeArr(heur.menu, gem.menu),
      required: mergeArr(heur.required, gem.required),
      minSentiment: Math.max(heur.minSentiment || 0, gem.minSentiment || 0)
    };
  } catch (err) {
    console.warn("[gemini] prefs 추출 실패, 규칙 기반만 사용:", err?.message || err);
    return heur;
  }
}

/**
 * 3. 추천 결과를 자연어 설명으로 만들어주는 함수
 *    (에러나 키 없으면 간단한 문자열만 리턴)
 */
export async function generateRecommendationMessage(userMessage, prefs, results) {
  // 추천이 아예 없으면
  if (!results || results.length === 0) {
    return "조건에 맞는 카페를 찾지 못했어요. 다른 조건으로 다시 한 번 요청해 주세요 :)";
  }

  // API 키 없으면 간단한 설명만 직접 만들기
  if (!model) {
    const names = results.map((c) => c.name).join(", ");
    return `요청해 주신 조건에 맞춰 다음 카페들을 추천드려요: ${names}`;
  }

  // Gemini에 넘겨줄 간단한 정보만 정리
  const simpleResults = results.map((cafe) => ({
    name: cafe.name,
    region: cafe.region,
    address: cafe.address,
    score: cafe.score,
    sentiment: cafe.sent_overall ?? cafe.sentiment ?? cafe.sentiment_score ?? null,
    atmosphere: cafe.atmosphere || cafe.atmosphere_norm || "",
    taste: cafe.taste || cafe.taste_norm || "",
    purpose: cafe.purpose || "",
    menu: cafe.menu || "",
    main_dessert: cafe.main_dessert || "",
    main_coffee: cafe.main_coffee || "",
    parking: cafe.parking || "",
    summary: cafe.summary,
    url: cafe.url
  }));

  const prefsText = JSON.stringify(prefs, null, 2);
  const cafesText = JSON.stringify(simpleResults, null, 2);

  const prompt = `
너는 광주/전남 디저트 카페 추천 챗봇이야.

사용자의 요청:
${userMessage}

추출된 선호도(JSON, region/atmosphere/taste/purpose/menu/required/minSentiment 등이 포함됨):
${prefsText}

추천된 카페 목록(JSON, score 내림차순):
${cafesText}

위 정보를 바탕으로, 한국어로 사용자가 이해하기 쉽도록
1~3문단 정도로 자연스럽게 설명해줘.

조건:
- 반말 말고 존댓말로 말해줘.
- 맨 앞에 "다음 카페들을 추천드릴게요." 같은 한 문장으로 시작해줘.
- 각 카페 이름은 따옴표 없이 그대로 써줘.
- 너무 길게 쓰지 말고, 핵심 특징(위치, 분위기, 커피/디저트 특징, 주차 등) 위주로 요약해줘.
- 마지막에 "자세한 위치는 카카오맵 링크를 참고해 주세요." 한 줄을 붙여줘.
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text;
  } catch (err) {
    console.warn("[gemini] 설명 생성 실패, fallback 사용:", err?.message || err);
    const names = results.map((c) => c.name).join(", ");
    return `요청해 주신 조건에 맞춰 다음 카페들을 추천드려요: ${names}`;
  }
}
