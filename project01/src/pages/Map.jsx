// Map.jsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import KakaoMap from "../components/KakaoMap";
import PlacePopup from "../components/PlacePopup";
import { useLocation, useSearchParams } from "react-router-dom";


const getCafeKey = (cafe) =>
  String(
    cafe?.cafe_id ??
      cafe?.id ??
      cafe?.place_id ??
      cafe?.kakao_id ??
      cafe?.naver_id ??
      `${cafe?.name || ""}|${cafe?.address || ""}`
  );

const STORE_KEY = "dalcomm_map_state_v1";
const VIEW_KEY = "dalcomm_map_view_v1";
const KEEP_KEY = "dalcomm_keep_map_state_v1";


// ✅ 지역 표기(사이드바/상단검색) -> 데이터/서버 매칭용(여러 표기) 확장
const REGION_ALIASES = {
  "광주 전체": ["광주", "광주광역시", "gwangju"],
  "광주 동구": ["광주 동구", "광주광역시 동구", "동구", "dong-gu"],
  "광주 남구": ["광주 남구", "광주광역시 남구", "남구", "nam-gu"],
  "광주 북구": ["광주 북구", "광주광역시 북구", "북구", "buk-gu"],
  "광주 서구": ["광주 서구", "광주광역시 서구", "서구", "seo-gu"],
  "광주 광산구": ["광주 광산구", "광주광역시 광산구", "광산구", "gwangsan-gu"],
  나주: ["나주", "naju"],
  담양: ["담양", "damyang"],
  화순: ["화순", "hwasun"],
};

const REGION_TOKEN_TO_KEY = {
  // 광주(전체)
  "광주전체": "광주 전체",
  "광주 전체": "광주 전체",
  "광주광역시": "광주 전체",
  "광주": "광주 전체",

  // 광주 구(구 단독 입력도 지원)
  "광주광역시 동구": "광주 동구",
  "광주광역시 남구": "광주 남구",
  "광주광역시 북구": "광주 북구",
  "광주광역시 서구": "광주 서구",
  "광주광역시 광산구": "광주 광산구",

  "광주 동구": "광주 동구",
  "광주 남구": "광주 남구",
  "광주 북구": "광주 북구",
  "광주 서구": "광주 서구",
  "광주 광산구": "광주 광산구",

  동구: "광주 동구",
  남구: "광주 남구",
  북구: "광주 북구",
  서구: "광주 서구",
  광산구: "광주 광산구",

  // 기타 지역
  나주: "나주",
  담양: "담양",
  화순: "화순",
};

const REGION_TOKENS = Object.keys(REGION_TOKEN_TO_KEY).sort((a, b) => b.length - a.length);

function expandRegionTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    const key = REGION_TOKEN_TO_KEY[t] || t;
    const aliases = REGION_ALIASES[key] || [key];
    for (const v of aliases) {
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function compactCafe(c) {
  if (!c) return c;
  return {
   cafe_id: c.cafe_id ?? c.id ?? c.cafeId ?? c.cafeID ?? null, // ✅ 보존
id: c.cafe_id ?? c.id ?? c.cafeId ?? c.cafeID ?? null,      // ✅ cafe_id 우선
    name: c.name,
    address: c.address,
    region: c.region,
    x: c.x,
    y: c.y,
    url: c.url ?? c.mapUrl ?? "",

    score: c.score,

    phone: c.phone ?? c.tel ?? c.telephone ?? c.contact ?? "",
    homepage: c.homepage ?? c.site ?? c.website ?? "",
    hours: c.hours ?? c.open_hours ?? c.openTime ?? c.time ?? "",

    atmosphere: c.atmosphere,
    atmosphere_norm: c.atmosphere_norm,
    purpose: c.purpose,
    purpose_norm: c.purpose_norm,
    taste: c.taste,
    taste_norm: c.taste_norm,
    parking: c.parking,

    content: c.content,
    summary: c.summary,
    desc: c.desc,

    images:
      c.imageUrls ??
      c.images ??
      c.image_url ??
      c.img_url ??
      c.img ??
      c.photo ??
      c.photos ??
      "",
  };
}

export default function Map() {
  const pendingFocusRef = useRef(null);

  const normStr = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();


  const [sidebarPrefs, setSidebarPrefs] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(null);

  const location = useLocation();
  const [sp] = useSearchParams();

  const [hasSearched, setHasSearched] = useState(false);
  const [topQuery, setTopQuery] = useState("");

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupPlace, setPopupPlace] = useState(null);

  // ✅ 지도 뷰/자동 bounds 제어
  const [initialView, setInitialView] = useState(null);
  const [fitBoundsOnResults, setFitBoundsOnResults] = useState(false);

  // ✅ “복구 중 저장 방지” 플래그
  const restoringRef = useRef(true);
  // ✅ 언마운트 직전에도 최신 state를 저장할 수 있게 ref로 보관
  const latestRef = useRef(null);
 latestRef.current = { isSidebarOpen, hasSearched, topQuery, focusedIndex, searchResults, sidebarPrefs };

 

const API_BASE = import.meta.env.VITE_API_BASE || "";
const filterUrl = API_BASE ? `${API_BASE}/api/filter` : "/api/filter";


  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  const openPopup = (place) => {
    setPopupPlace(place || null);
    setPopupOpen(true);
  };

  const closePopup = () => {
    setPopupOpen(false);
    setPopupPlace(null);
  };

  const cleanText = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v).trim();
    if (!s) return "";
    const sl = s.toLowerCase();
    // "null", "\N", "undefined" 같은 플레이스홀더 제거
    if (sl === "null" || sl === "\\n" || sl === "undefined") return "";
    return s;
  };

  // 태그 필드 전용: "가족, null" / "가족 | null" / ["가족","null"] 같은 케이스까지 제거
  const cleanTagField = (v) => {
    if (Array.isArray(v)) {
      return v.map(cleanText).filter(Boolean).join(" · ");
    }
    const s = cleanText(v);
    if (!s) return "";
    // 구분자가 섞여 있어도 토큰 단위로 정리
    const tokens = s.split(/[,\|·]/g).map((x) => cleanText(x));
    return tokens.filter(Boolean).join(" · ");
  };

  const getTagLine = (cafe) => {
    const atmos = cleanTagField(cafe?.atmosphere_norm) || cleanTagField(cafe?.atmosphere);
    const purpose = cleanTagField(cafe?.purpose_norm) || cleanTagField(cafe?.purpose);
    const taste = cleanTagField(cafe?.taste_norm) || cleanTagField(cafe?.taste);

    return [atmos, purpose, taste]
      .filter(Boolean)
      .join(" | ")
      .replace(/\s*\|\s*/g, " · ")
      .trim();
  };

  const pickFirstString = (arr) =>
  (arr || []).find((v) => typeof v === "string" && v.trim()) || "";

  const getThumbUrl = (cafe) => {
    const raw =
      cafe?.imageUrls ??
      cafe?.images ??
      cafe?.images_json ??
      cafe?.imagesJson ??
      cafe?.photos ??
      cafe?.photo ??
      cafe?.img_url ??
      cafe?.image_url ??
      cafe?.img ??
      "";

    // 배열이면 그대로 첫 장
    if (Array.isArray(raw)) {
      const u = pickFirstString(raw);
      return u.startsWith("http") ? u : "";
    }

    // 문자열이면 JSON/CSV/단일 URL 대응
    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) return "";

      // JSON string (예: ["url1","url2"])
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          const u = pickFirstString(parsed);
          return u.startsWith("http") ? u : "";
        }
        if (typeof parsed === "string") {
          return parsed.startsWith("http") ? parsed : "";
        }
      } catch {}

      // 콤마 구분 (예: url1,url2)
      if (s.includes(",")) {
        const u = s.split(",").map((v) => v.trim()).find(Boolean) || "";
        return u.startsWith("http") ? u : "";
      }

      // 단일 URL
      return s.startsWith("http") ? s : "";
    }

    return "";
  };

  const visibleCount = useMemo(() => {
    return (searchResults || []).filter((c) => c && c.x && c.y).length;
  }, [searchResults]);

  // ✅ 최초 진입/뒤로가기 복구: useLayoutEffect로 “먼저” 복구해서
  //    빈 state가 저장되어 덮이는 문제를 막습니다.
  useLayoutEffect(() => {

    const savedState = safeParse(sessionStorage.getItem(STORE_KEY));
    const savedView = safeParse(sessionStorage.getItem(VIEW_KEY));
    const reset = sp.get("reset") === "1";
    if (reset) {
    sessionStorage.removeItem(STORE_KEY);
    sessionStorage.removeItem(VIEW_KEY);
    restoringRef.current = false;
    return;
  }
    if (savedState) {
      setIsSidebarOpen(savedState.isSidebarOpen ?? true);
      setSearchResults(savedState.searchResults ?? []);
      setFocusedIndex(savedState.focusedIndex ?? null);
      setHasSearched(!!savedState.hasSearched);
      setTopQuery(savedState.topQuery ?? "");
      setSidebarPrefs(savedState.sidebarPrefs ?? null);
    }

    if (savedView && typeof savedView.lat === "number" && typeof savedView.lng === "number") {
      setInitialView(savedView);
      setFitBoundsOnResults(false);
    } else {
      if (savedState?.searchResults?.length) setFitBoundsOnResults(true);
    }

    restoringRef.current = false;
  }, []);

  // ✅ 상태 변경 시 저장 (복구 끝난 뒤에만)
  useEffect(() => {
    if (restoringRef.current) return;
    try {
      const payload = {
        isSidebarOpen,
        hasSearched,
        topQuery,
        focusedIndex,
        searchResults: (searchResults || []).map(compactCafe),
        // sidebarPrefs: s.sidebarPrefs ?? null,  
      };
      sessionStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("[Map] sessionStorage save failed:", e);
    }
    }, [isSidebarOpen, hasSearched, topQuery, focusedIndex, searchResults, sidebarPrefs]);

useEffect(() => {
  const stateCafe = location.state?.focusCafe || null;
  const focusParam = sp.get("focus"); // /map?focus=123

  if (!stateCafe && !focusParam) return;

  const normalize = (c) =>
    compactCafe({
      ...c,
      x: c.x ?? c.lon ?? c.lng ?? c.longitude,
      y: c.y ?? c.lat ?? c.latitude,
      url: c.url ?? c.mapUrl ?? c.kakaoMapUrl ?? "",
      photos: c.photos ?? c.images_json ?? c.imagesJson ?? c.imageUrls ?? c.images ?? [],
    });

  const target = stateCafe ? normalize(stateCafe) : null;

  const list = Array.isArray(searchResults) ? searchResults : [];

  // ✅ 1) stateCafe가 있으면 "이름+주소"로 먼저 찾기 (가장 확실)
  let idx = -1;
  if (target?.name) {
    const tn = normStr(target.name);
    const ta = normStr(target.address);
    idx = list.findIndex((p) => {
      if (!p) return false;
      const pn = normStr(p.name);
      const pa = normStr(p.address);
      if (!pn || pn !== tn) return false;
      // 주소가 있는 경우엔 주소까지 맞추고, 주소가 없으면 이름만으로도 허용
      return ta ? pa === ta : true;
    });
  }

  // ✅ 2) 못 찾으면 focusParam/id로 찾기
  if (idx < 0) {
    const f = focusParam ? String(focusParam) : target ? getCafeKey(target) : null;
    if (f) {
      idx = list.findIndex((p) => {
        if (!p) return false;
        return (
          String(p.cafe_id ?? "") === f ||
          String(p.id ?? "") === f ||
          getCafeKey(p) === f
        );
      });
    }
  }

  // ✅ 찾았으면: 그 카페로 강제 포커싱 + 팝업
  if (idx >= 0) {
    setFocusedIndex(idx);
    openPopup(list[idx]);
    setFitBoundsOnResults(false);
    return;
  }

  // ✅ 3) 그래도 못 찾으면: target을 results에 추가하고(순서 유지: 맨 뒤에 붙임) 다음 effect에서 다시 잡음
  if (target) {
    pendingFocusRef.current = {
      key: getCafeKey(target),
      name: target.name,
      address: target.address,
    };

    setSearchResults((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const exists = arr.some((p) => {
        if (!p) return false;
        const sameName = normStr(p.name) === normStr(target.name);
        const sameAddr = target.address ? normStr(p.address) === normStr(target.address) : true;
        return sameName && sameAddr;
      });
      return exists ? arr : [...arr, target];
    });

    openPopup(target); // 일단 팝업은 target으로 열어둠
    setFitBoundsOnResults(false);
  }
}, [location.key]); // ✅ "지도 버튼으로 돌아올 때" location.key가 바뀌면서 1회 실행

// ✅ target을 results에 추가한 경우, results가 실제로 갱신된 뒤에 "정확한 idx"를 다시 잡아 포커싱
useEffect(() => {
  const p = pendingFocusRef.current;
  if (!p) return;
  if (!Array.isArray(searchResults) || searchResults.length === 0) return;

  const idx = searchResults.findIndex((c) => {
    if (!c) return false;

    // 1) key 우선
    if (p.key && getCafeKey(c) === String(p.key)) return true;

    // 2) 이름+주소
    const sameName = normStr(c.name) === normStr(p.name);
    const sameAddr = p.address ? normStr(c.address) === normStr(p.address) : true;
    return sameName && sameAddr;
  });

  if (idx >= 0) {
    setFocusedIndex(idx);
    openPopup(searchResults[idx]);
    pendingFocusRef.current = null;
  }
}, [searchResults]);


  useEffect(() => {
    return () => {
      // ✅ 상세페이지로 이동한 경우(플래그가 있으면) 유지
      const keep = sessionStorage.getItem(KEEP_KEY) === "1";
         if (keep) {
      // ✅ 상세페이지로 이동하는 순간, 최신 검색결과/상태를 한번 더 강제 저장
      try {
        const s = latestRef.current || {};
        const payload = {
          isSidebarOpen: s.isSidebarOpen,
          hasSearched: s.hasSearched,
          topQuery: s.topQuery,
          focusedIndex: s.focusedIndex,
          searchResults: (s.searchResults || []).map(compactCafe),
          sidebarPrefs: s.sidebarPrefs ?? null,
        };
        sessionStorage.setItem(STORE_KEY, JSON.stringify(payload));
      } catch (e) {}

      sessionStorage.removeItem(KEEP_KEY); // 1회성 플래그 제거
      return;
    }

      // ✅ 그 외(메인으로 이동 등) -> 지도페이지 초기화
      sessionStorage.removeItem(STORE_KEY);
      sessionStorage.removeItem(VIEW_KEY);
    };
  }, []);



  // ✅ 지도 뷰 저장 콜백
  const handleViewChange = (view) => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {}
  };

  const handleSearch = async (prefs) => {
    try {
      setSidebarPrefs(prefs || null);
      const res = await fetch(filterUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs || {}),
      });

      if (!res.ok) throw new Error("서버 오류: " + res.status);

      const data = await res.json();
      setSearchResults(data.results || []);
      setFocusedIndex(null);
      setHasSearched(true);

      // ✅ 새 검색이면 bounds로 한 번 맞춤
      setFitBoundsOnResults(true);

      closePopup();
    } catch (err) {
      console.error(err);
      alert("카페 검색 중 오류가 발생했습니다: " + err.message);
    }
  };

const handleTopSearch = async () => {
  const q = (topQuery || "").trim();
  if (!q) return;

  // ✅ "지역(구 포함) + 나머지 키워드"를 분리
  let keyword = q;
  const regionTokensFound = [];

  for (const token of REGION_TOKENS) {
    if (keyword.includes(token)) {
      regionTokensFound.push(token);
      keyword = keyword.replaceAll(token, " ");
    }
  }

  keyword = keyword.replace(/\s+/g, " ").trim();

  // ✅ 남은 키워드 중 가장 "긴 토큰"을 메뉴/가게명 키워드로 사용
  let menuKeyword = "";
  if (keyword) {
    const tokens = keyword.split(/\s+/).filter(Boolean);
    menuKeyword = tokens.sort((a, b) => b.length - a.length)[0] || keyword;
  }

  const prefs = {
    region: expandRegionTokens(regionTokensFound),
    atmosphere: [],
    purpose: [],
    taste: [],
    required: [],
    menu: menuKeyword ? [menuKeyword] : [],
  };

  await handleSearch(prefs);
};

  const selectedId =
    popupPlace?.id ??
    popupPlace?.cafe_id ??
    popupPlace?.cafeId ??
    popupPlace?.cafeID ??
    popupPlace?.name ??
    null;

  return (
    <div className="app-container">
      <Header />

      <div className="main-content-area">
        <Sidebar
          isOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
          onSearch={handleSearch}
          initialPrefs={sidebarPrefs}
          onReset={() => {
            setSearchResults([]);
            setFocusedIndex(null);
            setHasSearched(false);
            closePopup();
           setSidebarPrefs(null);
            sessionStorage.removeItem(STORE_KEY);
            sessionStorage.removeItem(VIEW_KEY);
          }}
        />

        <div className="map-and-results-wrap">
          {!isSidebarOpen && (
            <button className="sidebar-open-btn" onClick={toggleSidebar} type="button">
              🔍 필터 열기
            </button>
          )}

          <div className="map-search-bar">
            <div className="map-search-input-wrap">
              <input
                type="text"
                className="map-search-input"
                placeholder="카페 이름 또는 지역을 입력해 보세요 (예: 나주 카페하루)"
                value={topQuery}
                onChange={(e) => setTopQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTopSearch();
                }}
              />
            </div>

            <button
              type="button"
              className="map-search-action-btn"
              onClick={handleTopSearch}
              disabled={!topQuery.trim()}
              title={!topQuery.trim() ? "검색어를 입력해 주세요" : "검색"}
            >
              <div className="text">검색</div>
            </button>
          </div>

          <div className="map-split-layout">
            <div className="map-area" style={{ position: "relative" }}>
              <KakaoMap
                results={searchResults}
                focusedIndex={focusedIndex}
                setFocusedIndex={setFocusedIndex}
                onSelectPlace={(place) => openPopup(place)}
                initialView={initialView}
                onViewChange={handleViewChange}
                fitBoundsOnResults={fitBoundsOnResults}
                onFitBoundsDone={() => setFitBoundsOnResults(false)}
                relayoutKey={popupOpen}
                selectedId={selectedId}
              />

              <PlacePopup open={popupOpen} place={popupPlace} onClose={closePopup} />
            </div>

            {hasSearched && (
              <div className="results-panel">
                <div className="results-panel-header">
                  <div className="title">검색 결과</div>
                  <div className="sub">
                    {searchResults.length
                      ? `총 ${searchResults.length}개 · 지도표시 ${visibleCount}개`
                      : "검색 결과가 없어요"}
                  </div>
                </div>

                {searchResults.length === 0 ? (
                  <div className="results-empty">조건을 조금 바꿔서 다시 검색해 보세요 🙂</div>
                ) : (
                  <div className="results-list">
                    {searchResults.map((cafe, idx) => {
                      const isActive = focusedIndex === idx;
                      const hasCoord = !!(cafe?.x && cafe?.y);
                      const thumbUrl = getThumbUrl(cafe);

                      return (
                        <button
                          key={cafe?.id || `${cafe?.name}-${idx}`}
                          type="button"
                          className={`result-card1 ${isActive ? "active" : ""}`}
                          onClick={() => {
                            if (hasCoord) setFocusedIndex(idx);
                            else setFocusedIndex(null);
                            openPopup(cafe);
                          }}
                          title="클릭하면 상세가 뜹니다"
                        >
                          <div className="result-card-row">
                            <div className="result-thumb" aria-hidden="true">
                              {thumbUrl ? (
                                <img className="result-thumb-img" src={thumbUrl} alt="" loading="lazy" />
                              ) : (
                                <div className="result-thumb-ph">No Image</div>
                              )}
                            </div>

                            <div className="result-card-body">
                              <div className="result-card-top">
                                <div className="name">
                                  {cafe?.name || "이름 없음"}
                                  {cafe?.score ? (
                                    <span className="score">{Number(cafe.score).toFixed(1)}</span>
                                  ) : null}
                                </div>
                                <div className="region">{cafe?.region || ""}</div>
                              </div>

                              <div className="address">{cafe?.address || ""}</div>

                              {getTagLine(cafe) ? <div className="tags">{getTagLine(cafe)}</div> : null}

                              {/* ✅ 지도 링크 제거하고 주차 정보만 */}
                              <div className="result-card-bottom">
                                <div className="parking">
                                  {cafe?.parking ? `주차: ${cafe.parking}` : "주차: 정보 없음"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
