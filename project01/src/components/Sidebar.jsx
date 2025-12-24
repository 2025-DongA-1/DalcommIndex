// src/components/Sidebar.jsx (카테고리 확장 + 맛(taste) 추가 버전)
import React, { useEffect, useMemo, useState } from "react";

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

const Sidebar = ({ isOpen, toggleSidebar, onSearch, onReset, initialPrefs }) => {
  // ✅ 카테고리(칩) 확장 + "맛" 그룹 추가
  const filters = useMemo(
    () => ({
      지역: ["광주", "나주", "담양", "화순"],

      분위기: [
        "넓음",
        "아늑",
        "감성",
        "모던",
        "조용",
        "키즈/가족친화",
        "테라스",
        "한옥/전통",
      ],

      맛: [
        "상큼",
        "달콤",
        "담백",
        "고소",
        "단짠/짭짤",
        "쌉싸름/다크",
        "진함",
        "촉촉/쫀득",
      ],

      "방문 목적": [
        "데이트",
        "가족",
        "친구",
        "단체/대관",
        "혼카페/작업",
        "반려동물/애견동반",
      ],

      메뉴: [
        "아메리카노",
        "라떼",
        "에이드",
        "카페라떼",
        "밀크티",
        "에스프레소",
        "딸기라떼",
        "콜드브루",
        "초코",
        "케이크",
        "바닐라",
        "아이스크림",
        "말차",
        "쿠키",
        "빙수",
        "브런치",
      ],


      "필수 조건": [
        "주차 가능",
        "반려동물"
      ],
    }),
    []
  );

  const [selected, setSelected] = useState(() => ({
    지역: new Set(),
    분위기: new Set(),
    맛: new Set(),
    메뉴: new Set(),
    "방문 목적": new Set(),
    "필수 조건": new Set(),
  }));

  const [isGwangjuOpen, setIsGwangjuOpen] = useState(false);

  useEffect(() => {
    if (!initialPrefs) return;

    // ✅ region은 alias로 넘어올 수 있으니 canonical(광주 전체/광주 동구/나주...)로 되돌림
    const regionArr = Array.isArray(initialPrefs.region) ? initialPrefs.region : [];
    const regionSet = new Set();

    // 1) aliases로 canonical 찾기
    for (const [canonical, aliases] of Object.entries(REGION_ALIASES)) {
      if (regionArr.some((r) => aliases.includes(r) || r === canonical)) {
        regionSet.add(canonical);
      }
    }

    // 2) 혹시 expand 이전의 값이 그대로 들어와도 대비
    regionArr.forEach((r) => {
      if (r === "광주" || r === "광주광역시" || r === "gwangju") regionSet.add("광주 전체");
    });

    const arr = (v) => (Array.isArray(v) ? v : []);
    const mergeUnique = (...vals) => Array.from(new Set(vals.flatMap(arr)));

    setSelected({
      지역: regionSet,
      분위기: new Set(mergeUnique(initialPrefs.atmosphere, initialPrefs.atmosphere_tags)),
      맛: new Set(mergeUnique(initialPrefs.taste, initialPrefs.taste_tags)),
      메뉴: new Set(mergeUnique(initialPrefs.menu, initialPrefs.menu_tags)),
      "방문 목적": new Set(mergeUnique(initialPrefs.purpose, initialPrefs.companion_tags)),
      "필수 조건": new Set(arr(initialPrefs.required)),
    });

    // ✅ 광주 관련 선택이 있으면 하위 구역 펼쳐놓기(선택)
    const hasGwangju = Array.from(regionSet).some(
      (v) => v === "광주 전체" || String(v).startsWith("광주 ")
    );
    if (hasGwangju) setIsGwangjuOpen(true);
  }, [initialPrefs]);

  const toggleOption = (group, option) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[group] || []);
      if (set.has(option)) set.delete(option);
      else set.add(option);
      next[group] = set;
      return next;
    });
  };

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

  const resetAll = () => {
    setSelected({
      지역: new Set(),
      분위기: new Set(),
      맛: new Set(),
      메뉴: new Set(),
      "방문 목적": new Set(),
      "필수 조건": new Set(),
    });
    onReset?.();
  };

  const buildPrefs = () => {
    // ✅ 지역은 alias 확장해서 서버/데이터 매칭용으로 전송
    const regionLabels = Array.from(selected["지역"] || []);
    const regionExpanded = [];
    for (const label of regionLabels) {
      const aliases = REGION_ALIASES[label] || [label];
      for (const v of aliases) {
        if (!regionExpanded.includes(v)) regionExpanded.push(v);
      }
    }

    const atmosphere = Array.from(selected["분위기"] || []);
    const taste = Array.from(selected["맛"] || []);
    const menu = Array.from(selected["메뉴"] || []);
    const purpose = Array.from(selected["방문 목적"] || []);
    const required = Array.from(selected["필수 조건"] || []);

    return {
      // 기존 키(호환)
      region: regionExpanded,
      atmosphere,
      taste,
      menu,
      purpose,
      required,

      // ✅ CSV 컬럼명 기반 키도 함께 제공(필터링 구현 방식에 따라 사용)
      atmosphere_tags: atmosphere,
      taste_tags: taste,
      menu_tags: menu,
      companion_tags: purpose,
    };
  };

  const hasSelection =
    (selected["지역"]?.size || 0) +
      (selected["분위기"]?.size || 0) +
      (selected["맛"]?.size || 0) +
      (selected["메뉴"]?.size || 0) +
      (selected["방문 목적"]?.size || 0) +
      (selected["필수 조건"]?.size || 0) >
    0;

  const activeChips = useMemo(() => {
    const chips = [];
    for (const [group, set] of Object.entries(selected)) {
      for (const v of set) chips.push({ group, value: v });
    }
    return chips;
  }, [selected]);

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
        <div className="sidebar-scroll-area">
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
      </div>
    </aside>
  );
};

export default Sidebar;
