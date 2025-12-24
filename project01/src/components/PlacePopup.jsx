// src/components/PlacePopup.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PhotoLightbox from "./PhotoLightbox";

const API_BASE = import.meta.env.VITE_API_BASE || ""; // ✅ 서버 API base
const FAVORITES_EVENT = "dalcomm_favorites_changed"; // ✅ 이벤트명 통일

async function apiFetch(path, { method = "GET", body, signal } = {}) {
  const token = localStorage.getItem("accessToken");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    signal,
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

function renderStars(n) {
  const x = Math.max(0, Math.min(5, Number(n) || 0));
  return "★".repeat(x) + "☆".repeat(5 - x);
}

/* =========================================================
 * ✅ 카테고리 정리.txt 기반: 태그 분류 + 중복 제거
 * - 분위기/방문목적/맛(=메뉴+맛)/주차/키워드(요약)
 * ========================================================= */

// 카테고리 정리.txt를 그대로 코드화
const SET_ATMOSPHERE = new Set([
  // 조용한
  "조용",
  "심플",
  "미니멀",

  // 편안한
  "편안",
  "포근",
  "상큼",
  "따뜻하다",
  "묵직",
  "한적",
  "안락",

  // 감성적인
  "감성",
  "감각",
  "아늑",
  "풍미",
  "전통",
  "차분",
  "유럽",
  "무드",
  "모던",
  "잔잔",
  "한옥",
  "기와",

  // 상태
  "깔끔",
  "넓다",
  "넓음",
  "넉넉",
  "채광",
  "쾌적",
  "햇살",
  "창가",
  "야외",
  "테라스",
  "마당",
  "좌석",
  "자리",
  "따뜻",
  "전망",
  "와이파이",
  "폭신",
  "넓직",
  "빈티지",
  "세련",
  "산뜻",
  "뷰",
  "대관",
  "리치",
  "드넓다",
  "고택",

  // 애견
  "강아지",
]);

const SET_MENU = new Set([
  // 커피/음료
  "아메리카노",
  "말차",
  "카라멜",
  "라떼",
  "카페라떼",
  "에이드",
  "바닐라빈",
  "밀크티",
  "에스프레소",
  "파르페",
  "카카오파르페",
  "콜드브루",
  "밀크",
  "다크",
  "딸게라떼",
  "딸기라떼",

  // 디저트/식사
  "케이크",
  "버터",
  "마들렌",
  "쿠키",
  "샌드위치",
  "아이스크림",
  "소금",
  "샐러드",
  "브런치",
  "피자",
  "파스타",
  "빙수",
  "팥빙수",
  "휘낭시에",
  "식빵",
  "파이",
  "타르트",
  "푸딩",
  "토스트",
  "티라미수",
  "베이글",
  "브라우니",
  "잠봉뵈르",
  "크루아상",
  "스콘",
  "와플",
  "젤라또",
  "치즈",
  "치즈케이크",
  "스테이크",
  "팬케이크",
  "파니니",
  "포케",
  "애플파이",
  "컵케이크",
  "쫀득쿠키",
  "버터바",
  "에그타르트",
  "크로플",
  "롤케이크",
  "쫀득모찌빵",
  "카타이프",
  "카다이프",
]);

// 맛(형용사/재료) - 데이터에 있으면 메뉴와 함께 표시됨
const SET_TASTE = new Set([
  "달콤",
  "쫀득",
  "고소",
  "담백",
  "진하다",
  "촉촉",
  "짭짤",
  "새콤",
  "쌉싸름",

  // 과일/견과
  "레몬",
  "딸기",
  "바나나",
  "망고",
  "땅콩",
  "피스타치오",
  "아몬드",
  "피넛",
  "호두",
]);

const SET_PURPOSE = new Set([
  "힐링",
  "데이트",
  "인스타",
  "수다",
  "모임",
  "가족",
  "작업",
  "친구",
  "아기",
  "아이",
  "부모",
  "연인",
  "포토존",
  "혼자",
  "공부",
  "키즈",
  "커플",
  "어린이",
  "노트북",
  "유모차",
  "콘센트",
  "마을",
  "어린이집",
  "반려",
  "토스트기",
]);

// 표기 흔들림/동의어 정규화
const CANON = {
  넓다: "넓음",
  넓직: "넓음",
  드넓다: "넓음",
  따뜻하다: "따뜻",
  카페라떼: "라떼",
  딸게라떼: "딸기라떼",
  카타이프: "카다이프",
};

function cleanText(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (s === "\\N" || lower === "null" || lower === "undefined" || lower === "nan") return "";
  return s;
}

// 토큰 분리( | , / · 줄바꿈 + 공백 )
function splitTokens(input) {
  if (input == null) return [];
  const s = Array.isArray(input) ? input.join("|") : String(input);

  // "분위기:" 같은 라벨이 섞여 있으면 제거
  const cleaned = s
    .replace(/(분위기|목적|맛|메뉴|키워드|주차)\s*[:：]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const parts = cleaned
    .split(/[|,\n·/]/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const out = [];
  for (const p of parts) {
    const tokens = p.split(/\s+/g).map((x) => x.trim()).filter(Boolean);
    out.push(...tokens);
  }
  return out;
}

function normToken(t) {
  if (!t) return "";
  const v = String(t)
    .replace(/[(){}\[\]]/g, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!v) return "";

  const lower = v.toLowerCase();
  if (v === "\\N" || lower === "null" || lower === "undefined" || lower === "nan") return "";

  return CANON[v] || v;
}

function normalizeParking(v) {
  const s = cleanText(v);
  if (!s) return "";

  // "불가/없음"이 데이터 미기재 의미로 쓰인 경우 → 빈칸 처리
  if (/^(불가|없음)$/i.test(s)) return "";

  // 명시적으로 주차를 말하는 경우만 표시
  if (/(주차\s*가능|주차가능)/i.test(s)) return "가능";
  if (/(주차\s*불가|주차불가)/i.test(s)) return "불가";

  // 그 외 표현(있음/O, X 등)
  if (/(가능|O|있음)/i.test(s)) return "가능";
  if (/(X)/i.test(s)) return "불가";

  return s;
}

function joinTags(list, sep = " · ") {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  return arr.length ? arr.join(sep) : "";
}

// place의 여러 필드에서 토큰을 모아 카테고리로 재분류
function derivePopupCategories(place) {
  if (!place)
    return { atmos: [], purpose: [], taste: [], menu: [], keywords: [], parking: "" };

  const atmos = [];
  const purpose = [];
  const taste = [];
  const menu = [];
  const extra = [];

  const seen = new Set();

  const push = (arr, t) => {
    const v = normToken(t);
    if (!v) return;
    if (seen.has(v)) return;
    seen.add(v);
    arr.push(v);
  };

  const addFrom = (arr, v) => {
    if (typeof v === "string" && /정보\s*없음|미제공/.test(v)) return; // ✅ placeholder 제거
    for (const t of splitTokens(v)) push(arr, t);
  };

  // 1) 카테고리별 필드 우선(이미 서버가 분리해서 내려주는 값)
  [place.atmosphere, place.atmosphere_norm, place.atmosphereTags].forEach((v) => addFrom(atmos, v));
  [place.purpose, place.purpose_norm, place.purposeTags].forEach((v) => addFrom(purpose, v));
  [place.taste, place.taste_norm, place.tasteTags].forEach((v) => addFrom(taste, v));

  [
    place.menuTags,
    place.mainMenu,
    place.main_menu,
    place.menu,
    place.main_dessert,
    place.main_coffee,
  ].forEach((v) => addFrom(menu, v));

  // 2) 나머지 키워드/태그/카운트는 보조적으로 분류
  const rawBuckets = [
    place.keywords,
    place.keyword,
    place.keyWords,
    place.tags,
    place.topKeywords,
    place.keywordCounts,
  ];

  const all = [];
  for (const v of rawBuckets) all.push(...splitTokens(v));

  for (const t0 of all) {
    const t = normToken(t0);
    if (!t || seen.has(t)) continue;

    if (SET_ATMOSPHERE.has(t)) push(atmos, t);
    else if (SET_PURPOSE.has(t)) push(purpose, t);
    else if (SET_TASTE.has(t)) push(taste, t);
    else if (SET_MENU.has(t)) push(menu, t);
    else push(extra, t);
  }

  const keywords = [...atmos, ...purpose, ...taste, ...menu, ...extra].slice(0, 12);
  const parking = normalizeParking(place.parking ?? place._parking ?? "");

  return { atmos, purpose, taste, menu, keywords, parking };
}

export default function PlacePopup({ open, place, onClose }) {
  const navigate = useNavigate();

  const [tab, setTab] = useState("home"); // home | review | photo | info
  const [moreOpen, setMoreOpen] = useState(false);
  const [detailCafe, setDetailCafe] = useState(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  // ✅ 즐겨찾기 상태(서버 기준)
  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewAvg, setReviewAvg] = useState(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewItems, setReviewItems] = useState([]);

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
     if (e.key !== "Escape") return;
     if (photoViewerOpen) setPhotoViewerOpen(false);
     else onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, photoViewerOpen]);

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

  
  useEffect(() => {
    if (!open || !hasValidFavoriteId) {
      setDetailCafe(null);
      return;
    }

    // 태그/평점이 이미 있으면 굳이 호출하지 않도록(원하면 이 조건 제거 가능)
    const hasAnyTagField = Boolean(
      place?.atmosphere || place?.purpose || place?.taste || place?.menu || place?.mainMenu || place?.main_menu
    );
    const hasAnyRatingField = place?.rating != null || place?.userRatingAvg != null;

    if (hasAnyTagField && hasAnyRatingField) {
      setDetailCafe(null);
      return;
    }

    const controller = new AbortController();
    (async () => {
      try {
        const data = await apiFetch(`/api/cafes/${encodeURIComponent(String(favoriteCafeId))}`, {
          signal: controller.signal,
        });
        setDetailCafe(data?.cafe ?? data?.item ?? data);
      } catch (e) {
        if (e?.name !== "AbortError") setDetailCafe(null);
      }
    })();

    return () => controller.abort();
  }, [open, hasValidFavoriteId, favoriteCafeId]); 

  /**
   * ✅ 다른 화면에서 즐겨찾기가 변경되면(이벤트) 팝업 버튼도 서버 기준으로 재동기화
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

  const mergedPlace = useMemo(() => {
    if (!place) return null;
    const merged = detailCafe ? { ...place, ...detailCafe } : place;

    // 좌표가 lat/lon으로 오는 경우 대비 (있으면 x/y로 보강)
    if (merged.x == null && merged.lon != null) merged.x = merged.lon;
    if (merged.y == null && merged.lat != null) merged.y = merged.lat;

    // rating alias 보강
    if (merged.rating == null && merged.userRatingAvg != null) merged.rating = merged.userRatingAvg;

    return merged;
  }, [place, detailCafe]);

  const cat = useMemo(() => derivePopupCategories(mergedPlace), [mergedPlace]);
    
  /** ✅ 저장 버튼 클릭 */
  const onToggleSave = async () => {
    if (!place || saveLoading) return;

    const token = localStorage.getItem("accessToken");
    if (!token) {
      navigate("/login");
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
            cafe_id: favoriteCafeId,
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

    if (!hasValidFavoriteId) {
      setReviewError("카페 ID가 없어 리뷰를 불러올 수 없습니다.");
      return;
    }

    const controller = new AbortController();

    const loadReviews = async () => {
      setReviewLoading(true);
      setReviewError("");

      try {
        const qs = new URLSearchParams();
        qs.set("limit", "20");
        qs.set("offset", "0");

        const path = `/api/cafes/${encodeURIComponent(String(favoriteCafeId))}/user-reviews?${qs.toString()}`;

        const data = await apiFetch(path, { signal: controller.signal });

        const items = Array.isArray(data)
          ? data
          : Array.isArray(data.reviews)
          ? data.reviews
          : Array.isArray(data.items)
          ? data.items
          : [];

        const norm = items.map((r, idx) => ({
          id: r.id ?? r.review_id ?? r.reviewId ?? `${String(favoriteCafeId)}-${idx}`,
          nickname: r.nickname ?? r.user_nickname ?? r.user ?? r.author ?? "익명",
          rating: Number(r.rating ?? r.score ?? r.star ?? 0) || 0,
          content: r.content ?? r.text ?? r.review ?? "",
          createdAt: r.createdAt ?? r.created_at ?? r.date ?? "",
        }));

        setReviewItems(norm);
        setReviewCount(
          typeof data.totalCount === "number"
            ? data.totalCount
            : typeof data.count === "number"
            ? data.count
            : norm.length
        );
      } catch (e) {
        if (e?.name === "AbortError") return;

        if (e?.status === 401 || e?.status === 403) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
          navigate("/login");
          return;
        }

        setReviewError(e?.message || "리뷰를 불러오지 못했습니다.");
      } finally {
        setReviewLoading(false);
      }
    };

    loadReviews();
    return () => controller.abort();
  }, [open, place, tab, hasValidFavoriteId, favoriteCafeId, navigate]);

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

  // ✅ 팝업이 닫혀있거나 place 없으면 렌더링 안함 (하지만 훅은 위에서 이미 모두 호출됨)
  if (!open || !place) return null;

  const address = cleanText(mergedPlace?.address) || "주소 정보 없음";
  const region = cleanText(mergedPlace?.region);
  const ratingValue = mergedPlace?.userRatingAvg ?? mergedPlace?.rating;
  const ratingNum = ratingValue == null ? null : Number(ratingValue);
  const hasRating = Number.isFinite(ratingNum);

  const phone = cleanText(
    mergedPlace?.phone || mergedPlace?.tel || mergedPlace?.telephone || mergedPlace?.contact
  );
  const homepage = cleanText(
    mergedPlace?.homepage || mergedPlace?.site || mergedPlace?.website || mergedPlace?.url
  );
  const hours = cleanText(
    mergedPlace?.hours || mergedPlace?.open_hours || mergedPlace?.openTime || mergedPlace?.time
  );

  // ✅ 중복 제거 + 재분류 결과
// 기존: const atmosText = joinTags(cat.atmos); ...
  const atmosText = joinTags(cat.atmos);
  const tasteText = joinTags(cat.taste);      // ✅ 맛만
  const purposeText = joinTags(cat.purpose);
  const menuText = joinTags(cat.menu);        // ✅ 메뉴만
  const keywordsText = joinTags(cat.keywords);
  const parkingText = cleanText(cat.parking) || normalizeParking(place?.parking);


  const desc = mergedPlace?.content || mergedPlace?.summary || mergedPlace?.desc || "";

  const lat = mergedPlace?.y;
  const lng = mergedPlace?.x;

  const kakaoMapUrl =
    mergedPlace?.url || (lat && lng ? `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}` : "");

  const topPhotos = photos.slice(0, 3);
  
  const openPhotoViewer = (i) => {
    if (!photos.length) return;
    const clamped = Math.max(0, Math.min(i, photos.length - 1));
    setPhotoViewerIndex(clamped);
    setPhotoViewerOpen(true);
  };
  const extraCount = Math.max(0, photos.length - topPhotos.length);

  // ✅ tab 연동 이동 (tab=review 로 상세페이지 리뷰 섹션/탭 오픈)
  const goDetail = (targetTab = "home") => {
    sessionStorage.setItem("dalcomm_keep_map_state_v1", "1");

    const params = new URLSearchParams();
    params.set("name", name);
    if (targetTab && targetTab !== "home") params.set("tab", targetTab);

    const hash = targetTab === "review" ? "#reviews" : "";
    navigate(`/cafe/${cafeId}?${params.toString()}${hash}`, {
      state: { cafe: mergedPlace, initialTab: targetTab },
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
                    <button
                      type="button"
                      onClick={() => openPhotoViewer(0)}
                      aria-label="대표 사진 크게 보기"
                      style={{ border: 0, padding: 0, background: "transparent", width: "100%", height: "100%", cursor: "zoom-in" }}
                    >
                      <img className="pp-photoImg" src={topPhotos[0]} alt="대표 사진" />
                    </button>
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
              <span className="pp-score">
                평점 {hasRating ? <RatingLine value={ratingNum} /> : "평균없음"}</span>
            </div>
            <div className="pp-sub">
              {region ? <span className="pp-subItem">{region}</span> : null}
              <span className="pp-subItem">{address}</span>
            </div>
          </div>

          {/* ✅ 저장/리뷰 버튼 2열 정렬 (정렬 유지) */}
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
            <button type="button" className={`pp-tab ${tab === "photo" ? "active" : ""}`} onClick={() => setTab("photo")}>
              사진
            </button>
            <button type="button" className={`pp-tab ${tab === "info" ? "active" : ""}`} onClick={() => setTab("info")}>
              정보
            </button>
          </div>

          {tab === "home" && (
            <>
              <div className="pp-chipRow">
                <span className="pp-chip">분위기:{atmosText ? ` ${atmosText}` : ""}</span>
                <span className="pp-chip">맛:{tasteText ? ` ${tasteText}` : ""}</span>
                <span className="pp-chip">목적:{purposeText ? ` ${purposeText}` : ""}</span>
                <span className="pp-chip">메뉴:{menuText ? ` ${menuText}` : ""}</span>
                <span className="pp-chip">주차:{parkingText ? ` ${parkingText}` : ""}</span>
              </div>

              {/* {keywordsText ? (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, lineHeight: 1.35 }}>
                  키워드: {keywordsText}
                </div>
              ) : null} */}

              {/* {desc ? <div className="pp-desc">{desc}</div> : null} */}

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
                         <button
                           type="button"
                           onClick={() => openPhotoViewer(i)}
                           aria-label="사진 크게 보기"
                           style={{ border: 0, padding: 0, background: "transparent", width: "100%", cursor: "zoom-in" }}
                         >
                           <img className="pp-photoImg" src={p} alt="사진" />
                         </button>
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
                <InfoRow label="주차" value={parkingText} />
              </div>

              <div className="pp-bottomActions">
                <button className="pp-mainBtn" type="button" onClick={() => goDetail("home")}>
                  상세페이지
                </button>
              </div>
            </div>
          )}
        </div>
      <PhotoLightbox
        open={photoViewerOpen}
        photos={photos}
        index={photoViewerIndex}
        onIndexChange={setPhotoViewerIndex}
        onClose={() => setPhotoViewerOpen(false)}
      />
      </div>
    </div>
  );
}
