// Map.jsx (최종 완성 코드)

import { useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import KakaoMap from '../components/KakaoMap';


function Map() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(null);

  // 사이드바 토글 함수: true <-> false 전환
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  // 검색 API 호출 함수 (로직 유지)
  const handleSearch = async (filters) => {
    try {
      const res = await fetch("/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters)
      });

      if (!res.ok) throw new Error("서버 오류: " + res.status);
      
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
      alert("카페 검색 중 오류가 발생했습니다: " + err.message);
    }
  };

  return (
    <div className="app-container">
      <Header />
      
      <div className="main-content-area">
        
        {/* 사이드바 (필터) */}
        <Sidebar 
          isOpen={isSidebarOpen} 
          toggleSidebar={toggleSidebar} 
          onSearch={handleSearch} 
          onReset={() => setSearchResults([])} 
        />

        <div className="map-and-results-wrap">
          
          {/* [추가] 사이드바가 닫혀 있을 때만 (isSidebarOpen: false) 열기 버튼을 보여줍니다. */}
          {!isSidebarOpen && (
            <button className="sidebar-open-btn" onClick={toggleSidebar}>
              🔍 필터 열기
            </button>
          )}

          {/* 지도 상단 검색바 */}
          <div className="map-search-bar">
            <div className="map-search-input-wrap">
              <input 
                type="text" 
                className="map-search-input" 
                placeholder="카페 이름 또는 지역을 입력해 보세요" 
              />
            </div>
            <div className="map-search-action-btn">
              <div className="text">검색</div>
            </div>
          </div>

          <KakaoMap 
            results={searchResults} 
            focusedIndex={focusedIndex}
            setFocusedIndex={setFocusedIndex}
          />
          
        </div>
      </div>
    </div>
  );
}

export default Map;