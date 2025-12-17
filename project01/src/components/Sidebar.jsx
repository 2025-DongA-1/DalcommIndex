// src/components/Sidebar.jsx (최종 완성 코드)

import React from 'react';

const Sidebar = ({ isOpen, toggleSidebar, onSearch, onReset }) => {
  
  // 임시 필터 데이터
  const filters = {
    '지역': ['광주', '나주', '담양', '화순', '장성'],
    '분위기': ['감성', '조용한', '사진 / 뷰맛집', '아늑한'],
    '메뉴': ['커피', '디저트', '빵', '브런치'],
    '방문 목적': ['데이트', '공부 / 작업', '카페 투어', '가족 / 아이'],
  };

  const renderChips = (options) => (
    <div className="filter-options-container">
      {options.map((option) => (
        <div key={option} className="filter-chip-wrap">
          <div className="filter-chip-inner">
            <div className="filter-chip-text">{option}</div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    // isOpen 값으로 사이드바를 숨기거나 보여줍니다.
    <aside className="sidebar" style={{ display: isOpen ? 'block' : 'none' }}>
      
      <div className="sidebar-content-wrap"> 
        {/* 1. 필터 헤더 */}
        <div className="sidebar-header">
          <div className="filter-title-group">
            <div className="icon">🧁</div>
            <div className="text">필터</div>
          </div>
          
          <div className="filter-actions-group">
             <div className="filter-reset-btn" onClick={onReset}>초기화</div>
             {/* 닫기 버튼 */}
             <button className="close-filter-btn" onClick={toggleSidebar}>
                ✕ 닫기
             </button>
          </div>
        </div>

        {/* 2. 선택된 필터 영역 */}
        <div className="active-filters-area">
          <div className="no-filter-message">선택된 필터가 없습니다</div>
        </div>

        {/* 3. 필터 그룹 목록 */}
        {Object.entries(filters).map(([title, options]) => (
          <div key={title} className="filter-group">
            <div className="filter-group-title"><div className="text">{title}</div></div>
            {renderChips(options)}
          </div>
        ))}
      </div>
      
      {/* 4. 하단 검색 버튼 */}
      <div className="sidebar-search-btn" onClick={() => onSearch({})}>
        <span className="icon">🔍</span>
        <span className="text">검색</span>
      </div>
    </aside>
  );
};

export default Sidebar;