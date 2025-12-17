// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { loadCafes } from "./data.js";
import { recommendCafes } from "./recommend.js";
import { extractPreferences, generateRecommendationMessage } from "./gemini.js";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// 정적 파일(웹 화면) 서빙
app.use(express.static("public"));

// 1) 카페 데이터 로드
const cafes = loadCafes("dessert_cafes_gemini.csv");

// 가게 이름으로 직접 검색 (메시지 안에 카페 이름이 들어있는지 확인)
function searchCafeByName(message, cafes) {
  const text = (message || "").toString().trim();
  if (!text) return [];

  // 공백 제거 + 소문자
  const normalizedMsg = text.replace(/\s+/g, "").toLowerCase();

  return cafes.filter((cafe) => {
    const name = (cafe.name || "").toString().trim();
    if (!name) return false;

    const normalizedName = name.replace(/\s+/g, "").toLowerCase();

    // 메시지 안에 카페 이름이 포함되어 있거나, 반대로 카페 이름 안에 메시지가 포함되면 매칭
    return (
      normalizedMsg.includes(normalizedName) ||
      normalizedName.includes(normalizedMsg)
    );
  });
}

// 2) 라우터

// 헬스체크
app.get("/", (req, res) => {
  res.send("Cafe chatbot server is running 🚀");
});

// (1) 자연어 챗봇 추천
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body || {};
    console.log("💬 user message raw:", message);

    const userMessage =
      typeof message === "string" && message.trim().length > 0
        ? message
        : "광주에서 사진찍기 좋은 분위기의 커피가 맛있는 카페 추천해줘";

    console.log("💬 user message used:", userMessage);
    
    const directMatches = searchCafeByName(userMessage, cafes);

    if (directMatches.length > 0) {
      const recs = directMatches.slice(0, 5);

      const results = recs.map((cafe) => ({
        region: cafe.region,
        name: cafe.name,
        address: cafe.address,
        url: cafe.url,
        score: cafe.score,
        summary: cafe.summary,
        // 컬럼 이름에 맞게 수정 (atmosphere / taste 등)
        atmosphere: cafe.atmosphere || cafe.atmosphere_norm,
        taste: cafe.taste || cafe.taste_norm,
        x: cafe.x,
        y: cafe.y,
        parking: cafe.parking
      }));

      const prefsForMessage = {
        region: [...new Set(recs.map((c) => c.region))],
        atmosphere: [],
        taste: [],
        purpose: []
      };

      let replyMessage = "";

      // 1개만 매칭된 경우: 상세 설명 + 주차 질문 처리
      if (recs.length === 1) {
        const cafe = recs[0];
        const askingParking = userMessage.includes("주차");

        if (askingParking) {
          // "카페하루 주차는 어때?" 같은 질문용
          replyMessage =
            `${cafe.region} ${cafe.name} 주차 정보 알려드릴게요.\n\n` +
            `주차: ${cafe.parking || "주차 정보가 따로 정리되어 있지 않아요."}`;
        } else {
          // 일반적인 "카페하루에 대해 알려줘" 용
          replyMessage =
            `${cafe.region} ${cafe.name}에 대해 알려드릴게요.\n\n` +
            `주소: ${cafe.address}\n` +
            (cafe.atmosphere || cafe.atmosphere_norm
              ? `분위기: ${cafe.atmosphere || cafe.atmosphere_norm}\n`
              : "") +
            (cafe.taste || cafe.menu
              ? `맛/메뉴: ${cafe.taste || cafe.menu}\n`
              : "") +
            (cafe.parking ? `주차: ${cafe.parking}\n` : "") +
            (cafe.summary ? `\n요약: ${cafe.summary}` : "");
        }
      } else {
        // 여러 개 매칭된 경우: 목록 안내
        replyMessage =
          `"${userMessage}"(으)로 이름이 비슷한 카페 ${recs.length}곳을 찾았어요.\n\n` +
          recs
            .map(
              (c, idx) =>
                `${idx + 1}. ${c.region} ${c.name} - ${c.address}${
                  c.parking ? ` (주차: ${c.parking})` : ""
                }`
            )
            .join("\n");
      }

      return res.json({
        message: replyMessage,
        prefs: prefsForMessage,
        results
      });
    }

    const prefs = await extractPreferences(userMessage);
    console.log("✅ prefs:", prefs);

    const recs = recommendCafes(prefs, cafes, 5);
    console.log("✅ 추천 개수:", recs.length);

    const replyMessage = await generateRecommendationMessage(
      userMessage,
      prefs,
      recs
    );

    const results = recs.map((cafe) => ({
      region: cafe.region,
      name: cafe.name,
      address: cafe.address,
      url: cafe.url,
      score: cafe.score,
      summary: cafe.summary,
      atmosphere: cafe.atmosphere_norm,
      purpose: cafe.purpose_norm,
      taste: cafe.taste_norm,
      companion: cafe.companion_norm,

      menu: cafe.menu,
      main_dessert: cafe.main_dessert,
      main_coffee: cafe.main_coffee,
      parking: cafe.parking,

      x: cafe.x,
      y: cafe.y
    }));

    res.json({
      message: replyMessage,
      prefs,
      results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// (2) 지도용 필터 엔드포인트
app.post("/filter", (req, res) => {
  try {
    const prefs = req.body || {};
    // { region: [...], atmosphere: [...], taste: [...], purpose: [...] } 기대

    const recs = recommendCafes(prefs, cafes, 200); // 지도용이라 넉넉하게
    const results = recs.map((cafe) => ({
      region: cafe.region,
      name: cafe.name,
      address: cafe.address,
      url: cafe.url,
      score: cafe.score,
      summary: cafe.summary,
      atmosphere: cafe.atmosphere_norm,
      purpose: cafe.purpose_norm,
      taste: cafe.taste_norm,
      companion: cafe.companion_norm,

      menu: cafe.menu,
      main_dessert: cafe.main_dessert,
      main_coffee: cafe.main_coffee,
      parking: cafe.parking,
      x: cafe.x,
      y: cafe.y
    }));

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Filter internal server error" });
  }
});

// 3) 서버 시작
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
