import { useParams, useSearchParams, useNavigate } from "react-router-dom";

export default function CafeDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [sp] = useSearchParams();
  const name = sp.get("name");

  // ✅ (추가) 임시 데이터 — 나중에 DB/API로 교체
  const cafe = {
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
  };

  const reviews = []; // [{id:1, user:"홍길동", date:"2025.12.18", text:"좋아요", rating:5}]

  return (
    
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24}}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>

        <button
    type="button"
    onClick={() => navigate("/")}
    style={{
      border: "none",
      background: "transparent",
      padding: 0,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
    }}
    aria-label="메인으로 이동"
  >
    <img
      src="/로고.png"
      alt="로고"
      style={{ width: 120, height: 120, objectFit: "contain" }}
    />
    <div>달콤인덱스</div>
  </button>

  
<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
            {cafe?.name || "카페 이름"}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            {cafe?.region || "지역"} · {cafe?.category || "카페/디저트"} · 리뷰{" "}
            {cafe?.reviewCount ?? 0}
          </div>
        </div>
      </div>

      </div>


        
              <button
               type="button"
               onClick={() => navigate(-1)}
               style={{
               border: "1px solid #e5e7eb",
               background: "#fff",
               borderRadius: 10,
               padding: "8px 12px",
               cursor: "pointer",
           
               }}
              >
                ← 뒤로
              </button>

              

      <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 사진 */}
          <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>사진</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>외관 · 메뉴 · 내부</div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {(cafe?.photos?.length ? cafe.photos : new Array(4).fill(null)).map((url, i) => (
                <div
                  key={i}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                  }}
                >
                  {url ? (
                    <img src={url} alt={`cafe-${i}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>
                      사진 준비중
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 정보 */}
          <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>카페 정보</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <InfoRow label="주소" value={cafe?.address || "주소 정보 없음"} />
              <InfoRow label="전화" value={cafe?.phone || "전화 정보 없음"} />
              <InfoRow label="영업시간" value={cafe?.hours || "영업시간 정보 없음"} />
              <InfoRow label="주차" value={cafe?.parking || "주차 정보 없음"} />
              <InfoRow label="대표메뉴" value={cafe?.mainMenu || "대표메뉴 정보 없음"} />
              <InfoRow label="분위기" value={cafe?.atmosphere || "분위기 정보 없음"} />
            </div>
          </section>

         

          {/* 리뷰 */}
          <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>달콤인덱스 회원 리뷰</div>
              <button
                type="button"
                style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
                onClick={() => alert("리뷰 작성 기능은 다음 단계에서 연결해요!")}
              >
                + 리뷰 작성
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {reviews.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9ca3af" }}>아직 리뷰가 없어요 🙂</div>
              ) : (
                reviews.map((r) => (
                  <div key={r.id}>{r.text}</div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* 오른쪽 요약 */}
        <aside style={{ position: "sticky", top: 18, alignSelf: "start", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, height: "fit-content" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>요약</div>
          <div style={{ marginTop: 10, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
            <div>⭐ 점수: {cafe?.score ?? "-"}</div>
           <br />
             {/* 분석 */}
          <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>분석</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              <div style={{ border: "1px dashed #e5e7eb", borderRadius: 14, padding: 12, background: "#f9fafb", minHeight: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>워드클라우드</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  (추후) 워드클라우드 이미지 표시
                </div>
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff", minHeight: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>키워드 요약</div>
                <ScoreRow label="맛" value={cafe?.scores?.taste ?? 0} />
                <ScoreRow label="분위기" value={cafe?.scores?.mood ?? 0} />
                <ScoreRow label="가격" value={cafe?.scores?.price ?? 0} />
                <ScoreRow label="재방문" value={cafe?.scores?.revisit ?? 0} />
              </div>
            </div>
          </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ✅ 반드시 CafeDetail 밖으로 빼기 */
function InfoRow({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px", background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}

function ScoreRow({ label, value }) {
  const v = Number(value) || 0;
  const pct = Math.max(0, Math.min(100, (v / 5) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
        <span>{label}</span>
        <span>{v.toFixed(1)} / 5</span>
      </div>
      <div style={{ height: 8, background: "#f3f4f6", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#4f46e5" }} />
      </div>
    </div>
  );
}
