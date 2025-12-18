import { useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import Header from "../components/Header"; // ✅ CafeDetail.jsx 위치에 따라 경로 조정 (예: "./components/Header")

export default function CafeDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [sp] = useSearchParams();
  const name = sp.get("name");

  // ✅ 안전한 뒤로가기(히스토리 없으면 홈으로)
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  // ✅ (임시 데이터) — 나중에 DB/API로 교체
  const cafe = useMemo(
    () => ({
      id: id || null,
      name: name || (id ? `카페 ${id}` : "카페 이름"),
      region: "나주",
      category: "디저트 카페",
      reviewCount: 0,
      photos: [], // ["https://...","https://..."]
      address: "",
      phone: "전화 정보 없음",
      hours: "영업시간 정보 없음",
      parking: "정보 없음",
      mainMenu: "대표메뉴 정보 없음",
      atmosphere: "분위기 정보 없음",
      tags: ["감성", "조용한", "디저트"],
      mapUrl: "",
      wordcloudUrl: "",
      scores: { taste: 0, mood: 0, price: 0, revisit: 0 },
      score: "-",
    }),
    [id, name]
  );

  const reviews = []; // [{id:1, user:"홍길동", date:"2025.12.18", text:"좋아요", rating:5}]

  return (
    <div className="cfd-page">
      <Header />

      <main className="cfd-wrap">
        {/* ✅ 상단: 뒤로 + 카페명(좌측 정렬로 자연스럽게) + 우측 액션 */}
        <section className="cfd-top">
          <div className="cfd-top-left">
            <button type="button" className="cfd-back" onClick={goBack}>
              ← 뒤로
            </button>

            <div className="cfd-titleBox">
              <div className="cfd-title">{cafe?.name || "카페 이름"}</div>
              <div className="cfd-sub">
                <span className="cfd-pill">{cafe?.region || "지역"}</span>
                <span className="cfd-dot">·</span>
                <span className="cfd-pill cfd-pill-ghost">{cafe?.category || "카페/디저트"}</span>
                <span className="cfd-dot">·</span>
                <span className="cfd-subText">리뷰 {cafe?.reviewCount ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="cfd-top-right">
            <button
              type="button"
              className="cfd-action"
              onClick={() => navigate("/map")}
              title="지도에서 보기"
            >
              지도
            </button>
            <button
              type="button"
              className="cfd-action cfd-action-primary"
              onClick={() => alert("즐겨찾기(연동 예정)")}
              title="즐겨찾기"
            >
              ❤ 저장
            </button>
          </div>
        </section>

        {/* ✅ 본문 그리드 */}
        <div className="cfd-grid">
          {/* 왼쪽 */}
          <div className="cfd-col">
            {/* 사진 */}
            <section className="cfd-card">
              <div className="cfd-cardHead">
                <div className="cfd-cardTitle">사진</div>
                <div className="cfd-cardHint">외관 · 메뉴 · 내부</div>
              </div>

              <div className="cfd-photoGrid">
                {(cafe?.photos?.length ? cafe.photos : new Array(4).fill(null)).map((url, i) => (
                  <div key={i} className="cfd-photo">
                    {url ? (
                      <img src={url} alt={`cafe-${i}`} className="cfd-photoImg" />
                    ) : (
                      <div className="cfd-photoPh">사진 준비중</div>
                    )}
                  </div>
                ))}
              </div>

              {Array.isArray(cafe?.tags) && cafe.tags.length > 0 && (
                <div className="cfd-chipRow">
                  {cafe.tags.map((t) => (
                    <span key={t} className="cfd-chip">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 카페 정보 */}
            <section className="cfd-card">
              <div className="cfd-cardHead">
                <div className="cfd-cardTitle">카페 정보</div>
              </div>

              <div className="cfd-infoGrid">
                <InfoRow label="주소" value={cafe?.address || "주소 정보 없음"} />
                <InfoRow label="전화" value={cafe?.phone || "전화 정보 없음"} />
                <InfoRow label="영업시간" value={cafe?.hours || "영업시간 정보 없음"} />
                <InfoRow label="주차" value={cafe?.parking || "주차 정보 없음"} />
                <InfoRow label="대표메뉴" value={cafe?.mainMenu || "대표메뉴 정보 없음"} />
                <InfoRow label="분위기" value={cafe?.atmosphere || "분위기 정보 없음"} />
              </div>
            </section>

            {/* 리뷰 */}
            <section className="cfd-card">
              <div className="cfd-cardHead cfd-between">
                <div className="cfd-cardTitle">달콤인덱스 회원 리뷰</div>
                <button
                  type="button"
                  className="cfd-btn"
                  onClick={() => alert("리뷰 작성 기능은 다음 단계에서 연결해요!")}
                >
                  + 리뷰 작성
                </button>
              </div>

              <div className="cfd-reviewBody">
                {reviews.length === 0 ? (
                  <div className="cfd-empty">아직 리뷰가 없어요 🙂</div>
                ) : (
                  reviews.map((r) => (
                    <div key={r.id} className="cfd-reviewItem">
                      {r.text}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* 오른쪽(요약/분석 sticky) */}
          <aside className="cfd-aside">
            <section className="cfd-card cfd-sticky">
              <div className="cfd-cardHead">
                <div className="cfd-cardTitle">요약</div>
              </div>

              <div className="cfd-summary">
                <div className="cfd-score">
                  <span className="cfd-scoreStar">★</span>
                  <span className="cfd-scoreText">점수</span>
                  <span className="cfd-scoreVal">{cafe?.score ?? "-"}</span>
                </div>

                <div className="cfd-subCard">
                  <div className="cfd-subCardTitle">워드클라우드</div>
                  {cafe?.wordcloudUrl ? (
                    <img src={cafe.wordcloudUrl} alt="wordcloud" className="cfd-wordcloud" />
                  ) : (
                    <div className="cfd-subPh">(추후) 워드클라우드 이미지 표시</div>
                  )}
                </div>

                <div className="cfd-subCard">
                  <div className="cfd-subCardTitle">키워드 요약</div>
                  <ScoreRow label="맛" value={cafe?.scores?.taste ?? 0} />
                  <ScoreRow label="분위기" value={cafe?.scores?.mood ?? 0} />
                  <ScoreRow label="가격" value={cafe?.scores?.price ?? 0} />
                  <ScoreRow label="재방문" value={cafe?.scores?.revisit ?? 0} />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="cfd-infoItem">
      <div className="cfd-infoLabel">{label}</div>
      <div className="cfd-infoValue">{value}</div>
    </div>
  );
}

function ScoreRow({ label, value }) {
  const v = Number(value) || 0;
  const pct = Math.max(0, Math.min(100, (v / 5) * 100));
  return (
    <div className="cfd-scoreRow">
      <div className="cfd-scoreRowTop">
        <span>{label}</span>
        <span>{v.toFixed(1)} / 5</span>
      </div>
      <div className="cfd-bar">
        <div className="cfd-barFill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
