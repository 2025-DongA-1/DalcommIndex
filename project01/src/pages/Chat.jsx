import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Chat = () => {
  const API_BASE = import.meta.env.VITE_API_BASE || "";
  
  // ✅ 연속 대화(컨텍스트 유지)용: 같은 탭/페이지에서 고정 sessionId 유지
  const sessionIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sid_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
  const [prevPrefs, setPrevPrefs] = useState(null);

  async function apiFetch(path, { method = "POST", body } = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "요청 실패");
    return data;
  }

  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const onChipClick = (text) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onKeywordClick = (kw) => {
  setInput((prev) => {
    const p = (prev || "").trim();
    return p ? `${p} ${kw}` : kw;   // ✅ 여러 개 누르면 이어 붙음
  });
  setTimeout(() => inputRef.current?.focus(), 0);
};

  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // ✅ 연속 대화(컨텍스트) 유지용: 서버가 내려준 prefs를 저장했다가 다음 요청에 함께 전송
  const [chatPrefs, setChatPrefs] = useState(null);

  // ✅ 탭(세션) 단위로 유지되는 sessionId (새로고침해도 유지)
  const [chatSessionId] = useState(() => {
    const key = "dalcomm_chat_session_id";
    try {
      let v = sessionStorage.getItem(key);
      if (!v) {
        v = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`);
        sessionStorage.setItem(key, v);
      }
      return v;
    } catch {
      // sessionStorage가 막힌 환경 대비
      return (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`);
    }
  });

  const formatNow = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `오늘 · ${hh}:${mm}`;
  };

  const formatToday = () => {
    const d = new Date();
    const week = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd} (${week})`;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const now = formatNow();

    // 1) 사용자 메시지 추가
    setMessages((prev) => [...prev, { sender: "user", text, time: now }]);
    setInput("");
    setIsSending(true);
    setTimeout(() => inputRef.current?.focus(), 0);

    // 2) 봇 “대기 메시지”
    const pendingId = `pending_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        sender: "bot",
        text: "답변을 생성 중입니다…",
        time: formatNow(),
        pending: true,
      },
    ]);

    try {
      const data = await apiFetch("/api/chat", {
        method: "POST",
        body: {
          message: text,
          sessionId: sessionIdRef.current,
          prevPrefs: prevPrefs || undefined,
        },
      });

      if (data?.sessionId) sessionIdRef.current = data.sessionId;
      if (data?.prefs) setPrevPrefs(data.prefs);

      const botText = (data?.message || "응답을 받지 못했습니다.").toString();
      const results = Array.isArray(data?.results) ? data.results : [];
      const warning = data?.warning || "";

      // 3) pending 메시지를 실제 답변으로 교체
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { ...m, pending: false, text: botText, results, warning } : m
        )
      );
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, pending: false, text: `오류가 발생했어요: ${e?.message || e}` }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const canOpenMap = (cafe) =>
    Number.isFinite(Number(cafe?.x ?? cafe?.lon)) &&
    Number.isFinite(Number(cafe?.y ?? cafe?.lat));

  return (
    <>
      <style>
        {`
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap");

* { box-sizing: border-box; margin: 0; padding: 0; }

.chat-page {
  height: 100dvh;          /* ✅ 화면 높이를 '고정' */
  height: 100vh;           /* (구형 브라우저 fallback) */
  font-family: "Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  background: white;
  color: #111827;
  display: flex;
  justify-content: center;
  align-items: stretch;     /* ✅ center → stretch (중요) */
  padding: 24px;
  overflow: hidden;         /* ✅ 페이지(바깥) 스크롤이 아니라 내부에서만 */
}


.app-shell {
  width: 100%;
  max-width: 1200px;

  height: 100%;       /* ✅ chat-page(100vh) 안을 꽉 채움 */
  min-height: 0;      /* ✅ 내부 스크롤 계산 핵심 */
  overflow: hidden;   /* ✅ 바깥으로 늘어나지 않게 */

  background: rgba(255, 255, 255, 0.9);
  border-radius: 26px;
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  padding: 18px 22px 20px;
}


.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
}

.brand { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.logo-mark { width: 42px; height: 42px; object-fit: contain; border-radius: 10px; }

.brand-text-main { font-size: 28px; font-weight: 700; }
.brand-text-sub { font-size: 12px; color: #9ca3af; }

.nav-buttons { display: flex; gap: 8px; align-items: center; }

.pill-btn {
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 8px 13px;
  font-size: 16px;
  cursor: pointer;
  background: transparent;
  white-space: nowrap;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.pill-btn.ghost {
  background: #ffffff;
  border-color: #e5e7eb;
  color: #374151;
}

.pill-btn.ghost:hover {
  background: #f3f4ff;
  box-shadow: 0 8px 20px rgba(148, 163, 184, 0.35);
}

.chat-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 4fr 1fr;
  gap: 14px;
  margin-top: 8px;

   min-height: 0;      /* ✅ 추가 */
  overflow: hidden;   /* ✅ 추가 */
}

.chat-panel {
  padding: 16px 16px 14px;
  border-radius: 20px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
   min-height: 0;
    min-height: 0;     /* ✅ 추가 */
  overflow: hidden;  /* ✅ 추가 */
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.bot-info { display: flex; align-items: center; gap: 10px; }
.bot-avatar {
  width: 34px; height: 34px; border-radius: 14px;
  background: linear-gradient(135deg, #4f46e5, #ec4899);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 18px;
}
.bot-text-main { font-size: 14px; font-weight: 600; }

.status-wrap { display: flex; align-items: center; gap: 6px; }
.status-dot {
  width: 8px; height: 8px; border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18);
}
.status-text { font-size: 11px; color: #6b7280; }

.chat-body {
  flex: 1;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  padding: 10px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
   min-height: 0;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
  min-height: 0;

}

.bubble-row { display: flex; align-items: flex-end; gap: 6px; width: 100%; }
.bubble-row.user { justify-content: flex-end; width: 100%; }

.bubble {
  max-width: 80%;
  padding: 8px 11px;
  border-radius: 16px;
  font-size: 16px;
  line-height: 1.5;
}

.bubble.bot { background: #f3f4ff; color: #111827; border-radius: 16px 16px 16px 4px; }
.bubble.user { background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff; border-radius: 16px 16px 4px 16px; }

.time { font-size: 10px; color: #9ca3af; margin-top: 1px; }
.time.user { text-align: right; }

.hint-text{
  margin-top: 18px;
  margin-bottom: -10px;
  font-size: 13px;
  color:#9ca3af;
  font-weight: 400;
  line-height: 1.4;
}

.quick-chips{ display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 6px 2px; }
.quick-chip{
  border: 1px solid #e5e7eb;
  background: #f3f4ff;
  color: #374151;
  font-size: 12px;
  padding: 7px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.quick-chip:hover{ filter: brightness(0.98); }

.chat-input-bar { margin-top: 10px; display: flex; align-items: center; gap: 8px; }

.chat-input-wrapper {
  flex: 1;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.chat-input-wrapper:focus-within {
  border-color: #4f46e5;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
}

.chat-placeholder-icon { font-size: 16px; opacity: 0.5; }

.chat-input-field {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: 13px;
}

.send-btn {
  border-radius: 999px;
  border: none;
  padding: 9px 13px;
  font-size: 13px;
  cursor: pointer;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 12px 26px rgba(59, 130, 246, 0.5);
}
.send-btn:hover { filter: brightness(1.05); }
.send-btn:disabled { opacity: 0.6; cursor: not-allowed; filter: none; box-shadow: none; }

.side-panel {
  padding: 14px 14px 12px;
  border-radius: 20px;
  background: #f8f4f0ff;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.side-title { font-size: 15px; font-weight: 600; color: #4b5563; margin-bottom: 4px; }

.example-list {
  list-style: none;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
  background: #f9fafb;
  border-radius: 12px;
  padding: 8px 10px;
  border: 1px dashed #e5e7eb;
}
.example-list li + li { margin-top: 2px; }
.example-list li{ cursor: pointer; font-weight: 400; transition: font-weight 0.15s ease, color 0.15s ease; }
.example-list li:hover{ font-weight: 700; color: #111827; }

.tag-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-chip { padding: 5px 8px; border-radius: 999px; border: 1px solid #e5e7eb; font-size: 11px; background: #f9fafb; color: #4b5563; }

.side-note { font-size: 11px; color: #9ca3af; }

.date-divider{ display: flex; align-items: center; gap: 10px; margin: 10px 0 12px; }
.date-divider::before, .date-divider::after{ content: ""; flex: 1; height: 1px; background: #e5e7eb; }
.date-divider span{
  font-size: 12px;
  color: #9ca3af;
  background: #fff;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
}

/* ✅ 추천 카드 UI */
.result-wrap{
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.result-warning{
  font-size: 12px;
  color: #9ca3af;
}
.result-card{
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 10px;
}
.result-top{
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.result-name{
  font-weight: 800;
  font-size: 14px;
}
.result-addr{
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}
.result-score{
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}
.result-summary{
  font-size: 12px;
  color: #374151;
  margin-top: 6px;
  line-height: 1.4;
}
.result-actions{
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.result-btn, .result-link{
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
  color: #374151;
  display: inline-flex;
  align-items: center;
}
.result-link{ background: #ffffff; }
.result-btn:hover, .result-link:hover{ filter: brightness(0.98); }

@media (max-width: 880px) {
  .chat-page {
  height: 100vh;            /* ✅ min-height 말고 height로 고정 */
  font-family: "Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  background: white;
  color: #111827;
  display: flex;
  justify-content: center;
  align-items: stretch;     /* ✅ center → stretch */
  padding: 24px;
  overflow: hidden;         /* ✅ 페이지(바깥) 스크롤 막기 */
}

  .app-shell {
  width: 100%;
  max-width: 1200px;

  height: 100%;       /* ✅ chat-page(100vh) 안에서 꽉 채움 */
  max-height: 900px;  /* ✅ 원래 900 느낌 유지 */
  min-height: 0;      /* ✅ 내부 스크롤 계산 핵심 */

  background: rgba(255, 255, 255, 0.9);
  border-radius: 26px;
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  padding: 18px 22px 20px;
  overflow: hidden;   /* ✅ 바깥으로 삐져나가며 스크롤 생기는 것 방지 */
}

 .chat-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 4fr 1fr;
  gap: 14px;
  margin-top: 8px;

  min-height: 0; /* ✅ 추가 */
}
}

@media (max-width: 600px) {
  .top-bar { flex-direction: column; align-items: flex-start; gap: 8px; }
  .nav-buttons { align-self: flex-end; }
  .brand-text-sub { display: none; }
}


.tag-chip {
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  font-size: 11px;
  background: #f9fafb;
  color: #4b5563;

  cursor: pointer; /* ✅ 손모양 */
  font-weight: 400;
  transition: font-weight 0.15s ease, color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.tag-chip:hover {
  font-weight: 700; /* ✅ 예시문장처럼 진해짐 */
  color: #111827;
  background: #ffffff;     /* (선택) 더 “눌러지는 느낌” */
  border-color: #c7d2fe;   /* (선택) */
}
        `}
      </style>

      <div className="chat-page">
        <div className="app-shell">
          {/* 상단바 */}
          <header className="top-bar">
            <div className="brand" onClick={() => navigate("/")}>
              <img className="logo-mark" src="/로고.png" alt="로고" />
              <div>
                <div className="brand-text-main">달콤인덱스 챗봇</div>
                <p>문장 한 줄로 원하는 디저트 카페 찾기</p>
                <div className="brand-text-sub"></div>
              </div>
            </div>

            <div className="nav-buttons">
              <button className="pill-btn ghost" type="button" onClick={() => navigate("/")}>
                Main으로 돌아가기
              </button>
            </div>
          </header>

          <section className="chat-layout">
            {/* 왼쪽: 챗봇 */}
            <div className="chat-panel">
              <div className="chat-header">
                <div className="bot-info">
                  <div className="bot-avatar">☕</div>
                  <div>
                    <div className="bot-text-main">디-도-리</div>
                  </div>
                </div>
                <div className="status-wrap">
                  <span className="status-dot"></span>
                  <span className="status-text">실시간 응답 중</span>
                </div>
              </div>

              <div className="chat-body">
                <div className="chat-scroll" ref={scrollRef}>
                  <div className="date-divider">
                    <span>{formatToday()}</span>
                  </div>

                  <div className="bubble-row bot">
                    <div className="bubble bot">
                      안녕하세요! 😊<br />
                      원하는 <b>지역</b>과 <b>분위기</b>, <b>목적</b>을 알려주시면 딱 맞는 디저트카페를
                      추천해드릴게요.
                    </div>
                  </div>

                  {/* ✅ 메시지 렌더(시간 표시도 filtered 기준으로 정상) */}
                  {(() => {
                    const filtered = messages.filter((m) => (m.text ?? "").trim().length > 0);

                    return filtered.map((m, idx) => {
                      const next = filtered[idx + 1];
                      const showTime = !next || next.time !== m.time;

                      return (
                        <React.Fragment key={m.id || `${m.sender}_${idx}`}>
                          <div className={`bubble-row ${m.sender}`}>
                            <div className={`bubble ${m.sender}`} style={{ whiteSpace: "pre-wrap" }}>
                              {m.text}

                              {/* ✅ 봇 메시지에 results/warning이 있으면 카드 출력 */}
                              {m.sender === "bot" && (
                                <>
                                  {(m.warning || (Array.isArray(m.results) && m.results.length > 0)) && (
                                    <div className="result-wrap">
                                      {m.warning ? (
                                        <div className="result-warning">{m.warning}</div>
                                      ) : null}

                                      {Array.isArray(m.results) &&
                                        m.results.map((c) => (
                                          <div key={c.id} className="result-card">
                                            <div className="result-top">
                                              <div>
                                                <div className="result-name">{c.name}</div>
                                                <div className="result-addr">{c.address}</div>
                                              </div>
                                            </div>

                                            {c.summary ? (
                                              <div className="result-summary">{c.summary}</div>
                                            ) : null}

                                            <div className="result-actions">
                                              <button
                                                type="button"
                                                className="result-btn"
                                                onClick={() => navigate(`/cafe/${c.id}`)}
                                              >
                                                상세보기
                                              </button>

                                              {canOpenMap(c) ? (
                                                <button
                                                  type="button"
                                                  className="result-btn"
                                                  onClick={() => {
                                                    navigate("/map", {
                                                      state: {
                                                        focusCafe: {
                                                          id: c.cafe_id ?? c.id,
                                                          name: c.name,
                                                          address: c.address,
                                                          x: Number(c.x ?? c.lon), // lon
                                                          y: Number(c.y ?? c.lat), // lat
                                                        },
                                                        openPopup: true,
                                                      },
                                                    });
                                                  }}
                                                >
                                                  지도 열기
                                                </button>
                                              ) : null}
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {showTime ? <div className={`time ${m.sender}`}>{m.time}</div> : null}
                        </React.Fragment>
                      );
                    });
                  })()}
                </div>

                <p className="hint-text">지역 · 분위기 · 방문 목적 · 맛을 조합해서 자연스럽게 말해보세요.</p>

                <div className="quick-chips">
                  <button
                    type="button"
                    className="quick-chip"
                    onClick={() => onChipClick("커피 맛 좋은 디저트카페 추천해줘")}
                  >
                    ☕ 커피 맛 좋은 곳
                  </button>
                  <button
                    type="button"
                    className="quick-chip"
                    onClick={() => onChipClick("조용하게 공부하기 좋은 카페 추천해줘")}
                  >
                    📚 공부하기 좋은 조용한 카페
                  </button>
                  <button
                    type="button"
                    className="quick-chip"
                    onClick={() => onChipClick("사진 찍기 좋은 감성 카페 추천해줘")}
                  >
                    📸 사진 찍기 좋은 감성 카페
                  </button>
                  <button
                    type="button"
                    className="quick-chip"
                    onClick={() => onChipClick("데이트하기 좋은 디저트카페 추천해줘")}
                  >
                    👫 데이트 하기 좋은 카페
                  </button>
                </div>

                <div className="chat-input-bar">
                  <div className="chat-input-wrapper">
                    <span className="chat-placeholder-icon">✏️</span>
                    <input
                      ref={inputRef}
                      type="text"
                      className="chat-input-field"
                      placeholder="예) 광주 상무지구에서 분위기 좋고 케이크 맛있는 카페 추천해줘"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSend();
                      }}
                    />
                  </div>

                  <button className="send-btn" type="button" onClick={handleSend} disabled={isSending}>
                    <span>{isSending ? "전송 중..." : "보내기"}</span>
                    <span className="icon">➤</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 오른쪽: 예시 & 태그 */}
            <aside className="side-panel">
              <div>
                <div className="side-title" style={{ marginTop: 6 }}>
                  자주 쓰이는 키워드
                </div>

               <div className="tag-grid">
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("나주")}>나주</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("광주 상무지구")}>광주 상무지구</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("조용한")}>조용한</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("감성적인")}>감성적인</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("뷰맛집")}>뷰맛집</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("공부")}>공부</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("데이트")}>데이트</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("수다")}>수다</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("디저트 맛집")}>디저트 맛집</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("케이크")}>케이크</button>
                 <button type="button" className="tag-chip" onClick={() => onKeywordClick("커피")}>커피</button>
               </div>

                <br />

                <div>
                  <div className="side-title">예시 문장</div>
                  <ul className="example-list">
                    <li onClick={() => onChipClick("광주에서 사진 찍기 좋은 카페 추천해줘")}>
                      · 광주에서 사진 찍기 좋은 카페 추천해줘
                    </li>
                    <li onClick={() => onChipClick("담양에서 가족이랑 가기 좋은 디저트카페 있어?")}>
                      · 담양에서 가족이랑 가기 좋은 디저트카페 있어?
                    </li>
                    <li onClick={() => onChipClick("화순 쪽에서 커피 맛 괜찮고 조용한 카페 알려줘")}>
                      · 화순 쪽에서 커피 맛 괜찮고 조용한 카페 알려줘
                    </li>
                  </ul>
                </div>
              </div>

              <p className="side-note">
                원하는 조합으로 편하게 말만 해주세요.
                <br />
                키워드는 실제 필터 기능이랑 연결해서 사용하면 좋아요 :)
              </p>
            </aside>
          </section>
        </div>
      </div>
    </>
  );
};

export default Chat;
