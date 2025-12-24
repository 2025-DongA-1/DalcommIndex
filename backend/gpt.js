// gpt.js  (※ 파일명 유지)
import "dotenv/config";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// OpenAI 호출 토글
// - OPENAI_ENABLED=0  : OpenAI 호출 전부 비활성화(규칙 기반 + 템플릿만 사용)
// - OPENAI_PREFS=1    : 선호도 추출도 OpenAI 사용(기본값 0 → 비용 절감 / 1회 호출 유지)
// - OPENAI_REPLY=0    : 자연어 설명 생성도 OpenAI 비활성화(기본값 1)
const OPENAI_ENABLED = process.env.OPENAI_ENABLED !== "0";
const OPENAI_PREFS = process.env.OPENAI_PREFS === "1";
const OPENAI_REPLY = process.env.OPENAI_REPLY !== "0";

// (A) 규칙 기반(휴리스틱)
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

  // ✅ 지역 (표준 코드로 통일: jangseong / hwasun)
  if (/(광주|광주광역시)/.test(text)) prefs.region.push("gwangju");
  if (/나주/.test(text)) prefs.region.push("naju");
  if (/담양/.test(text)) prefs.region.push("damyang");
  if (/장성/.test(text)) prefs.region.push("jangseong");
  if (/화순/.test(text)) prefs.region.push("hwasun");

  // 분위기
  if (/(조용|차분|한적|심플|미니멀)/.test(text)) prefs.atmosphere.push("조용한");
  if (/(감성|감각|아늑|풍미|전통|차분|유럽|무드|모던|잔잔|한옥|미니멀|기와)/.test(text)) prefs.atmosphere.push("감성");
  if (/(편안|포근|상큼|따뜻하다|묵직|한적|안락)/.test(text)) prefs.atmosphere.push("편안한");
  if (/(뷰|전망|통창|테라스)/.test(text)) prefs.atmosphere.push("뷰");
  if (/(포토존|뷰|전망|통창|테라스)/.test(text)) prefs.atmosphere.push("사진");

  // 메뉴
  if (/(아메리카노|말차|카라멜|라떼|카페라떼|에이드|바닐라빈|밀크티|에스프레소|파르페|카카오파르페|콜드브루|밀크|다크|딸기라떼)/.test(text)) prefs.taste.push("커피");
  if (/(디저트|케이크|버터|마들렌|쿠키|샌드위치|아이스크림|소금|샐러드|빙수|팥빙수| 바닐라|휘낭시에|식빵|파이|카다이프|타르트|푸딩|토스트|티라미수|베이글|브라우니|잠봉뵈르|크루아상|스콘|와플|젤라또|치즈|치즈케이크|팬케이크|애플파이|컵케이크|쫀득쿠키|버터바|에그타르트|크로플|롤케이크|쫀득모찌빵|카타이프)/.test(text)) prefs.taste.push("디저트");
  if (/(브런치|피자|파스타|스테이크|파니니|포케)/.test(text)) prefs.taste.push("브런치");

  // 목적 (공부/작업 분리해서 둘 다 유지)
  if (/(데이트|연인|커플)/.test(text)) prefs.purpose.push("데이트");
  if (/(공부)/.test(text)) prefs.purpose.push("공부");
  if (/(작업|노트북|혼자)/.test(text)) prefs.purpose.push("작업");
  if (/(가족|아기|아이|부모|키즈|어린이|유모차)/.test(text)) prefs.purpose.push("가족");
  if (/(수다|모임)/.test(text)) prefs.purpose.push("모임");

  // 맛
  if (/(달콤|달달하다|단맛)/.test(text)) prefs.purpose.push("달달");
  if (/(짭짤|쌉싸름|쓴맛)/.test(text)) prefs.purpose.push("씁쓸");
  if (/(고소|담백)/.test(text)) prefs.purpose.push("고소");

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

function hasAny(v) {
  return Array.isArray(v) && v.length > 0;
}

// ✅ 연속 대화에서 부족한 조건을 채우기 위한 “후속 질문”
export function buildFollowUpQuestion(prefs) {
  const p = prefs && typeof prefs === "object" ? prefs : {};

  const region = hasAny(p.region);
  const purpose = hasAny(p.purpose);
  const atmos = hasAny(p.atmosphere);
  const taste = hasAny(p.taste);
  const menu = hasAny(p.menu);
  const required = hasAny(p.required);

  if (!region) return "어느 지역을 원하세요? (광주 / 나주 / 담양 / 화순 / 장성)";
  if (!purpose && !atmos) return "어떤 느낌으로 찾으세요? (공부/작업 / 데이트 / 조용한 / 감성 / 뷰)";
  if (!purpose) return "방문 목적이 있으세요? (공부/작업 / 데이트 / 수다 / 가족)";
  if (!atmos) return "원하시는 분위기를 알려주실까요? (조용한 / 감성 / 뷰)";
  if (!menu && !taste) return "원하시는 메뉴/디저트가 있나요? (케이크 / 소금빵 / 크로플 / 휘낭시에)";
  if (!required) return "주차 같은 필수 조건이 있나요? (주차 필요 / 상관없음)";
  return null;
}

async function openaiChat({ messages, temperature = 0.2, max_completion_tokens = 512, response_format }) {
  if (!OPENAI_ENABLED) throw new Error("OpenAI is disabled (OPENAI_ENABLED=0)");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");

  const body = {
    model: OPENAI_MODEL,
    messages,
    temperature,
    max_completion_tokens,
  };
  if (response_format) body.response_format = response_format;

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

  if (!OPENAI_API_KEY || !OPENAI_ENABLED || !OPENAI_PREFS) return heur;

  const prompt = `
사용자의 문장을 보고, 카페 추천 조건을 아래 JSON 형식으로만 추출해줘.
반드시 JSON만 출력하고, 다른 문장은 절대 쓰지 마.

필드:
- region: ["gwangju","naju","damyang","jangseong","hwasun"] 중 해당되는 것만, 없으면 []
- atmosphere: 분위기 키워드 (예: "조용한","감성","사진","뷰")
- taste: 맛/카테고리 키워드 (예: "달콤", "담백", "고소", "쓴맛")
- purpose: 목적 키워드 (예: "데이트","공부","작업","수다","가족")
- menu: 메뉴명 (예: "커피","디저트","빵","브런치", "소금빵","블루베리케이크")
- required: 필수조건 (예: "주차 가능","조용한")
- minSentiment: 0~100 숫자

사용자 문장:
"${userMessage}"
  `.trim();

  try {
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
      text = await openaiChat({
        messages: [
          { role: "system", content: "You extract structured JSON for cafe recommendation preferences." },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_completion_tokens: 300,
      });
    }

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

function formatKeywordHits(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return "";
  return hits.map((h) => `${h.label}(${h.count})`).join(", ");
}

function formatMatchSummary(cafe) {
  const m = cafe?.match || {};
  const parts = [];

  if (Array.isArray(m.atmosphere) && m.atmosphere.length) parts.push(`분위기: ${m.atmosphere.join(", ")}`);
  if (Array.isArray(m.purpose) && m.purpose.length) parts.push(`목적: ${m.purpose.join(", ")}`);
  if (Array.isArray(m.taste) && m.taste.length) parts.push(`맛/카테고리: ${m.taste.join(", ")}`);

  const kh = formatKeywordHits(cafe?.keyword_hits || m.keyword_hits);
  if (kh) parts.push(`리뷰 언급: ${kh}`);

  if (typeof cafe?.parking === "string" && cafe.parking && cafe.parking !== "정보 없음") parts.push(`주차: ${cafe.parking}`);

  return parts.join(" / ");
}

/**
 * 2) 추천 결과를 자연어 설명으로 생성 (+ 부족한 조건에 대한 후속 질문 1개 자동 부착)
 */
export async function generateRecommendationMessage(userMessage, prefs, results) {
  const followUp = buildFollowUpQuestion(prefs);

  if (!results || results.length === 0) {
    const base = "조건에 맞는 카페를 찾지 못했어요. 조건을 조금 바꿔서 다시 말씀해 주세요.";
    return followUp ? `${base}\n\n${followUp}` : base;
  }

  // ✅ OpenAI 비활성/쿼터 문제에서도 “키워드 언급 근거”가 보이도록 fallback 강화
  if (!OPENAI_API_KEY || !OPENAI_ENABLED || !OPENAI_REPLY) {
    const lines = results.map((c, i) => {
      const reason = formatMatchSummary(c);
      return `${i + 1}. ${c.name}${c.address ? ` (${c.address})` : ""}${reason ? `\n   - ${reason}` : ""}`;
    });
    const base = `요청하신 조건과 “리뷰 키워드 언급량”을 기준으로 추천드려요.\n\n${lines.join("\n")}`;
    return followUp ? `${base}\n\n${followUp}` : base;
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
    // ✅ 근거(모델이 “왜 추천인지”를 말로 풀 수 있게)
    why: Array.isArray(cafe.keyword_hits)
      ? cafe.keyword_hits.map((h) => h?.text).filter(Boolean).slice(0, 3)
      : (Array.isArray(cafe.why) ? cafe.why.slice(0, 3) : []),
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
- 반드시 추천 근거를 포함해: match / keyword_hits(리뷰 언급량) 중 적어도 1개는 언급
- 마지막에 질문(후속 질문)은 넣지 마 (질문은 서버가 별도로 붙일 거야)
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
    return followUp ? `${text}\n\n${followUp}` : text;
  } catch (err) {
    console.warn("[openai] 설명 생성 실패, fallback 사용:", err?.message || err);
    const lines = results.map((c, i) => {
      const reason = formatMatchSummary(c);
      return `${i + 1}. ${c.name}${c.address ? ` (${c.address})` : ""}${reason ? `\n   - ${reason}` : ""}`;
    });
    const base = `요청하신 조건과 “리뷰 키워드 언급량”을 기준으로 추천드려요.\n\n${lines.join("\n")}`;
    return followUp ? `${base}\n\n${followUp}` : base;
  }
}
