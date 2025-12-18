// server.js (프로젝트 적용 버전)
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createMeRouter } from "./me.js";
import authRouter from "./auth.js";

import { loadCafes } from "./data.js";
import { recommendCafes } from "./recommend.js";
import { extractPreferences, generateRecommendationMessage } from "./gpt.js";


const PORT = process.env.PORT || 3000;

const app = express();

// ✅ CORS / JSON
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/auth", authRouter);
app.use("/api", createMeRouter());

// --------------------
// 1) 카페 데이터 로드
// --------------------
const CAFES_CSV = process.env.CAFES_CSV || "dessert_cafes_gemini.csv";

let cafes = [];
try {
  cafes = loadCafes(CAFES_CSV);
  
  console.log(`[server] cafes loaded: ${cafes.length}`);
} catch (e) {
  console.error("[server] failed to load cafes:", e.message);
  // CSV 못 읽으면 서버 의미가 없어서 종료하는 게 안전합니다.
  process.exit(1);
}

// --------------------
// 유틸: 가게 이름 직접 검색
// --------------------
function searchCafeByName(message, cafes) {
  const text = (message || "").toString().trim();
  if (!text) return [];

  const normalizedMsg = text.replace(/\s+/g, "").toLowerCase();

  return cafes.filter((cafe) => {
    const name = (cafe.name || "").toString().trim();
    if (!name) return false;

    const normalizedName = name.replace(/\s+/g, "").toLowerCase();
    return (
      normalizedMsg.includes(normalizedName) ||
      normalizedName.includes(normalizedMsg)
    );
  });
}

function pickCafeResultFields(cafe) {
  return {
    // ✅ 추후 상세/즐겨찾기 대비 id 포함(있으면 내려줌)
    id: cafe.id,

    region: cafe.region,
    name: cafe.name,
    address: cafe.address,
    url: cafe.url,

    // score는 추천에서만 의미가 있어 기본 0 처리
    score: Number.isFinite(Number(cafe.score)) ? cafe.score : 0,

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

// --------------------
// 2) 라우터
// --------------------

// 헬스체크
app.get("/api/health", (req, res) => res.send("OK"));

// (1) 자연어 챗봇 추천
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body || {};
    const userMessage =
      typeof message === "string" && message.trim().length > 0
        ? message.trim()
        : "광주에서 사진찍기 좋은 분위기의 커피가 맛있는 카페 추천해줘";

    console.log("💬 user message:", userMessage);

    // 1) 메시지에 카페 이름이 포함되면 -> “상세/목록” 응답으로 우선 처리
    const directMatches = searchCafeByName(userMessage, cafes);

    if (directMatches.length > 0) {
      const recs = directMatches.slice(0, 5);
      const results = recs.map(pickCafeResultFields);

      const prefsForMessage = {
        region: [...new Set(recs.map((c) => c.region).filter(Boolean))],
        atmosphere: [],
        taste: [],
        purpose: [],
      };

      let replyMessage = "";

      if (recs.length === 1) {
        const cafe = recs[0];
        const askingParking = userMessage.includes("주차");

        if (askingParking) {
          replyMessage =
            `${cafe.region || ""} ${cafe.name} 주차 정보 알려드릴게요.\n\n` +
            `주차: ${cafe.parking || "주차 정보가 따로 정리되어 있지 않아요."}`;
        } else {
          replyMessage =
            `${cafe.region || ""} ${cafe.name}에 대해 알려드릴게요.\n\n` +
            `주소: ${cafe.address || "주소 정보 없음"}\n` +
            ((cafe.atmosphere || cafe.atmosphere_norm)
              ? `분위기: ${cafe.atmosphere || cafe.atmosphere_norm}\n`
              : "") +
            ((cafe.taste || cafe.menu)
              ? `맛/메뉴: ${cafe.taste || cafe.menu}\n`
              : "") +
            (cafe.parking ? `주차: ${cafe.parking}\n` : "") +
            (cafe.summary ? `\n요약: ${cafe.summary}` : "");
        }
      } else {
        replyMessage =
          `"${userMessage}"(으)로 이름이 비슷한 카페 ${recs.length}곳을 찾았어요.\n\n` +
          recs
            .map(
              (c, idx) =>
                `${idx + 1}. ${c.region || ""} ${c.name} - ${c.address || ""}${
                  c.parking ? ` (주차: ${c.parking})` : ""
                }`
            )
            .join("\n");
      }

      return res.json({
        ok: true,
        message: replyMessage,
        prefs: prefsForMessage,
        results,
      });
    }

    // 2) 일반 추천 흐름 (Groq → prefs → recommend)
    let prefs;
    try {
      prefs = await extractPreferences(userMessage);
    } catch (e) {
      console.error("[chat] extractPreferences failed:", e.message);
      // Groq API 문제여도 서버가 죽지 않게 최소 prefs로 진행
      prefs = { region: [], atmosphere: [], taste: [], purpose: [], menu: [], required: [] };
    }
    console.log("✅ prefs:", prefs);

    const recs = recommendCafes(prefs, cafes, 5);
    console.log("✅ 추천 개수:", recs.length);

    let replyMessage;
    try {
      replyMessage = await generateRecommendationMessage(userMessage, prefs, recs);
    } catch (e) {
      console.error("[chat] generateRecommendationMessage failed:", e.message);
      // 메시지 생성 실패 시 기본 텍스트
      replyMessage =
        recs.length > 0
          ? `조건에 맞는 카페 ${recs.length}곳을 찾았어요! 아래 결과를 확인해 주세요.`
          : `조건에 맞는 카페를 찾지 못했어요. 지역/분위기/목적 조건을 조금 완화해보세요.`;
    }

    const results = recs.map(pickCafeResultFields);

    return res.json({
      ok: true,
      message: replyMessage,
      prefs,
      results,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// (2) 지도용 필터
function handleFilter(req, res) {
  try {
    const prefs = req.body || {};
    const recs = recommendCafes(prefs, cafes, 200); // 지도용 넉넉히
    const results = recs.map(pickCafeResultFields);
    return res.json({ ok: true, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Filter internal server error" });
  }
}

// ✅ 프론트가 /filter로 호출해도 되고, /api/filter로 호출해도 되게 “둘 다” 지원
app.post("/filter", handleFilter);
app.post("/api/filter", handleFilter);

// --------------------
// 3) 서버 시작
// --------------------
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`- health:  http://localhost:${PORT}/api/health`);
  console.log(`- chat:    http://localhost:${PORT}/api/chat`);
  console.log(`- filter:  http://localhost:${PORT}/filter  (or /api/filter)`);
});
