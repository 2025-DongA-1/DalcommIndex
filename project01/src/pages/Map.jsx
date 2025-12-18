// Map.jsx
import { useMemo, useState } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import KakaoMap from "../components/KakaoMap";
import PlacePopup from "../components/PlacePopup";

function Map() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(null);

  // 검색 실행 여부 (검색 전엔 결과 패널 숨김)
  const [hasSearched, setHasSearched] = useState(false);

  // 상단 검색바 입력값
  const [topQuery, setTopQuery] = useState("");

  // ✅ 상세 모달 (좌표 pos 제거)
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupPlace, setPopupPlace] = useState(null);

  // 백엔드 주소
  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const filterUrl = API_BASE ? `${API_BASE}/filter` : "/filter";

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  const openPopup = (place) => {
    setPopupPlace(place || null);
    setPopupOpen(true);
  };

  const closePopup = () => {
    setPopupOpen(false);
    setPopupPlace(null);
  };

  // 카드에 보여줄 간단 태그 문자열
  const getTagLine = (cafe) => {
    const atmos = cafe?.atmosphere || cafe?.atmosphere_norm || "";
    const purpose = cafe?.purpose || cafe?.purpose_norm || "";
    const taste = cafe?.taste || cafe?.taste_norm || "";
    return [atmos, purpose, taste]
      .filter(Boolean)
      .join(" | ")
      .replace(/\s*\|\s*/g, " · ")
      .trim();
  };

  const visibleCount = useMemo(() => {
    // 좌표 있는 것만 카운트(지도 마커 표시용)
    return searchResults.filter((c) => c && c.x && c.y).length;
  }, [searchResults]);

  // 공통 검색 호출
  const handleSearch = async (prefs) => {
    try {
      const res = await fetch(filterUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs || {}),
      });

      if (!res.ok) throw new Error("서버 오류: " + res.status);

      const data = await res.json();
      setSearchResults(data.results || []);
      setFocusedIndex(null);

      // 검색 실행 완료 표시
      setHasSearched(true);

      // 검색 새로 하면 떠있는 상세는 닫기(원하시면 제거 가능)
      closePopup();
    } catch (err) {
      console.error(err);
      alert("카페 검색 중 오류가 발생했습니다: " + err.message);
    }
  };

  // 상단 검색바: 지역/키워드 단순 분해
  const handleTopSearch = async () => {
    const q = (topQuery || "").trim();
    if (!q) return;

    const regionWords = ["광주광역시", "광주", "나주", "담양", "장성", "화순"];
    const regions = regionWords.filter((r) => q.includes(r));

    let keyword = q;
    regions.forEach((r) => {
      keyword = keyword.replaceAll(r, " ");
    });
    keyword = keyword.replace(/\s+/g, " ").trim();

    // 대표 키워드 1개만 사용
    let menuKeyword = "";
    if (keyword) {
      const tokens = keyword.split(/\s+/).filter(Boolean);
      menuKeyword = tokens.sort((a, b) => b.length - a.length)[0] || keyword;
    }

    const prefs = {
      region: regions.length ? regions : [],
      atmosphere: [],
      purpose: [],
      taste: [],
      required: [],
      menu: menuKeyword ? [menuKeyword] : [],
    };

    await handleSearch(prefs);
  };

  return (
    <div className="app-container">
      <Header />

      <div className="main-content-area">
        <Sidebar
          isOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
          onSearch={handleSearch}
          onReset={() => {
            setSearchResults([]);
            setFocusedIndex(null);
            setHasSearched(false);
            closePopup();
          }}
        />

        <div className="map-and-results-wrap">
          {!isSidebarOpen && (
            <button className="sidebar-open-btn" onClick={toggleSidebar} type="button">
              🔍 필터 열기
            </button>
          )}

          {/* 상단 검색바 */}
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

          {/* 지도 + 결과 패널 */}
          <div className="map-split-layout">
            <div className="map-area" style={{ position: "relative" }}>
              <KakaoMap
                results={searchResults}
                focusedIndex={focusedIndex}
                setFocusedIndex={setFocusedIndex}
              />

              {/* ✅ 상세는 “가운데 모달” */}
              <PlacePopup open={popupOpen} place={popupPlace} onClose={closePopup} />
            </div>

            {/* 검색 전엔 렌더링 안 함 */}
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

                      return (
                        <button
                          key={cafe?.id || `${cafe?.name}-${idx}`}
                          type="button"
                          className={`result-card ${isActive ? "active" : ""}`}
                          onClick={() => {
                            // 좌표가 있으면 지도 포커스 이동(마커 중심 이동)
                            if (hasCoord) setFocusedIndex(idx);
                            else setFocusedIndex(null);

                            // ✅ 상세는 항상 모달로 띄움(좌표 없어도 OK)
                            openPopup(cafe);
                          }}
                          title="클릭하면 상세가 뜹니다"
                        >
                          <div className="result-card-top">
                            <div className="name">
                              {cafe?.name || "이름 없음"}
                              {cafe?.score ? (
                                <span className="score"> {Number(cafe.score).toFixed(1)}</span>
                              ) : null}
                            </div>
                            <div className="region">{cafe?.region || ""}</div>
                          </div>

                          <div className="address">{cafe?.address || ""}</div>

                          {getTagLine(cafe) ? <div className="tags">{getTagLine(cafe)}</div> : null}

                          <div className="result-card-bottom">
                            <div className="parking">
                              {cafe?.parking ? `주차: ${cafe.parking}` : "주차: 정보 없음"}
                            </div>

                            {cafe?.url ? (
                              <a
                                className="link"
                                href={cafe.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="카카오맵 링크 열기"
                              >
                                지도 링크
                              </a>
                            ) : (
                              <span className="link disabled">링크 없음</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 지도 + 결과 패널 끝 */}
        </div>
      </div>
    </div>
  );
}

export default Map;
