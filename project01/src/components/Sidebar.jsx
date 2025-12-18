// src/components/Sidebar.jsx (프로젝트 적용 버전)

import React, { useMemo, useState } from "react";

/**
 * Sidebar 필터 -> 백엔드 recommendCafes(prefs, ...)에 맞는 prefs를 만들어 전달합니다.
 * prefs 형태:
 * {
 *   region: string[],
 *   atmosphere: string[],
 *   purpose: string[],
 *   menu: string[],
 *   taste: string[],
 *   required: string[]
 * }
 */

const Sidebar = ({ isOpen, toggleSidebar, onSearch, onReset }) => {
  // ✅ 필터 데이터(현재는 고정). 추후 DB/서버에서 내려받아도 구조만 유지하면 됩니다.
  const filters = useMemo(
    () => ({
      지역: ["광주", "나주", "담양", "화순", "장성"],
      분위기: ["감성", "조용한", "사진 / 뷰맛집", "아늑한"],
      메뉴: ["커피", "디저트", "빵", "브런치"],
      "방문 목적": ["데이트", "공부 / 작업", "카페 투어", "가족 / 아이"],
      "필수 조건": ["주차 가능", "노키즈", "반려동물"],
    }),
    []
  );

  // ✅ 선택 상태(그룹별 Set)
  const [selected, setSelected] = useState(() => ({
    지역: new Set(),
    분위기: new Set(),
    메뉴: new Set(),
    "방문 목적": new Set(),
    "필수 조건": new Set(),
  }));

  const toggleOption = (group, option) => {
    setSelected((prev) => {
      const next = { ...prev };
      const copy = new Set(next[group] || []);
      if (copy.has(option)) copy.delete(option);
      else copy.add(option);
      next[group] = copy;
      return next;
    });
  };

  const resetAll = () => {
    setSelected({
      지역: new Set(),
      분위기: new Set(),
      메뉴: new Set(),
      "방문 목적": new Set(),
      "필수 조건": new Set(),
    });
    onReset?.(); // Map.jsx에서 setSearchResults([]) 실행
  };

  const buildPrefs = () => {
    const prefs = {
      region: Array.from(selected["지역"] || []),
      atmosphere: Array.from(selected["분위기"] || []),
      menu: Array.from(selected["메뉴"] || []),
      purpose: Array.from(selected["방문 목적"] || []),
      taste: [],
      required: [],
    };
    prefs.required = Array.from(selected["필수 조건"] || []);
    return prefs;
  };

  const hasSelection =
    (selected["지역"]?.size || 0) +
      (selected["분위기"]?.size || 0) +
      (selected["메뉴"]?.size || 0) +
      (selected["방문 목적"]?.size || 0) >
    0;

  const activeChips = useMemo(() => {
    const chips = [];
    for (const [group, set] of Object.entries(selected)) {
      for (const v of set) chips.push({ group, value: v });
    }
    return chips;
  }, [selected]);

  const renderChips = (group, options) => (
    <div className="filter-options-container">
      {options.map((option) => {
        const isSelected = selected[group]?.has(option);
        return (
          <button
            key={`${group}-${option}`}
            type="button"
            className={`filter-chip-wrap ${isSelected ? "is-selected" : ""}`}
            onClick={() => toggleOption(group, option)}
            aria-pressed={isSelected}
          >
            <div className="filter-chip-inner">
              <div className="filter-chip-text">{option}</div>
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <aside className="sidebar" style={{ display: isOpen ? "block" : "none" }}>
      <div className="sidebar-content-wrap">
        {/* 1. 필터 헤더 */}
        <div className="sidebar-header">
          <div className="filter-title-group">
            <div className="icon">🧁</div>
            <div className="text">필터</div>
          </div>

          <div className="filter-actions-group">
            <button type="button" className="filter-reset-btn" onClick={resetAll}>
              초기화
            </button>
            <button type="button" className="close-filter-btn" onClick={toggleSidebar}>
              ✕ 닫기
            </button>
          </div>
        </div>

        {/* 2. 선택된 필터 영역 */}
        <div className="active-filters-area">
          {!hasSelection ? (
            <div className="no-filter-message">선택된 필터가 없습니다</div>
          ) : (
            <div className="active-filters-chips">
              {activeChips.map((chip) => (
                <button
                  key={`${chip.group}-${chip.value}`}
                  type="button"
                  className="active-filter-chip"
                  onClick={() => toggleOption(chip.group, chip.value)}
                  title="클릭하면 해제됩니다"
                >
                  <span className="chip-group">{chip.group}</span>
                  <span className="chip-value">{chip.value}</span>
                  <span className="chip-x">✕</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. 필터 그룹 목록 */}
        {Object.entries(filters).map(([title, options]) => (
          <div key={title} className="filter-group">
            <div className="filter-group-title">
              <div className="text">{title}</div>
            </div>
            {renderChips(title, options)}
          </div>
        ))}
      </div>

      {/* 4. 하단 검색 버튼 */}
      <button
        type="button"
        className="sidebar-search-btn"
        onClick={() => onSearch?.(buildPrefs())}
        disabled={!hasSelection}
        title={!hasSelection ? "필터를 하나 이상 선택해 주세요" : "선택한 필터로 검색"}
      >
        <span className="icon">🔍</span>
        <span className="text">검색</span>
      </button>
    </aside>
  );
};

export default Sidebar;
