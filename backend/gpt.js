// gpt.js
import "dotenv/config";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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
    target: null, 
    intent: "recommendation" 
  };

  if (/(광주|광주광역시)/.test(text)) prefs.region.push("gwangju");
  if (/나주/.test(text)) prefs.region.push("naju");
  if (/담양/.test(text)) prefs.region.push("damyang");
  if (/장성/.test(text)) prefs.region.push("jangseong");
  if (/화순/.test(text)) prefs.region.push("hwasun");

  if (/(조용|차분|한적|심플|미니멀)/.test(text)) prefs.atmosphere.push("조용한");
  if (/(감성|감각|아늑|풍미|전통|차분|유럽|무드|모던|잔잔|한옥|미니멀|기와)/.test(text)) prefs.atmosphere.push("감성");
  if (/(편안|포근|상큼|따뜻하다|묵직|한적|안락)/.test(text)) prefs.atmosphere.push("편안한");
  if (/(뷰|전망|통창|테라스)/.test(text)) prefs.atmosphere.push("뷰");
  if (/(포토존|뷰|전망|통창|테라스)/.test(text)) prefs.atmosphere.push("사진");

  if (/(아메리카노|말차|카라멜|라떼|카페라떼|에이드|바닐라빈|밀크티|에스프레소|파르페|콜드브루|딸기라떼)/.test(text)) prefs.taste.push("커피");
  if (/(디저트|케이크|버터|마들렌|쿠키|샌드위치|아이스크림|소금|샐러드|빙수|팥빙수|바닐라|휘낭시에|식빵|파이|타르트|푸딩|토스트|티라미수|베이글|브라우니|잠봉뵈르|크루아상|스콘|와플|젤라또|치즈|팬케이크|에그타르트|크로플|롤케이크)/.test(text)) prefs.taste.push("디저트");
  if (/(브런치|피자|파스타|스테이크|파니니|포케)/.test(text)) prefs.taste.push("브런치");

  if (/(데이트|연인|커플)/.test(text)) prefs.purpose.push("데이트");
  if (/(공부)/.test(text)) prefs.purpose.push("공부");
  if (/(작업|노트북|혼자)/.test(text)) prefs.purpose.push("작업");
  if (/(가족|아기|아이|부모|키즈|어린이|유모차)/.test(text)) prefs.purpose.push("가족");
  if (/(수다|모임)/.test(text)) prefs.purpose.push("모임");

  if (/(달콤|달달하다|단맛)/.test(text)) prefs.purpose.push("달달");
  if (/(짭짤|쌉싸름|쓴맛)/.test(text)) prefs.purpose.push("씁쓸");
  if (/(고소|담백)/.test(text)) prefs.purpose.push("고소");

  if (/주차/.test(text)) prefs.required.push("주차 가능");
  if (/(조용한 곳만|진짜 조용|완전 조용)/.test(text)) {
    prefs.required.push("조용한");
    prefs.atmosphere.push("조용한");
  }

  if (/(맛집|진짜 맛있|후기 좋은|평가 좋은|실패 없는)/.test(text)) prefs.minSentiment = 70;

  if (/(비교|차이|vs)/i.test(text)) {
    prefs.intent = "comparison";
  } else if (/(알려줘|어때|상세|자세히|정보|소개)/.test(text)) {
    prefs.intent = "detail";
  }

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

export async function extractPreferences(userMessage) {
  const heur = heuristicPreferences(userMessage);

  if (!OPENAI_API_KEY || !OPENAI_ENABLED || !OPENAI_PREFS) return heur;

  const prompt = `
사용자의 문장을 분석해 카페 추천 조건을 JSON으로 추출해줘.
JSON만 출력하고 다른 말은 하지 마.

필드 설명:
- target: (문자열) 사용자가 특정 카페 이름을 언급했다면 그 이름을 적어 (없으면 null). 예: "라라브레드", "담다"
- intent: (문자열) "recommendation" (추천요청), "detail" (특정카페 상세정보/알려줘), "comparison" (비교) 중 하나.
- region, atmosphere, taste, purpose, menu, required: 기존과 동일.
- minSentiment: 0~100 숫자

사용자 문장:
"${userMessage}"
  `.trim();

  try {
    let text;
    try {
      text = await openaiChat({
        messages: [
          { role: "system", content: "You extract structured JSON including 'target' and 'intent'." },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_completion_tokens: 300,
        response_format: { type: "json_object" },
      });
    } catch (e) {
      text = await openaiChat({
        messages: [
          { role: "system", content: "You extract structured JSON including 'target' and 'intent'." },
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
      target: obj.target || null,
      intent: obj.intent || "recommendation"
    };

    return {
      region: mergeArr(heur.region, llm.region),
      atmosphere: mergeArr(heur.atmosphere, llm.atmosphere),
      taste: mergeArr(heur.taste, llm.taste),
      purpose: mergeArr(heur.purpose, llm.purpose),
      menu: mergeArr(heur.menu, llm.menu),
      required: mergeArr(heur.required, llm.required),
      minSentiment: Math.max(heur.minSentiment || 0, llm.minSentiment || 0),
      target: llm.target || heur.target,
      intent: llm.intent || heur.intent
    };
  } catch (err) {
    console.warn("[openai] prefs 추출 실패, 규칙 기반만 사용:", err?.message || err);
    return heur;
  }
}

function formatKeywordHits(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return "";
  return hits
    .filter(h => h && typeof h === 'object') 
    .map((h) => `${h.label}(${h.count})`)
    .join(", ");
}

function formatMatchSummary(cafe) {
  const m = cafe?.match || {};
  const parts = [];

  if (Array.isArray(m.atmosphere) && m.atmosphere.length) parts.push(`분위기: ${m.atmosphere.join(", ")}`);
  
  const kh = formatKeywordHits(cafe?.keyword_hits || m.keyword_hits);
  if (kh) parts.push(`키워드: ${kh}`);

  return parts.join(" / ");
}

/**
 * 2) 추천 결과를 자연어 설명으로 생성
 */
export async function generateRecommendationMessage(userMessage, prefs, results) {
  if (!results || results.length === 0) {
    return "요청하신 카페 정보를 찾지 못했어요. 이름을 다시 확인해주시거나 다른 조건을 말씀해 주세요.";
  }

  // OpenAI 비활성 시 fallback
  if (!OPENAI_API_KEY || !OPENAI_ENABLED || !OPENAI_REPLY) {
    const lines = results.map((c, i) => {
      const reason = formatMatchSummary(c);
      return `${i + 1}. ${c.name}${c.address ? ` (${c.address})` : ""}${reason ? `\n   - ${reason}` : ""}`;
    });
    return `검색 결과입니다.\n\n${lines.join("\n")}`;
  }

  const STOP_WORDS = [
    "카페", "디저트", "맛집", "커피", "음료", "광주", "전남", "담양", "나주", "화순", "장성", 
    "추천", "방문", "핫플", "공간", "곳", "분위기", "가게", "식당", "운영", "메뉴", "준비"
  ];

  let simpleResults = [];
  try {
    simpleResults = results.map((cafe) => {
    // 1) 실제 빈도수 데이터(keyword_counts_json) 파싱/정규화
    let hits = [];

    const rawKC = cafe.keyword_counts_json; // string | array | object 가능

    if (rawKC) {
      try {
        const parsed = (typeof rawKC === "string") ? JSON.parse(rawKC) : rawKC;

        if (Array.isArray(parsed)) {
          // [["키워드", 10], ...] 또는 [{text:"키워드", value:10}, ...]
          hits = parsed.map((p) => {
            if (Array.isArray(p)) return { label: p[0], count: Number(p[1]) };
            return { label: p.text || p.keyword, count: Number(p.value ?? p.count) };
          });
        } else if (parsed && typeof parsed === "object") {
          // {"키워드": 10, ...}
          hits = Object.entries(parsed).map(([k, v]) => ({ label: k, count: Number(v) }));
        }
      } catch (e) {
        // 무시하고 다음 단계로
      }
    }

    // 1-b) keyword_hits에 이미 실제 count가 들어오는 경우( recommend.js: {text,value} )도 그대로 사용
    if ((!hits || hits.length === 0) && Array.isArray(cafe.keyword_hits)) {
      hits = cafe.keyword_hits.map((h) => ({
        label: h.label ?? h.text ?? "",
        count: Number(h.count ?? h.value ?? 0),
      }));
    }

    // 최종 필터
    hits = hits.filter((h) => h.label && Number.isFinite(h.count) && h.count > 0);

      // 2. 만약 실제 빈도수가 없으면, 단순 키워드 목록(keyword_hits or keywords)을 사용하여 가상의 빈도수 생성 (Fallback)
      //    (예: 첫 번째 키워드=10회, 두 번째=9회 ... 순서가 중요도이므로)
      const hasRealCounts = hits.some((h) => h.count > 0);

      if (!hasRealCounts) {
        const fallbackSource = Array.isArray(cafe.keywords) ? cafe.keywords : [];
        hits = fallbackSource.map((k, idx) => {
          const label = (typeof k === "string") ? k : (k.label || k.text || "");
          const fakeCount = Math.max(5, 15 - idx);
          return { label, count: fakeCount };
        });
      }

      // 3. 데이터 병합 (hits가 우선)
      const keys = Array.isArray(cafe.keywords) ? cafe.keywords : [];
      // keys에 있는 것들도 일단 후보로 넣되, count가 0이면 아래 로직에서 무시되거나 낮은 점수
      const rawList = [...hits, ...keys.map(k => ({ label: k, count: 0 }))]; 

      // 4. 데이터 정규화 및 불용어 처리
      const normalized = rawList.map(h => {
        if (!h) return { label: "", count: 0 };
        const label = h.label || h.text || h.keyword || (typeof h === 'string' ? h : "");
        const count = Number(h.count || h.value || 0);
        return { label, count };
      });

      const uniqueMap = new Map();
      normalized.forEach(item => {
        if (item.label && !STOP_WORDS.includes(item.label)) {
          const existing = uniqueMap.get(item.label);
          // 기존 것보다 count가 높으면 갱신
          if (!existing || item.count > existing.count) {
            uniqueMap.set(item.label, item);
          }
        }
      });
      
      // 5. 상위 키워드 추출 (이제 count가 무조건 있음)
      const sortedKeywords = Array.from(uniqueMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(item => {
          return item.count > 0 ? `'${item.label}'(${item.count}회)` : `'${item.label}'`;
        });

      // 키워드가 없으면 기본 태그로 대체
      if (sortedKeywords.length === 0) {
         const features = [...(Array.isArray(cafe.atmosphere) ? cafe.atmosphere : []), ...(Array.isArray(cafe.taste) ? cafe.taste : [])];
         const safeFeatures = features.filter(f => !STOP_WORDS.includes(f)).slice(0, 3);
         if (safeFeatures.length > 0) sortedKeywords.push(...safeFeatures.map(f => `'${f}'`));
         else sortedKeywords.push("'인기 있는'");
      }

      const ensureArray = (arr) => Array.isArray(arr) ? arr : [];

      return {
        name: cafe.name,
        why: sortedKeywords.join(", "), 
        atmosphere: ensureArray(cafe.atmosphere).join(", "),
        menu: ensureArray(cafe.menu).slice(0, 5).join(", ")
      };
    });
  } catch (mapErr) {
    console.error("[generateRecommendationMessage] Data mapping error:", mapErr);
    const lines = results.map((c, i) => `${i + 1}. ${c.name}`);
    return `데이터를 정리하는 중 문제가 발생했어요. 목록만 먼저 보여드릴게요.\n\n${lines.join("\n")}`;
  }

  const targetName = prefs?.target || simpleResults.find(r => userMessage.includes(r.name))?.name;
  const userPurpose = Array.isArray(prefs?.purpose) ? prefs.purpose.join(", ") : "";

  let currentIntent = "recommendation";
  if (userMessage.includes("비교") || userMessage.includes("차이")) currentIntent = "comparison";
  else if (targetName && simpleResults.length > 0) currentIntent = "detail";

  // 🔥 [수정] 프롬프트에서 빈도수 언급 강제
  const prompt = `
너는 광주/전남 디저트 카페 전문 챗봇이야.
사용자의 요청과 제공된 데이터를 바탕으로 답변을 작성해.

[사용자 요청]
"${userMessage}"

[데이터]
${JSON.stringify(simpleResults, null, 2)}

[작성 지침]
현재 모드: **${currentIntent}**

1. **Detail 모드 (특정 카페 상세 설명)**:
   - 사용자가 궁금해하는 카페("${targetName || '첫 번째 카페'}")에 대해 집중적으로 설명해.
   - 데이터에 있는 **키워드(why)**, **분위기(atmosphere)**, **메뉴(menu)** 정보를 종합하여 3~4줄의 풍성한 줄글로 소개해.
   - **[필수] 설명 중간에 키워드 빈도수(예: '뷰'(15회))를 괄호와 함께 반드시 명시해.**
   - **다른 카페 추천은 하지 마.**

2. **Comparison 모드 (비교)**:
   - 목록에 있는 카페들의 공통점과 차이점을 분석해줘.
   - 각 카페의 특징적인 키워드와 빈도수를 언급하며 비교해.

3. **Recommendation 모드 (일반 추천)**:
   - 기존처럼 3개의 카페를 번호를 매겨 추천해.
   - **Bullet point** 형식:
     - 특징: ...
     - 추천 이유: ... (1순위 키워드 외에 2~3순위 키워드도 섞어서 작성하며, **빈도수(예: '(15회)')를 반드시 포함해**.)
   - 질문은 절대 하지 마.

4. **공통 사항**:
   - 말투는 친절한 "~해요"체를 사용해.
   - 질문(예: "어떠신가요?")을 절대 덧붙이지 마.
   - 사용자의 목적: ${userPurpose || "없음"}
   - 목적에 포함된 항목(예: '데이트')을 최우선으로 반영해 서술해.
   - 목적이 '데이트'면 '친구/모임/수다/단체' 같은 다른 목적 단어는 사용하지 마.
  `.trim();

  try {
    let text = await openaiChat({
      messages: [
        { role: "system", content: "You are a versatile cafe assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_completion_tokens: 700,
    });
    
    // (질문 제거 로직)
    let lines = text.trim().split('\n');
    while (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (
        lastLine === "" || 
        lastLine.endsWith("?") || 
        lastLine.includes("알려주실") ||
        lastLine.includes("어떠신가요")
      ) {
        lines.pop();
      } else {
        break;
      }
    }
    return lines.join('\n').trim();

  } catch (err) {
    return "죄송해요, 상세 설명을 생성하는 데 문제가 생겼어요. 위 목록을 참고해 주세요.";
  }
}