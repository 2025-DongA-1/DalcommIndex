import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import Header from "../components/Header";

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function apiFetch(path, { method = "GET", body } = {}) {
  const token = localStorage.getItem("accessToken");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "요청 실패");
    err.status = res.status;
    throw err;
  }
  return data;
}

export default function CafeDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [sp] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [cafe, setCafe] = useState(null);

  // ✅ 안전한 뒤로가기(히스토리 없으면 홈으로)
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/cafes/${id}`);
        if (!alive) return;
        setCafe(data.cafe);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        alert(e.message || "카페 상세 조회 실패");
        navigate("/search");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, navigate]);

  const detail = useMemo(() => {
    if (!cafe) return null;

    const category = "디저트 카페";
    const tags = Array.isArray(cafe.tags) ? cafe.tags : [];

    // 화면에 쓸 텍스트 정리
    const mainMenu = cafe.mainMenu || "대표메뉴 정보 없음";
    const atmosphere = cafe.atmosphere || "분위기 정보 없음";
    const parking = cafe.parking || "주차 정보 없음";

    return {
      ...cafe,
      category,
      tags,
      mainMenu,
      atmosphere,
      parking,
      reviewCount: cafe.reviewCount ?? 0,
      score: cafe.score ?? 0,
      photos: Array.isArray(cafe.photos) ? cafe.photos : [],
      mapUrl: cafe.mapUrl || "",
    };
  }, [cafe]);

  const reviews = []; // 차후 reviews 테이블 연결 시 구현

  if (loading) {
    return (
      <div className="cfd-page">
        <Header />
        <main className="cfd-wrap">
          <div style={{ padding: 24 }}>로딩 중...</div>
        </main>
      </div>
    );
  }

  if (!detail) return null;

  const favoriteCafeId = Number(detail.cafe_id ?? detail.id);

  return (
    <div className="cfd-page">
      <Header />

      <main className="cfd-wrap">
        {/* 상단 */}
        <section className="cfd-top">
          <div className="cfd-top-left">
            <button type="button" className="cfd-back" onClick={goBack}>
              ← 뒤로
            </button>

            <div className="cfd-titleBox">
              <div className="cfd-title">{detail.name || "카페 이름"}</div>
              <div className="cfd-sub">
                <span className="cfd-pill">{detail.region || "지역"}</span>
                <span className="cfd-dot">·</span>
                <span className="cfd-pill cfd-pill-ghost">{detail.category}</span>
                <span className="cfd-dot">·</span>
                <span className="cfd-subText">리뷰 {detail.reviewCount ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="cfd-top-right">
            <button type="button" className="cfd-action" onClick={() => navigate("/map")} title="지도에서 보기">
              지도
            </button>

            <button
              type="button"
              className="cfd-action cfd-action-primary"
              title="즐겨찾기"
              onClick={async () => {
                const token = localStorage.getItem("accessToken");
                if (!token) return navigate("/login");

                if (!Number.isFinite(favoriteCafeId)) {
                  alert("즐겨찾기 저장을 위해 cafe_id(숫자)가 필요합니다.");
                  return;
                }

                try {
                  await apiFetch("/api/me/favorites", {
                    method: "POST",
                    body: {
                      cafe_id: favoriteCafeId,
                      // json fallback 모드일 때만 사용(테이블 모드에서는 무시됨)
                      name: detail.name,
                      region: detail.region,
                      tags: detail.tags,
                    },
                  });
                  alert("즐겨찾기에 저장했습니다.");
                } catch (e) {
                  if (e?.status === 401 || e?.status === 403) navigate("/login");
                  else alert(e.message || "즐겨찾기 저장 실패");
                }
              }}
            >
              ❤ 저장
            </button>
          </div>
        </section>

        {/* 본문 그리드 */}
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
                {(detail.photos.length ? detail.photos : new Array(4).fill(null)).map((url, i) => (
                  <div key={i} className="cfd-photo">
                    {url ? (
                      <img src={url} alt={`cafe-${i}`} className="cfd-photoImg" />
                    ) : (
                      <div className="cfd-photoPh">사진 준비중</div>
                    )}
                  </div>
                ))}
              </div>

              {Array.isArray(detail.tags) && detail.tags.length > 0 && (
                <div className="cfd-chipRow">
                  {detail.tags.map((t) => (
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
                <InfoRow label="주소" value={detail.address || "주소 정보 없음"} />
                <InfoRow label="지도" value={detail.mapUrl ? "지도 링크 있음" : "지도 링크 없음"} />
                <InfoRow label="주차" value={detail.parking || "주차 정보 없음"} />
                <InfoRow label="대표메뉴" value={detail.mainMenu || "대표메뉴 정보 없음"} />
                <InfoRow label="분위기" value={detail.atmosphere || "분위기 정보 없음"} />
              </div>

              {detail.mapUrl ? (
                <div style={{ marginTop: 10 }}>
                  <a href={detail.mapUrl} target="_blank" rel="noreferrer" className="cfd-btn">
                    지도 링크 열기
                  </a>
                </div>
              ) : null}
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
                  <span className="cfd-scoreText">달콤지수</span>
                  <span className="cfd-scoreVal">{Math.round(Number(detail.score || 0))}</span>
                </div>

                <div className="cfd-subCard">
                  <div className="cfd-subCardTitle">워드클라우드</div>
                  <div className="cfd-subPh">(추후) 워드클라우드 이미지 표시</div>
                </div>

                <div className="cfd-subCard">
                  <div className="cfd-subCardTitle">키워드 요약</div>

                  <MiniRow label="최근 언급" value={detail.lastMentionedAt ? String(detail.lastMentionedAt).slice(0, 19) : "정보 없음"} />
                  <MiniRow label="최근 리뷰" value={`${detail.reviewCountRecent ?? 0}개`} />
                  <MiniRow label="주차" value={detail.parking || "정보 없음"} />

                  <div style={{ height: 10 }} />

                  <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>Top 키워드</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(detail.topKeywords || detail.tags || []).slice(0, 10).map((k) => (
                      <span key={k} className="cfd-chip">
                        #{k}
                      </span>
                    ))}
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>메뉴 태그</div>
                  <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
                    {(detail.menuTags || []).slice(0, 12).join(", ") || "정보 없음"}
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>추천 태그</div>
                  <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
                    {(detail.recoTags || []).slice(0, 12).join(", ") || "정보 없음"}
                  </div>
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

function MiniRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, marginTop: 6 }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ color: "#222", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
