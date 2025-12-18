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
    if (!cafes.length) {
      return res.json({
        ok: true,
        message: "아직 카페 데이터가 준비되지 않았습니다. (CSV/DB 연결 후 추천이 가능합니다.)",
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
      // LLM 키/연결 문제여도 서버는 죽지 않게
      prefs = { region: [], atmosphere: [], taste: [], purpose: [], menu: [], required: [] };
    }

    const recs = recommendCafes(prefs, cafes, 5);
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
