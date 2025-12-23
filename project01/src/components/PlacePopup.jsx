// src/components/PlacePopup.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";


const API_BASE = import.meta.env.VITE_API_BASE || ""; // ✅ 추가: 서버 API base
const FAVORITES_EVENT = "dalcomm_favorites_changed"; // ✅ 추가: 이벤트명 통일

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

/** place에서 대표 이미지 URL 1개 뽑기 */
function pickFirstImageUrl(place) {
  const raw =
    place?.imageUrls ||
    place?.images ||
    place?.image_url ||
    place?.img_url ||
    place?.img ||
    place?.photo ||
    place?.photos ||
    "";

  if (Array.isArray(raw)) return raw[0] ? String(raw[0]) : "";
  if (typeof raw === "string") {
    const first = raw
      .split(/[,\n|]/g)
      .map((s) => s.trim())
      .filter(Boolean)[0];
    return first ? String(first) : "";
  }
  return "";
}

export default function PlacePopup({ open, place, onClose }) {
  const navigate = useNavigate();

  const [tab, setTab] = useState("home"); // home | review | photo | info
  const [moreOpen, setMoreOpen] = useState(false);

  // ✅ 즐겨찾기 상태(서버 기준)
  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewAvg, setReviewAvg] = useState(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewItems, setReviewItems] = useState([]);

  // ✅ API URL
  const REVIEWS_URL = `${API_BASE}/api/reviews`;

  // ✅ 안전한 카페 ID 계산
  const name = place?.name || place?.cafe_name || place?.title || "카페";
  const cafeIdRaw = place?.cafe_id ?? place?.cafeId ?? place?.id ?? place?.place_id;
  const cafeId = cafeIdRaw != null ? String(cafeIdRaw) : "";
  const favoriteCafeId = Number(cafeIdRaw); // ✅ 서버 favorites는 숫자 id를 기대하는 경우가 많음
  const hasValidFavoriteId = Number.isFinite(favoriteCafeId);
  /** ESC 닫기 */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /** 팝업 열릴 때 초기화 */
  useEffect(() => {
    if (open) {
      setTab("home");
      setMoreOpen(false);

      // 리뷰 상태 초기화(원하시면 제거 가능)
      setReviewLoading(false);
      setReviewError("");
      setReviewAvg(null);
      setReviewCount(0);
      setReviewItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !place) return;

    const token = localStorage.getItem("accessToken");
    if (!token || !hasValidFavoriteId) {
      setSaved(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const data = await apiFetch("/api/me/favorites");
        const items = Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.favorites)
          ? data.favorites
          : [];
        const exists = items.some((x) => Number(x.id ?? x.cafe_id ?? x.cafeId) === favoriteCafeId);
        if (alive) setSaved(exists);
      } catch {
        if (alive) setSaved(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, place, hasValidFavoriteId, favoriteCafeId]);

  /**
   * ✅ 수정: 다른 화면에서 즐겨찾기가 변경되면(이벤트) 팝업 버튼도 서버 기준으로 재동기화
   */
  useEffect(() => {
    if (!open || !place) return;

    const handler = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token || !hasValidFavoriteId) {
        setSaved(false);
        return;
      }
      try {
        const data = await apiFetch("/api/me/favorites");
        const items = Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.favorites)
          ? data.favorites
          : [];
        const exists = items.some((x) => Number(x.id ?? x.cafe_id ?? x.cafeId) === favoriteCafeId);
        setSaved(exists);
      } catch {
        // ignore
      }
    };

    window.addEventListener(FAVORITES_EVENT, handler);
    return () => window.removeEventListener(FAVORITES_EVENT, handler);
  }, [open, place, hasValidFavoriteId, favoriteCafeId]);


  const photos = useMemo(() => {
    if (!place) return [];

    const raw =
      place?.imageUrls ||
      place?.images ||
      place?.image_url ||
      place?.img_url ||
      place?.img ||
      place?.photo ||
      place?.photos ||
      "";

    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === "string") {
      arr = raw
        .split(/[,\n|]/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const uniq = [];
    const set = new Set();
    for (const u of arr) {
      const key = String(u);
      if (set.has(key)) continue;
      set.add(key);
      uniq.push(key);
    }
    return uniq;
  }, [place]);

  /** ✅ 저장 버튼 클릭 */
  const onToggleSave = async () => {
    if (!place || saveLoading) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      navigate("/login"); // ✅ 수정: 팝업에서도 상세페이지처럼 로그인 필요
      return;
    }

    if (!hasValidFavoriteId) {
      alert("이 카페의 ID가 올바르지 않아 즐겨찾기를 저장할 수 없습니다.");
      return;
    }

    setSaveLoading(true);
    try {
      if (!saved) {
        await apiFetch("/api/me/favorites", {
          method: "POST",
          body: {
            cafe_id: favoriteCafeId, // ✅ 수정: 서버가 기대하는 키로 전송
            name: place?.name || name,
            region: place?.region || "",
            address: place?.address || "",
            tags: Array.isArray(place?.tags) ? place.tags : [],
            imageUrl: pickFirstImageUrl(place),
          },
        });
        setSaved(true);
      } else {
        await apiFetch(`/api/me/favorites/${encodeURIComponent(String(favoriteCafeId))}`, {
          method: "DELETE",
        });
        setSaved(false);
      }

      // ✅ 수정: 마이페이지/다른 화면이 즉시 갱신되도록 이벤트 통일 발행
      window.dispatchEvent(new Event(FAVORITES_EVENT));
    } catch (e) {
      if (e?.status === 401 || e?.status === 403) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        navigate("/login");
        return;
      }
      alert(e?.message || "즐겨찾기 처리 중 오류가 발생했습니다.");
    } finally {
      setSaveLoading(false);
    }
  };

  // ✅ 리뷰 불러오기(리뷰 탭 열릴 때)
  useEffect(() => {
    if (!open || !place) return;
    if (tab !== "review") return;

    const controller = new AbortController();

    const loadReviews = async () => {
      setReviewLoading(true);
      setReviewError("");

      try {
        const qs = new URLSearchParams();
        qs.set("limit", "20");
        qs.set("offset", "0");

        const res = await fetch(`${REVIEWS_URL}?${qs.toString()}`, {
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) throw new Error(`리뷰 API 오류: ${res.status}`);

        const data = await res.json();

        // ✅ 유연 파싱: 서버 응답 형태가 달라도 최대한 맞춰줌
        const items = Array.isArray(data)
          ? data
          : Array.isArray(data.reviews)
          ? data.reviews
          : Array.isArray(data.items)
          ? data.items
          : [];

        const norm = items.map((r, idx) => ({
          id: r.id ?? r.review_id ?? r.reviewId ?? `${String(cafeIdRaw)}-${idx}`,
          nickname: r.nickname ?? r.user_nickname ?? r.user ?? r.author ?? "익명",
          rating: Number(r.rating ?? r.score ?? r.star ?? 0) || 0,
          content: r.content ?? r.text ?? r.review ?? "",
          createdAt: r.createdAt ?? r.created_at ?? r.date ?? "",
        }));

        const avgFromApi =
          typeof data.avgRating === "number"
            ? data.avgRating
            : typeof data.avg === "number"
            ? data.avg
            : null;

        const avgCalc =
          norm.length > 0
            ? norm.reduce((a, b) => a + (Number(b.rating) || 0), 0) / norm.length
            : null;

        setReviewItems(norm);
        setReviewCount(
          typeof data.totalCount === "number"
            ? data.totalCount
            : typeof data.count === "number"
            ? data.count
            : norm.length
        );
        setReviewAvg(avgFromApi ?? avgCalc);
      } catch (e) {
        if (e?.name === "AbortError") return;
        setReviewError(e?.message || "리뷰를 불러오지 못했습니다.");
      } finally {
        setReviewLoading(false);
      }
    };

    loadReviews();

    return () => controller.abort();
  }, [open, place, tab, REVIEWS_URL]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("ko-KR");
  };

  const RatingLine = ({ value }) => {
    const n = Math.max(0, Math.min(5, Number(value) || 0));
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden>★</span>
        <span style={{ fontWeight: 800 }}>{n.toFixed(1)}</span>
      </span>
    );
  };

  if (!open || !place) return null;

  const address = place?.address || "주소 정보 없음";
  const region = place?.region || "";
  const score = place?.score ? Number(place.score).toFixed(1) : null;

  const phone = place?.phone || place?.tel || place?.telephone || place?.contact || "";
  const homepage = place?.homepage || place?.site || place?.website || place?.url || "";
  const hours = place?.hours || place?.open_hours || place?.openTime || place?.time || "";

  const atmos = place?.atmosphere || place?.atmosphere_norm || "";
  const purpose = place?.purpose || place?.purpose_norm || "";
  const taste = place?.taste || place?.taste_norm || "";
  const parking = place?.parking || "";

  const desc = place?.content || place?.summary || place?.desc || "";

  const lat = place?.y;
  const lng = place?.x;

  const kakaoMapUrl =
    place?.url || (lat && lng ? `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}` : "");

  const topPhotos = photos.slice(0, 3);
  const extraCount = Math.max(0, photos.length - topPhotos.length);

  // ✅ tab 연동 이동 (tab=review 로 상세페이지 리뷰 섹션/탭 오픈)
  const goDetail = (targetTab = "home") => {
    sessionStorage.setItem("dalcomm_keep_map_state_v1", "1");

    const params = new URLSearchParams();
    params.set("name", name);
    if (targetTab && targetTab !== "home") params.set("tab", targetTab);

    const hash = targetTab === "review" ? "#reviews" : "";
    navigate(`/cafe/${cafeId}?${params.toString()}${hash}`, {
      state: { cafe: place, initialTab: targetTab },
    });

    onClose?.();
  };

  const InfoRow = ({ label, value, href }) => {
    if (!value) return null;
    return (
      <div className="pp-info-row">
        <div className="pp-info-label">{label}</div>
        <div className="pp-info-value">
          {href ? (
            <a className="pp-link" href={href} target="_blank" rel="noreferrer">
              {value}
            </a>
          ) : (
            value
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="place-modal-backdrop" role="dialog" aria-modal="true">
      <div className="place-modal pp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pp-handle" />

        {/* 사진 영역 */}
        <div className="pp-hero">
          <div className="pp-photoGrid">
            {topPhotos.length === 0 ? (
              <div className="pp-photo pp-photoMain pp-photoPh">사진 없음</div>
            ) : (
              <>
                <div className="pp-photo pp-photoMain">
                  <img className="pp-photoImg" src={topPhotos[0]} alt="대표 사진" />
                </div>

                <div className="pp-photoCol">
                  <div className="pp-photo">
                    {topPhotos[1] ? (
                      <img className="pp-photoImg" src={topPhotos[1]} alt="사진" />
                    ) : (
                      <div className="pp-photoPh">사진</div>
                    )}
                  </div>

                  <div className="pp-photo pp-photoLast">
                    {topPhotos[2] ? (
                      <img className="pp-photoImg" src={topPhotos[2]} alt="사진" />
                    ) : (
                      <div className="pp-photoPh">사진</div>
                    )}
                    {extraCount > 0 ? <div className="pp-moreBadge">+{extraCount}</div> : null}
                  </div>
                </div>
              </>
            )}
          </div>

          <button className="pp-close" type="button" onClick={onClose} aria-label="닫기" title="닫기">
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="pp-body">
          <div className="pp-titleArea">
            <div className="pp-title">
              {name}
              {score ? <span className="pp-score">★ {score}</span> : null}
            </div>
            <div className="pp-sub">
              {region ? <span className="pp-subItem">{region}</span> : null}
              <span className="pp-subItem">{address}</span>
            </div>
          </div>

          {/* ✅ 저장/리뷰 버튼 2열 정렬 + 버튼 내부 세로정렬 (정렬은 건드리지 않음) */}
          <div className="pp-miniActions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button
              className={`pp-miniBtn ${saved ? "is-on" : ""}`}
              type="button"
              onClick={onToggleSave}
              title="저장"
              aria-pressed={saved}
              disabled={saveLoading}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 0",
              }}
            >
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                ⭐
              </span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{saved ? "저장됨" : "저장"}</span>
            </button>

            {/* ✅ 리뷰 버튼 클릭 -> 상세페이지 리뷰 탭으로 이동 */}
            <button
              className="pp-miniBtn"
              type="button"
              onClick={() => goDetail("review")}
              title="리뷰"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 0",
              }}
            >
              <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                ✍️
              </span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>리뷰</span>
            </button>
          </div>

          <div className="pp-tabs">
            <button type="button" className={`pp-tab ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
              홈
            </button>
            <button
              type="button"
              className={`pp-tab ${tab === "review" ? "active" : ""}`}
              onClick={() => setTab("review")}
            >
              리뷰
            </button>
            <button
              type="button"
              className={`pp-tab ${tab === "photo" ? "active" : ""}`}
              onClick={() => setTab("photo")}
            >
              사진
            </button>
            <button
              type="button"
              className={`pp-tab ${tab === "info" ? "active" : ""}`}
              onClick={() => setTab("info")}
            >
              정보
            </button>
          </div>

          {tab === "home" && (
            <>
              <div className="pp-chipRow">
                {atmos ? <span className="pp-chip">분위기: {atmos}</span> : null}
                {purpose ? <span className="pp-chip">목적: {purpose}</span> : null}
                {taste ? <span className="pp-chip">맛: {taste}</span> : null}
                {parking ? <span className="pp-chip">주차: {parking}</span> : null}
              </div>

              {desc ? <div className="pp-desc">{desc}</div> : null}

              <div className="pp-infoBox">
                <InfoRow label="주소" value={address} />
                <InfoRow label="전화" value={phone} href={phone ? `tel:${phone}` : ""} />
                <InfoRow label="영업" value={hours} />
                <InfoRow label="홈페이지" value={homepage} href={homepage} />
              </div>

              <div className="pp-bottomActions">
                <button className="pp-mainBtn" type="button" onClick={() => goDetail("home")}>
                  상세페이지
                </button>
              </div>
            </>
          )}

          {tab === "review" && (
            <div className="pp-tabBox">
              <div className="pp-tabTitle">리뷰</div>

              {reviewLoading ? (
                <div className="pp-tabText">리뷰 불러오는 중...</div>
              ) : reviewError ? (
                <div className="pp-tabText" style={{ color: "#c0392b" }}>
                  {reviewError}
                </div>
              ) : reviewItems.length === 0 ? (
                <div className="pp-tabText">등록된 리뷰가 없어요.</div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 2px 12px",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 900 }}>
                      평균{" "}
                      {reviewAvg == null ? (
                        "-"
                      ) : (
                        <span style={{ marginLeft: 6 }}>
                          <RatingLine value={reviewAvg} />
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>총 {reviewCount}개</div>
                  </div>

                  <div style={{ maxHeight: 220, overflow: "auto", paddingRight: 4 }}>
                    {reviewItems.slice(0, 20).map((r) => (
                      <div
                        key={r.id}
                        style={{
                          padding: "10px 0",
                          borderBottom: "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{r.nickname}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 900 }}>
                              <RatingLine value={r.rating} />
                            </span>
                            <span style={{ fontSize: 11, opacity: 0.6 }}>{formatDate(r.createdAt)}</span>
                          </div>
                        </div>

                        {r.content ? (
                          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45 }}>{r.content}</div>
                        ) : (
                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>(내용 없음)</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "photo" && (
            <div className="pp-tabBox">
              <div className="pp-tabTitle">사진</div>
              {photos.length === 0 ? (
                <div className="pp-tabText">등록된 사진이 없어요.</div>
              ) : (
                <div className="pp-photoAll">
                  {photos.map((p, i) => (
                    <div className="pp-photoThumb" key={`${p}-${i}`}>
                      <img className="pp-photoImg" src={p} alt="사진" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "info" && (
            <div className="pp-tabBox">
              <div className="pp-tabTitle">정보</div>
              <div className="pp-infoBox">
                <InfoRow label="주소" value={address} />
                <InfoRow label="전화" value={phone} href={phone ? `tel:${phone}` : ""} />
                <InfoRow label="영업" value={hours} />
                <InfoRow label="홈페이지" value={homepage} href={homepage} />
                <InfoRow label="주차" value={parking} />
              </div>

              <div className="pp-bottomActions">
                <button className="pp-mainBtn" type="button" onClick={() => goDetail("home")}>
                  상세페이지
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
