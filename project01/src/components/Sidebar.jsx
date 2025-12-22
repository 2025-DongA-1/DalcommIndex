// src/components/Sidebar.jsx (검색버튼 가림 현상 해결 버전)
import React, { useMemo, useState } from "react";

// ✅ 지역 값(표시용) -> 서버/데이터 매칭용(여러 표기)으로 확장
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

// ✅ "광주" 버튼을 눌렀을 때만 노출되는 "구" 옵션(표시는 '광주' 없이)
const GWANGJU_SUB_OPTIONS = [
  { label: "전체", value: "광주 전체" },
  { label: "동구", value: "광주 동구" },
  { label: "남구", value: "광주 남구" },
  { label: "북구", value: "광주 북구" },
  { label: "서구", value: "광주 서구" },
  { label: "광산구", value: "광주 광산구" },
];

const Sidebar = ({ isOpen, toggleSidebar, onSearch, onReset }) => {
  const filters = useMemo(
    () => ({
      지역: ["광주", "나주", "담양", "화순"],
      분위기: ["감성", "조용한", "사진 / 뷰맛집", "아늑한"],
      메뉴: ["커피", "디저트", "빵", "브런치"],
      "방문 목적": ["데이트", "공부 / 작업", "카페 투어", "가족 / 아이"],
      "필수 조건": ["주차 가능", "노키즈", "반려동물"],
    }),
    []
  );

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
    onReset?.();
  };

  const buildPrefs = () => {
    const prefs = {
      region: [],
      atmosphere: Array.from(selected["분위기"] || []),
      menu: Array.from(selected["메뉴"] || []),
      purpose: Array.from(selected["방문 목적"] || []),
      taste: [],
      required: [],
    };

    const regionLabels = Array.from(selected["지역"] || []);
    const regionExpanded = [];
    for (const label of regionLabels) {
      const aliases = REGION_ALIASES[label] || [label];
      for (const v of aliases) {
        if (!regionExpanded.includes(v)) regionExpanded.push(v);
      }
    }
    prefs.region = regionExpanded;

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

  const [isGwangjuOpen, setIsGwangjuOpen] = useState(false);

  const toggleRegionOption = (canonical) => {
    setSelected((prev) => {
      const next = { ...prev };
      const copy = new Set(next["지역"] || []);

      const isAll = canonical === "광주 전체";
      const isDistrict = canonical.startsWith("광주 ") && !isAll;

      if (copy.has(canonical)) {
        copy.delete(canonical);
      } else {
        if (isAll) {
          for (const v of Array.from(copy)) {
            if (v.startsWith("광주 ") && v !== "광주 전체") copy.delete(v);
          }
        }
        if (isDistrict) {
          copy.delete("광주 전체");
        }
        copy.add(canonical);
      }

      next["지역"] = copy;
      return next;
    });
  };

  const displayChipValue = (group, value) => {
    if (group === "지역") {
      if (value === "광주 전체") return "광주(전체)";
      if (value.startsWith("광주 ")) return value.replace("광주 ", "");
    }
    return value;
  };

  const renderStandardChips = (group, options) => (
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

  const renderRegionChips = (options) => {
    const otherRegions = options.filter((o) => o !== "광주");

    return (
      <div className="filter-options-container region-group">
        <button
          type="button"
          className={`filter-chip-wrap region-toggle ${isGwangjuOpen ? "is-open" : ""}`}
          onClick={() => setIsGwangjuOpen((p) => !p)}
          aria-expanded={isGwangjuOpen}
        >
          <div className="filter-chip-inner">
            <div className="filter-chip-text">
              <span>광주</span>
              <span className={`region-caret ${isGwangjuOpen ? "open" : ""}`}>▾</span>
            </div>
          </div>
        </button>

        {otherRegions.map((option) => {
          const isSelected = selected["지역"]?.has(option);
          return (
            <button
              key={`지역-${option}`}
              type="button"
              className={`filter-chip-wrap ${isSelected ? "is-selected" : ""}`}
              onClick={() => toggleOption("지역", option)}
              aria-pressed={isSelected}
            >
              <div className="filter-chip-inner">
                <div className="filter-chip-text">{option}</div>
              </div>
            </button>
          );
        })}

        {isGwangjuOpen && (
          <div className="region-sub-options" role="group" aria-label="광주 구 선택">
            {GWANGJU_SUB_OPTIONS.map(({ label, value }) => {
              const isSelected = selected["지역"]?.has(value);
              return (
                <button
                  key={`지역-${value}`}
                  type="button"
                  className={`filter-chip-wrap region-sub-chip ${isSelected ? "is-selected" : ""}`}
                  onClick={() => toggleRegionOption(value)}
                  aria-pressed={isSelected}
                >
                  <div className="filter-chip-inner">
                    <div className="filter-chip-text">{label}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderChips = (group, options) =>
    group === "지역" ? renderRegionChips(options) : renderStandardChips(group, options);

  return (
    <aside className="sidebar" style={{ display: isOpen ? "block" : "none" }}>
      {/* ✅ 레이아웃 안정화: 콘텐츠 스크롤 + 하단 고정 영역 분리 */}
      <div className="sidebar-layout">
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
                    onClick={() => {
                      if (
                        chip.group === "지역" &&
                        (chip.value === "광주 전체" || chip.value.startsWith("광주 "))
                      ) {
                        return toggleRegionOption(chip.value);
                      }
                      return toggleOption(chip.group, chip.value);
                    }}
                    title="클릭하면 해제됩니다"
                  >
                    <span className="chip-group">{chip.group}</span>
                    <span className="chip-value">{displayChipValue(chip.group, chip.value)}</span>
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

        {/* ✅ 4. 하단 검색 버튼: sticky footer + z-index 로 절대 가려지지 않게 */}
        <div className="sidebar-footer">
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
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
