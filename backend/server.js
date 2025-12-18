// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter from "./auth.js";
import { createMeRouter } from "./me.js";

import { loadCafes } from "./data.js";
import { recommendCafes } from "./recommend.js";
import { extractPreferences, generateRecommendationMessage } from "./gpt.js";

const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * ✅ 핵심: /auth, /api 라우터는 "카페 CSV"와 무관하게 항상 등록
 * - 그래야 카페 데이터가 아직 없어도 로그인/마이페이지가 정상 동작합니다.
 */
app.use("/auth", authRouter);
app.use("/api", createMeRouter());

/**
 * 카페 데이터는 "있으면 로드", 없으면 빈 배열로 계속 진행
 */
const CAFES_CSV = process.env.CAFES_CSV || "dessert_cafes_gemini.csv";
let cafes = [];
let cafesLoadedFrom = null;

try {
  cafes = loadCafes(CAFES_CSV);
  cafesLoadedFrom = CAFES_CSV;
  console.log(`[server] cafes loaded: ${cafes.length} (${CAFES_CSV})`);
} catch (e) {
  cafes = [];
  cafesLoadedFrom = null;
  console.warn("[server] cafes csv not ready yet. continue with empty cafes.");
  console.warn("        reason:", e.message);
}

/* 챗봇 테스트용 */
const CHATBOT_MOCK = process.env.CHATBOT_MOCK === "1";

const mockCafes = [
  {
    id: "mock_1",
    region: "gwangju",
    name: "(샘플) 달콤정원",
    address: "광주 서구 상무대로 123",
    url: "https://place.map.kakao.com/",
    summary: "조용하고 감성적인 분위기에서 케이크가 인기인 카페입니다.",
    atmosphere_norm: "조용한|감성|사진",
    taste_norm: "디저트|커피",
    purpose_norm: "데이트|작업",
    companion_norm: "친구|연인",
    atmosphereSet: new Set(["조용한", "감성", "사진"]),
    tasteSet: new Set(["디저트", "커피"]),
    purposeSet: new Set(["데이트", "작업"]),
    menu: "케이크, 휘낭시에",
    main_dessert: "케이크",
    main_coffee: "라떼",
    parking: "가능",
    photo_spot_flag: true,
    coffee_score: 4.2,
    dessert_score: 4.6,
    date_score: 4.5,
    study_score: 4.0,
    popularity_score: 80,
    x: null,
    y: null,
  },
  {
    id: "mock_2",
    region: "naju",
    name: "(샘플) 나주베이크",
    address: "전남 나주시 빛가람로 45",
    url: "https://place.map.kakao.com/",
    summary: "빵/디저트 종류가 다양하고 주차가 편한 편입니다.",
    atmosphere_norm: "넓은|쾌적",
    taste_norm: "빵|디저트",
    purpose_norm: "가족|수다",
    companion_norm: "가족|친구",
    atmosphereSet: new Set(["넓은", "쾌적"]),
    tasteSet: new Set(["빵", "디저트"]),
    purposeSet: new Set(["가족", "수다"]),
    menu: "소금빵, 스콘",
    main_dessert: "소금빵",
    main_coffee: "아메리카노",
    parking: "가능",
    photo_spot_flag: false,
    coffee_score: 3.8,
    dessert_score: 4.4,
    date_score: 3.6,
    study_score: 3.4,
    popularity_score: 60,
    x: null,
    y: null,
  },
];

/** 헬스/상태 */
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/status", (req, res) =>
  res.json({
    ok: true,
    cafesCount: cafes.length,
    cafesLoadedFrom,
    db: {
      configured: !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME),
    },
  })
);

function pickCafeResultFields(cafe) {
  return {
    id: cafe.id,
    region: cafe.region,
    name: cafe.name,
    address: cafe.address,
    url: cafe.url,
    score: Number.isFinite(Number(cafe.score)) ? Number(cafe.score) : 0,
    summary: cafe.summary,
    atmosphere: cafe.atmosphere || cafe.atmosphere_norm,
    purpose: cafe.purpose || cafe.purpose_norm,
    taste: cafe.taste || cafe.taste_norm,
    companion: cafe.companion || cafe.companion_norm,
    menu: cafe.menu,
    main_dessert: cafe.main_dessert,
    main_coffee: cafe.main_coffee,
    parking: cafe.parking,
    x: cafe.x,
    y: cafe.y,
  };
}

/** 지도 필터 */
function handleFilter(req, res) {
  try {
    if (!cafes.length) {
      return res.json({
        ok: true,
        results: [],
        warning: "카페 데이터(CSV/DB)가 아직 준비되지 않았습니다.",
      });
    }
    const prefs = req.body || {};
    const recs = recommendCafes(prefs, cafes, 200);
    return res.json({ ok: true, results: recs.map(pickCafeResultFields) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Filter internal server error" });
  }
}

// 프론트가 /filter 또는 /api/filter로 호출해도 둘 다 OK
app.post("/filter", handleFilter);
app.post("/api/filter", handleFilter);

/** 챗봇 추천 */
app.post("/api/chat", async (req, res) => {
  try {
    // ✅ 데이터셋 결정: CSV/DB 있으면 그걸 쓰고, 없으면(원할 때만) mock 사용
    const cafesForChat = cafes.length ? cafes : CHATBOT_MOCK ? mockCafes : [];
    const warning =
      cafes.length ? null : CHATBOT_MOCK ? "현재 카페 데이터가 없어 샘플 데이터로 응답 중입니다. (CHATBOT_MOCK=1)" : null;

    if (!cafesForChat.length) {
      return res.json({
        ok: true,
        message: "아직 카페 데이터(CSV/DB)가 준비되지 않았습니다. 우선 챗봇 연결만 확인하려면 .env에 CHATBOT_MOCK=1을 넣어주세요.",
        prefs: {},
        results: [],
      });
    }

    const { message } = req.body || {};
    const userMessage =
      typeof message === "string" && message.trim() ? message.trim() : "광주 분위기 좋은 카페 추천해줘";

    let prefs;
    try {
      prefs = await extractPreferences(userMessage);
    } catch (e) {
      prefs = { region: [], atmosphere: [], taste: [], purpose: [], menu: [], required: [] };
    }

    const recs = recommendCafes(prefs, cafesForChat, 5);

    let replyMessage;
    try {
      replyMessage = await generateRecommendationMessage(userMessage, prefs, recs);
    } catch {
      replyMessage =
        recs.length > 0
          ? `조건에 맞는 카페 ${recs.length}곳을 찾았어요. 아래 결과를 확인해 주세요.`
          : `조건에 맞는 카페를 찾지 못했어요. 조건을 조금 완화해보세요.`;
    }

    return res.json({
      ok: true,
      warning,
      message: replyMessage,
      prefs,
      results: recs.map(pickCafeResultFields),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
});

/** ✅ /api, /auth는 404도 JSON으로 반환 (프론트에서 파싱 안정) */
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
    return res.status(404).json({ ok: false, message: "Not Found" });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`- status:  http://localhost:${PORT}/api/status`);
  console.log(`- me:      http://localhost:${PORT}/api/me`);
});
