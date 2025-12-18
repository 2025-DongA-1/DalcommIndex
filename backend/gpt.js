// groq.js  (※ 파일명 유지, 내부를 OpenAI로 교체)
import "dotenv/config";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// (A) 기존과 동일: 규칙 기반(휴리스틱) 유지
function heuristicPreferences(userMessage) {
  const text = (userMessage || "").toString();

  const prefs = {
    region: [],
    atmosphere: [],
    taste: [],
    purpose: [],
    menu: [],
    required: [],
    minSentiment: 0,
  };

  // 지역
  if (/(광주|광주광역시)/.test(text)) prefs.region.push("gwangju");
  if (/나주/.test(text)) prefs.region.push("naju");
  if (/담양/.test(text)) prefs.region.push("damyang");
  if (/장성/.test(text)) prefs.region.push("janseong");
  if (/화순/.test(text)) prefs.region.push("hwasoon");

  // 분위기
  if (/(조용|차분|한적)/.test(text)) prefs.atmosphere.push("조용한");
  if (/(감성|예쁜|인테리어|사진|포토)/.test(text)) prefs.atmosphere.push("감성");
  if (/(뷰|전망)/.test(text)) prefs.atmosphere.push("뷰");

  // 맛/카테고리
  if (/(커피|라떼|아메리카노|핸드드립)/.test(text)) prefs.taste.push("커피");
  if (/(디저트|케이크|빵|베이커리|쿠키|크로플)/.test(text)) prefs.taste.push("디저트");

  // 목적
  if (/(데이트)/.test(text)) prefs.purpose.push("데이트");
  if (/(공부|작업|노트북)/.test(text)) prefs.purpose.push("작업");

  // 구체 메뉴
  const menuCandidates = ["소금빵", "케이크", "크로플", "휘낭시에", "블루베리케이크"];
  for (const m of menuCandidates) if (text.includes(m)) prefs.menu.push(m);

  // 필수조건
  if (/주차/.test(text)) prefs.required.push("주차 가능");
  if (/(조용한 곳만|진짜 조용|완전 조용)/.test(text)) {
    prefs.required.push("조용한");
    prefs.atmosphere.push("조용한");
  }

  if (/(맛집|진짜 맛있|후기 좋은|평가 좋은|실패 없는)/.test(text)) prefs.minSentiment = 70;

  // 중복 제거
  prefs.region = [...new Set(prefs.region)];
  prefs.atmosphere = [...new Set(prefs.atmosphere)];
  prefs.taste = [...new Set(prefs.taste)];
  prefs.purpose = [...new Set(prefs.purpose)];
  prefs.menu = [...new Set(prefs.menu)];
  prefs.required = [...new Set(prefs.required)];

  return prefs;
}

function mergeArr(a = [], b = []) {
  return Array.from(new Set([...a, ...b]));
}

async function openaiChat({ messages, temperature = 0.2, max_completion_tokens = 512, response_format }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");

  const body = {
    model: OPENAI_MODEL,
    messages,
    temperature,
    max_completion_tokens, // Chat Completions에서 권장 파라미터 :contentReference[oaicite:4]{index=4}
  };

  // JSON 강제 모드(가능하면 사용)
  if (response_format) body.response_format = response_format; // :contentReference[oaicite:5]{index=5}

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${t}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

/**
 * 1) OpenAI + 규칙 기반으로 선호도(JSON) 추출
 */
export async function extractPreferences(userMessage) {
  const heur = heuristicPreferences(userMessage);

  // 키 없으면 규칙 기반만으로도 동작
  if (!OPENAI_API_KEY) return heur;

  const prompt = `
사용자의 문장을 보고, 카페 추천 조건을 아래 JSON 형식으로만 추출해줘.
반드시 JSON만 출력하고, 다른 문장은 절대 쓰지 마.

필드:
- region: ["gwangju","naju","damyang","janseong","hwasoon"] 중 해당되는 것만, 없으면 []
- atmosphere: 분위기 키워드 (예: "조용한","감성","사진","뷰")
- taste: 맛/카테고리 키워드 (예: "커피","디저트","빵","브런치")
- purpose: 목적 키워드 (예: "데이트","작업","수다","가족")
- menu: 구체 메뉴명 (예: "소금빵","블루베리케이크")
- required: 필수조건 (예: "주차 가능","조용한")
- minSentiment: 0~100 숫자

사용자 문장:
"${userMessage}"
`.trim();

  try {
    // 1차: JSON mode로 “유효한 JSON” 강제 :contentReference[oaicite:6]{index=6}
    let text;
    try {
      text = await openaiChat({
        messages: [
          { role: "system", content: "You extract structured JSON for cafe recommendation preferences." },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_completion_tokens: 300,
        response_format: { type: "json_object" },
      });
    } catch (e) {
      // 모델/계정 설정에 따라 response_format이 에러날 수 있어 재시도
      text = await openaiChat({
        messages: [
          { role: "system", content: "You extract structured JSON for cafe recommendation preferences." },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_completion_tokens: 300,
      });
    }

    // JSON만 잘라내기
    let jsonText = text;
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1) jsonText = text.slice(first, last + 1);

    const obj = JSON.parse(jsonText);

    const llm = {
      region: Array.isArray(obj.region) ? obj.region : [],
      atmosphere: Array.isArray(obj.atmosphere) ? obj.atmosphere : [],
      taste: Array.isArray(obj.taste) ? obj.taste : [],
      purpose: Array.isArray(obj.purpose) ? obj.purpose : [],
      menu: Array.isArray(obj.menu) ? obj.menu : [],
      required: Array.isArray(obj.required) ? obj.required : [],
      minSentiment: typeof obj.minSentiment === "number" ? Math.max(0, Math.min(obj.minSentiment, 100)) : 0,
    };

    return {
      region: mergeArr(heur.region, llm.region),
      atmosphere: mergeArr(heur.atmosphere, llm.atmosphere),
      taste: mergeArr(heur.taste, llm.taste),
      purpose: mergeArr(heur.purpose, llm.purpose),
      menu: mergeArr(heur.menu, llm.menu),
      required: mergeArr(heur.required, llm.required),
      minSentiment: Math.max(heur.minSentiment || 0, llm.minSentiment || 0),
    };
  } catch (err) {
    console.warn("[openai] prefs 추출 실패, 규칙 기반만 사용:", err?.message || err);
    return heur;
  }
}

/**
 * 2) 추천 결과를 자연어 설명으로 생성
 */
export async function generateRecommendationMessage(userMessage, prefs, results) {
  if (!results || results.length === 0) {
    return "조건에 맞는 카페를 찾지 못했어요. 다른 조건으로 다시 한 번 요청해 주세요 :)";
  }

  if (!OPENAI_API_KEY) {
    const names = results.map((c) => c.name).join(", ");
    return `요청해 주신 조건에 맞춰 다음 카페들을 추천드려요: ${names}`;
  }

  const simpleResults = results.map((cafe) => ({
    name: cafe.name,
    region: cafe.region,
    address: cafe.address,
    score: cafe.score,
    atmosphere: cafe.atmosphere || cafe.atmosphere_norm || "",
    taste: cafe.taste || cafe.taste_norm || "",
    purpose: cafe.purpose || cafe.purpose_norm || "",
    menu: cafe.menu || "",
    main_dessert: cafe.main_dessert || "",
    main_coffee: cafe.main_coffee || "",
    parking: cafe.parking || "",
    summary: cafe.summary || "",
    url: cafe.url || "",
  }));

  const prompt = `
너는 광주/전남 디저트 카페 추천 챗봇이야.

사용자의 요청:
${userMessage}

추출된 선호도(JSON):
${JSON.stringify(prefs, null, 2)}

추천된 카페 목록(JSON, score 내림차순):
${JSON.stringify(simpleResults, null, 2)}

위 정보를 바탕으로, 한국어 존댓말로 1~3문단 정도로 자연스럽게 설명해줘.
- 맨 앞에 "다음 카페들을 추천드릴게요."로 시작
- 핵심 특징(위치, 분위기, 디저트/커피, 주차 등) 위주
`.trim();

  try {
    const text = await openaiChat({
      messages: [
        { role: "system", content: "You are a helpful Korean cafe recommendation assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_completion_tokens: 600,
    });
    return text;
  } catch (err) {
    console.warn("[openai] 설명 생성 실패, fallback 사용:", err?.message || err);
    const names = results.map((c) => c.name).join(", ");
    return `요청해 주신 조건에 맞춰 다음 카페들을 추천드려요: ${names}`;
  }
}
