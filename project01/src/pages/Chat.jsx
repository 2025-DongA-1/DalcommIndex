import React, {useRef, useState, useEffect} from "react"
import {useNavigate} from "react-router-dom"



const Chat = () => {
  const navigate = useNavigate()

  const [input, setInput] = useState("");
const inputRef = useRef(null);

const onChipClick = (text) => {
  setInput(text);
  setTimeout(() => inputRef.current?.focus(), 0);
};

const [messages, setMessages] = useState([]);

const handleSend = () => {
  const text = input.trim();
  if (!text) return;

  setMessages((prev) => [...prev, { sender: "user", text }]);

  setInput("");
  setTimeout(() => inputRef.current?.focus(), 0);
};

const scrollRef = useRef(null);

useEffect(() => {
  if (!scrollRef.current) return;
  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
}, [messages]);

  return (
    <>
      <style>
        {`
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap");

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ✅ React에선 body 전역 스타일이 충돌할 수 있어서
   body 대신 .chat-page 래퍼에 동일 스타일 적용 */
.chat-page {
  min-height: 100vh;
  font-family: "Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  background: radial-gradient(circle at top left, #ffe7f0 0, #f5f7ff 38%, #eef9ff 80%);
  color: #111827;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}

/* 전체 카드 */
.app-shell {
  width: 100%;
  max-width: 1200px;
  min-height: 900px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 26px;
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  padding: 18px 22px 20px;
}

/* 상단바 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f97316, #ec4899);
  color: #fff;
  font-weight: 700;
  font-size: 18px;
}

.brand-text-main {
  font-size: 18px;
  font-weight: 700;
}

.brand-text-sub {
  font-size: 12px;
  color: #9ca3af;
}

.nav-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pill-btn {
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 8px 13px;
  font-size: 13px;
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

.pill-btn.primary {
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  color: #ffffff;
  border-color: transparent;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.45);
}

.pill-btn.primary:hover {
  filter: brightness(1.05);
}

/* 상단 설명 영역 */
.hero {
  padding: 10px 4px 4px;
  margin-bottom: 10px;
}

.hero-title {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 4px;
}

.hero-sub {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 10px;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hero-chip {
  font-size: 11px;
  padding: 5px 9px;
  border-radius: 999px;
  background: #f3f4ff;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

/* 메인 챗봇 카드 */
.chat-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 4fr 1fr;
  gap: 14px;
  margin-top: 8px;
}

/* 챗 패널 (왼쪽) */
.chat-panel {
  padding: 16px 16px 14px;
  border-radius: 20px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.bot-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bot-avatar {
  width: 34px;
  height: 34px;
  border-radius: 14px;
  background: linear-gradient(135deg, #4f46e5, #ec4899);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
}

.bot-text-main {
  font-size: 14px;
  font-weight: 600;
}

.status-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18);
}

.status-text {
  font-size: 11px;
  color: #6b7280;
}

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
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch; 
}

.bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  width: 100%;  
}

.bubble-row.user {
  justify-content: flex-end;
  width: 100%;
}

.bubble {
  max-width: 80%;
  padding: 8px 11px;
  border-radius: 16px;
  font-size: 13px;
  line-height: 1.5;
}

.bubble.bot {
  background: #f3f4ff;
  color: #111827;
  border-radius: 16px 16px 16px 4px;
}

.bubble.user {
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  color: #ffffff;
  border-radius: 16px 16px 4px 16px;
}

.time {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 1px;
}

.time.user {
  text-align: right;
}

.chat-input-bar {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

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

.chat-placeholder-icon {
  font-size: 16px;
  opacity: 0.5;
}

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

.send-btn span.icon {
  font-size: 15px;
}

.send-btn:hover {
  filter: brightness(1.05);
}

.helper-text {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
}

/* 오른쪽: 예시 / 태그 영역 */
.side-panel {
  padding: 14px 14px 12px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.side-title {
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 4px;
}

.example-list {
  list-style: none;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
  background: #f9fafb;
  border-radius: 12px;
  padding: 8px 10px;
  border: 1px dashed #e5e7eb;
}

.example-list li + li {
  margin-top: 2px;
}

.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  font-size: 11px;
  background: #f9fafb;
  color: #4b5563;
}

.side-note {
  font-size: 11px;
  color: #9ca3af;
}

/* 반응형 */
@media (max-width: 880px) {
  .chat-page {
    padding: 16px;
  }

  .app-shell {
    padding: 14px 14px 16px;
  }

  .chat-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .top-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .nav-buttons {
    align-self: flex-end;
  }

  .brand-text-sub {
    display: none;
  }
}

.quick-chips{
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 6px 2px;
}

.quick-chip{
  border: 1px solid #e5e7eb;
  background: #f3f4ff;
  color: #374151;
  font-size: 12px;
  padding: 7px 10px;
  border-radius: 999px;
  cursor: pointer;
}

.quick-chip:hover{
  filter: brightness(0.98);
}


/* ✅ '지역 · 분위기 …' 문장을 칩에 더 가깝게 */
.hint-text{
  margin-top: 18px;   /* 문장을 아래로 내림 (값 늘릴수록 더 내려감) */
  margin-bottom: -10px; /* 문장과 칩 사이 간격(작게) */
  font-size: 13px;      /* 입력칸 텍스트 느낌 */
  color: #6b7280;       /* 입력칸 placeholder 같은 회색 */
  font-weight: 400;
  line-height: 1.4;
  color:#9ca3af; 

}



        `}
      </style>





      <div className="chat-page">
        <div className="app-shell">
          {/* 상단바 */}
          <header className="top-bar">
            <div className="brand">
              <img className = "logo-mark" src="/로고.png" alt="로고" />
              <div>
                <div className="brand-text-main">달콤인덱스 챗봇</div>
                <p>문장 한 줄로 원하는 디저트 카페 찾기</p>
  
              
                   챗봇이 이전 대화까지 기억하고 맞춤 카페를 골라드려요.
              
                <div className="brand-text-sub"></div>
              </div>
            </div>
            
            <div className="nav-buttons">
              <button 
                className = "pill-btn ghost"
                type = "button"
                onClick = {()=>navigate("/")}>
                  Main
                  </button>

            </div>

            


          </header>

        

          {/* 메인 레이아웃 (챗봇 + 예시/태그) */}
          <section className="chat-layout">
            {/* 왼쪽: 챗봇 */}
            <div className="chat-panel">
              <div className="chat-header">
                <div className="bot-info">
                  <div className="bot-avatar">☕</div>
                  <div>
                    <div className="bot-text-main">DessertBot</div>
                  </div>
                </div>
                <div className="status-wrap">
                  <span className="status-dot"></span>
                  <span className="status-text">실시간 응답 중</span>
                </div>
              </div>

              <div className="chat-body">
                <div className="chat-scroll" ref={scrollRef}>

                  <div className="bubble-row bot">
                    <div className="bubble bot">
                      안녕하세요! 😊<br />
                      원하는 <b>지역</b>과 <b>분위기</b>, <b>목적</b>을 알려주시면
                     딱 맞는 디저트카페를 추천해드릴게요.
                    </div>
                  </div>

                  {messages.map((m, idx) => (
                    <div key={idx} className={`bubble-row ${m.sender}`}>
                     <div className={`bubble ${m.sender}`}>{m.text}</div>
                    </div>
                    ))}
                  


                  

                  <div className="time">오늘 · 17:20</div>

                  <div className="bubble-row user">
                    <div className="bubble user">
                    
                    </div>
                  </div>
                  <div className="time user">오늘 · 17:21</div>

                  <div className="bubble-row bot">
                    <div className="bubble bot">
                     
                      <br />
                      <span style={{ opacity: 0.8 }}>
                       
                      </span>
                    </div>

                    

                  </div>
                </div>
                  <p className="hint-text">
                     지역 · 분위기 · 방문 목적 · 맛을 조합해서 자연스럽게 말해보세요.
                  </p>

                <div className="quick-chips">
                  
                  <button type="button" className="quick-chip" onClick={() => onChipClick("커피 맛 좋은 디저트카페 추천해줘")}>☕ 커피 맛 좋은 곳</button>
                  <button type="button" className="quick-chip"   onClick={() => onChipClick("조용하게 공부하기 좋은 카페 추천해줘")}>📚 공부하기 좋은 조용한 카페</button>
                  <button type="button" className="quick-chip"  onClick={() => onChipClick("사진 찍기 좋은 감성 카페 추천해줘")}>📸 사진 찍기 좋은 감성 카페</button>
                  <button type="button" className="quick-chip" onClick={() => onChipClick("데이트하기 좋은 디저트카페 추천해줘")}>👫 데이트 & 수다</button>
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
                    />
                  </div>
                  <button className="send-btn" type="button" onClick={handleSend}>
                    <span>보내기</span>
                    <span className="icon">➤</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 오른쪽: 예시 & 태그 */}
            <aside className="side-panel">
              <div>
                <div className="side-title">예시 문장</div>
                <ul className="example-list">
                  <li>· 광주에서 사진 찍기 좋은 감성 카페 추천해줘</li>
                  <li>· 담양에서 가족이랑 가기 좋은 디저트카페 있어?</li>
                  <li>· 화순 쪽에서 커피 맛 괜찮고 조용한 카페 알려줘</li>
                </ul>
              </div>

              <div>
                <div className="side-title" style={{ marginTop: 6 }}>
                  자주 쓰이는 키워드
                </div>
                <div className="tag-grid">
                  <span className="tag-chip">나주</span>
                  <span className="tag-chip">광주 상무지구</span>
                  <span className="tag-chip">조용한</span>
                  <span className="tag-chip">감성적인</span>
                  <span className="tag-chip">뷰맛집</span>
                  <span className="tag-chip">공부</span>
                  <span className="tag-chip">데이트</span>
                  <span className="tag-chip">수다</span>
                  <span className="tag-chip">디저트 맛집</span>
                  <span className="tag-chip">케이크</span>
                  <span className="tag-chip">커피</span>
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
