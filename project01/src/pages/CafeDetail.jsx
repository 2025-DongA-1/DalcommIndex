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

function safeParseJson(v, fallback = null) {
  try {
    const j = JSON.parse(v);
    return j ?? fallback;
  } catch {
    return fallback;
  }
}

function renderStars(n) {
  const x = Math.max(0, Math.min(5, Number(n) || 0));
  return "★".repeat(x) + "☆".repeat(5 - x);
}

function formatDate(v) {
  if (!v) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default function CafeDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [sp] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [cafe, setCafe] = useState(null);

  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [userReviews, setUserReviews] = useState([]);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewForm, setReviewForm] = useState({ rating: 5, content: "" });

  const me = useMemo(() => {
    const raw = localStorage.getItem("user");
    const u = raw ? safeParseJson(raw, null) : null;
    return u && typeof u === "object" ? u : null;
  }, []);
  const myUserId = Number(me?.user_id);

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

  const loadUserReviews = async () => {
    try {
      setReviewsLoading(true);
      const data = await apiFetch(`/api/cafes/${id}/user-reviews`);
      setUserReviews(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      console.error(e);
      setUserReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    // 카페 상세와 별도로 회원 리뷰 로딩
    if (!id) return;
    loadUserReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      userReviewCount: cafe.userReviewCount ?? 0,
      userRatingAvg: cafe.userRatingAvg ?? null,
      score: cafe.score ?? 0,
      photos: Array.isArray(cafe.photos) ? cafe.photos : [],
      mapUrl: cafe.mapUrl || "",
    };
  }, [cafe]);

  const myReview = useMemo(() => {
    if (!Number.isFinite(myUserId)) return null;
    return userReviews.find((r) => Number(r.userId) === myUserId) || null;
  }, [userReviews, myUserId]);

  const openReviewForm = () => {
    setReviewError("");
    const token = localStorage.getItem("accessToken");
    if (!token) return navigate("/login");

    if (myReview) {
      setReviewForm({ rating: Number(myReview.rating) || 5, content: myReview.content || "" });
    } else {
      setReviewForm({ rating: 5, content: "" });
    }
    setReviewFormOpen(true);
  };

  const closeReviewForm = () => {
    setReviewError("");
    setReviewFormOpen(false);
  };

  const submitReview = async (e) => {
    e.preventDefault();
    setReviewError("");

    const token = localStorage.getItem("accessToken");
    if (!token) return navigate("/login");

    const rating = Number(reviewForm.rating);
    const content = String(reviewForm.content || "").trim();
    if (!content) return setReviewError("리뷰 내용을 입력해주세요.");
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return setReviewError("평점은 1~5 사이여야 합니다.");

    try {
      setReviewSubmitting(true);

      if (myReview?.id) {
        await apiFetch(`/api/me/reviews/${myReview.id}`, {
          method: "PUT",
          body: { rating, content },
        });
      } else {
        await apiFetch(`/api/cafes/${id}/user-reviews`, {
          method: "POST",
          body: { rating, content },
        });
      }

      await loadUserReviews();
      setReviewFormOpen(false);
    } catch (e2) {
      if (e2?.status === 401 || e2?.status === 403) return navigate("/login");
      setReviewError(e2.message || "리뷰 저장 실패");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const deleteMyReview = async () => {
    if (!myReview?.id) return;
    const ok = confirm("리뷰를 삭제할까요?");
    if (!ok) return;

    try {
      setReviewSubmitting(true);
      await apiFetch(`/api/me/reviews/${myReview.id}`, { method: "DELETE" });
      await loadUserReviews();
      setReviewFormOpen(false);
      setReviewForm({ rating: 5, content: "" });
    } catch (e) {
      if (e?.status === 401 || e?.status === 403) return navigate("/login");
      alert(e.message || "리뷰 삭제 실패");
    } finally {
      setReviewSubmitting(false);
    }
  };

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
                  {detail.userRatingAvg != null ? (
                    <>
                      <span className="cfd-dot">·</span>
                      <span className="cfd-subText">
                        평점 {renderStars(Math.round(Number(detail.userRatingAvg)))} {Number(detail.userRatingAvg).toFixed(1)}
                      </span>
                    </>
                  ) : null}
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
                    {url ? <img src={url} alt={`cafe-${i}`} className="cfd-photoImg" /> : <div className="cfd-photoPh">사진 준비중</div>}
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
                <button type="button" className="cfd-btn" onClick={openReviewForm}>
                  {myReview ? "내 리뷰 수정" : "+ 리뷰 작성"}
                </button>
              </div>

              <div className="cfd-reviewBody">
                <div className="cfd-reviewSummary">회원리뷰 {detail.userReviewCount ?? userReviews.length}개</div>

                {reviewFormOpen && (
                  <form className="cfd-reviewForm" onSubmit={submitReview}>
                    <div className="cfd-reviewFormTop">
                      <div className="cfd-reviewFormRow">
                        <label className="cfd-reviewLabel">평점</label>
                        <select
                          className="cfd-reviewSelect"
                          value={reviewForm.rating}
                          onChange={(e) => setReviewForm((p) => ({ ...p, rating: Number(e.target.value) }))}
                          disabled={reviewSubmitting}
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n} ({renderStars(n)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="cfd-reviewFormRow" style={{ flex: 1 }}>
                        <label className="cfd-reviewLabel">내용</label>
                        <textarea
                          className="cfd-reviewTextarea"
                          value={reviewForm.content}
                          onChange={(e) => setReviewForm((p) => ({ ...p, content: e.target.value }))}
                          placeholder="방문 후기를 남겨주세요."
                          rows={4}
                          disabled={reviewSubmitting}
                        />
                      </div>
                    </div>

                    {reviewError && <div className="cfd-reviewErr">{reviewError}</div>}

                    <div className="cfd-reviewFormActions">
                      <button type="submit" className="cfd-btn" disabled={reviewSubmitting}>
                        {reviewSubmitting ? "저장 중..." : "저장"}
                      </button>
                      <button type="button" className="cfd-btn" onClick={closeReviewForm} disabled={reviewSubmitting}>
                        취소
                      </button>
                      {myReview?.id && (
                        <button type="button" className="cfd-btn cfd-btn-danger" onClick={deleteMyReview} disabled={reviewSubmitting}>
                          삭제
                        </button>
                      )}
                    </div>
                  </form>
                )}

                {reviewsLoading ? (
                  <div className="cfd-empty" style={{ marginTop: 8 }}>리뷰를 불러오는 중...</div>
                ) : userReviews.length === 0 ? (
                  <div className="cfd-empty" style={{ marginTop: 8 }}>아직 리뷰가 없습니다.</div>
                ) : (
                  <div className="cfd-reviewList">
                    {userReviews.map((r) => (
                      <div key={r.id} className="cfd-reviewItem">
                        <div className="cfd-reviewMeta">
                          <div className="cfd-reviewNick">{r.nickname || "사용자"}</div>
                          <div className="cfd-reviewStars">{renderStars(r.rating)}</div>
                          <div className="cfd-reviewDate">{formatDate(r.created_at)}</div>
                        </div>
                        <div className="cfd-reviewText">{r.content}</div>
                      </div>
                    ))}
                  </div>
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
