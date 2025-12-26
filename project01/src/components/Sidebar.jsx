// src/components/Sidebar.jsx
import React, { useEffect, useMemo, useState } from "react";

// ✅ 지역 값(표시용) -> 서버/데이터 매칭용(여러 표기)으로 확장 (기존 유지)
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

/**
 * ✅ UI(노출) -> Source Tags 매핑
 * - purpose / must / theme / mood / dessert 로 서버에 보내기
 * - 동시에 기존 호환 키(atmosphere/menu/purpose/required 등)도 같이 채워서 전송
 */
const UI_TO_SOURCE = {
  // 방문 목적
  "👶 아이와 함께": { purpose: ["가족/키즈"], must: ["키즈/유모차"] },
  "🐶 반려동물 동반": { purpose: ["반려견동반"], must: ["반려견동반"] },
  "❤️ 데이트": { purpose: ["데이트"] },
  "👥 단체 모임": { purpose: ["모임/단체"], must: ["예약/단체"] },
  "💻 카공/작업": { purpose: ["공부/작업"], must: ["콘센트/와이파이"] },

  // 테마/분위기
  "🏞️ 뷰 맛집": { theme: ["뷰맛집", "테라스/야외", "루프탑", "정원/가든"] },
  "🏯 한옥/감성": { theme: ["한옥/전통", "빈티지/레트로"] },
  "📸 포토존": { theme: ["포토존/인스타"] },
  "🏢 대형 카페": { theme: ["대형카페"], mood: ["쾌적함"] },
  "🌿 조용/힐링": { mood: ["조용함", "힐링", "아늑함"] },

  // 디저트
  "🥐 베이커리/브런치": { dessert: ["베이커리/빵", "브런치/샌드위치"] },
  "🍰 케이크/디저트": {
    dessert: ["케이크", "쿠키/구움과자", "마카롱", "초콜릿/디저트특화", "크레페/와플"],
  },
  "🍧 빙수/아이스크림": { dessert: ["빙수", "아이스크림/젤라또"] },

  // 필수 조건
  "🚗 주차 가능": { must: ["주차가능"], purpose: ["드라이브/산책"] },
};

// ✅ 지역 이모티콘(표시용) - “값(매핑)”은 그대로, “표시”만 이모지 추가
const REGION_EMOJI_MAP = {
  // 광주/구
  "광주 전체": "🌆",
  "광주 동구": "🏛️", // 문화/전통 느낌
  "광주 남구": "🌿", // 주거/힐링 느낌
  "광주 북구": "🎓", // 대학가 느낌
  "광주 서구": "🛍️", // 상권 느낌
  "광주 광산구": "✈️", // 공항/산업 느낌

  // 타 지역
  나주: "🍐",
  담양: "🎋",
  화순: "⛰️",
};

const getRegionEmoji = (canonicalLabel) => REGION_EMOJI_MAP[canonicalLabel] || "📍";

const Sidebar = ({ isOpen, toggleSidebar, onSearch, onReset, initialPrefs }) => {
  // ✅ 요청하신 카테고리 구성
  const filters = useMemo(
    () => ({
      지역: ["광주", "나주", "담양", "화순"],

      "방문 목적": [
        "👶 아이와 함께",
        "🐶 반려동물 동반",
        "❤️ 데이트",
        "👥 단체 모임",
        "💻 카공/작업",
      ],

      "테마/분위기": ["🏞️ 뷰 맛집", "🏯 한옥/감성", "📸 포토존", "🏢 대형 카페", "🌿 조용/힐링"],

      디저트: ["🥐 베이커리/브런치", "🍰 케이크/디저트", "🍧 빙수/아이스크림"],

      "필수 조건": ["🚗 주차 가능"],
    }),
    []
  );

  const [selected, setSelected] = useState(() => ({
    지역: new Set(),
    "방문 목적": new Set(),
    "테마/분위기": new Set(),
    디저트: new Set(),
    "필수 조건": new Set(),
  }));

  const [isGwangjuOpen, setIsGwangjuOpen] = useState(false);

  // ---------- helpers ----------
  const arr = (v) => (Array.isArray(v) ? v : []);
  const norm = (s) => String(s ?? "").replace(/\s+/g, "").trim();

  const mergeUnique = (...vals) => Array.from(new Set(vals.flatMap(arr)));

  const includesAny = (haystackArr, needlesArr) => {
    const hs = new Set((haystackArr || []).map(norm));
    return (needlesArr || []).some((n) => hs.has(norm(n)));
  };

  // ---------- initialPrefs -> UI 선택 복구 ----------
  useEffect(() => {
    if (!initialPrefs) return;

    // ✅ region 복구(기존 Sidebar 방식 유지)
    const regionArr = Array.isArray(initialPrefs.region) ? initialPrefs.region : [];
    const regionSet = new Set();

    for (const [canonical, aliases] of Object.entries(REGION_ALIASES)) {
      if (regionArr.some((r) => aliases.includes(r) || r === canonical)) {
        regionSet.add(canonical);
      }
    }
    regionArr.forEach((r) => {
      if (r === "광주" || r === "광주광역시" || r === "gwangju") regionSet.add("광주 전체");
    });

    // ✅ 서버로 보낸(혹은 서버에서 받은) 키들에서 최대한 복구
    const purposeArr = mergeUnique(initialPrefs.purpose, initialPrefs.companion_tags);
    const mustArr = mergeUnique(initialPrefs.must, initialPrefs.required);
    const themeArr = mergeUnique(initialPrefs.theme, initialPrefs.atmosphere, initialPrefs.atmosphere_tags);
    const moodArr = mergeUnique(initialPrefs.mood, initialPrefs.atmosphere, initialPrefs.atmosphere_tags);
    const dessertArr = mergeUnique(initialPrefs.dessert, initialPrefs.menu, initialPrefs.menu_tags);

    const visitSet = new Set();
    const themeSet = new Set();
    const dessertSet = new Set();
    const requiredSet = new Set();

    // UI_TO_SOURCE 기반으로 “토큰 포함” 여부로 UI 옵션을 다시 선택 처리
    Object.entries(UI_TO_SOURCE).forEach(([uiLabel, map]) => {
      const hit =
        (map.purpose && includesAny(purposeArr, map.purpose)) ||
        (map.must && includesAny(mustArr, map.must)) ||
        (map.theme && includesAny(themeArr, map.theme)) ||
        (map.mood && includesAny(moodArr, map.mood)) ||
        (map.dessert && includesAny(dessertArr, map.dessert));

      if (!hit) return;

      if (filters["방문 목적"]?.includes(uiLabel)) visitSet.add(uiLabel);
      if (filters["테마/분위기"]?.includes(uiLabel)) themeSet.add(uiLabel);
      if (filters["디저트"]?.includes(uiLabel)) dessertSet.add(uiLabel);
      if (filters["필수 조건"]?.includes(uiLabel)) requiredSet.add(uiLabel);
    });

    setSelected({
      지역: regionSet,
      "방문 목적": visitSet,
      "테마/분위기": themeSet,
      디저트: dessertSet,
      "필수 조건": requiredSet,
    });

    const hasGwangju = Array.from(regionSet).some(
      (v) => v === "광주 전체" || String(v).startsWith("광주 ")
    );
    if (hasGwangju) setIsGwangjuOpen(true);
  }, [initialPrefs, filters]);

  // ---------- toggles ----------
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
      "방문 목적": new Set(),
      "테마/분위기": new Set(),
      디저트: new Set(),
      "필수 조건": new Set(),
    });
    onReset?.();
  };

  // ---------- buildPrefs (핵심) ----------
  const buildPrefs = () => {
    // ✅ 지역은 alias 확장해서 서버/데이터 매칭용으로 전송 (기존 유지)
    const regionLabels = Array.from(selected["지역"] || []);
    const regionExpanded = [];
    for (const label of regionLabels) {
      const aliases = REGION_ALIASES[label] || [label];
      for (const v of aliases) {
        if (!regionExpanded.includes(v)) regionExpanded.push(v);
      }
    }

    const picked = [
      ...Array.from(selected["방문 목적"] || []),
      ...Array.from(selected["테마/분위기"] || []),
      ...Array.from(selected["디저트"] || []),
      ...Array.from(selected["필수 조건"] || []),
    ];

    const purpose = [];
    const must = [];
    const theme = [];
    const mood = [];
    const dessert = [];

    const pushUnique = (arr, vals) => {
      (vals || []).forEach((v) => {
        if (!arr.includes(v)) arr.push(v);
      });
    };

    picked.forEach((uiLabel) => {
      const map = UI_TO_SOURCE[uiLabel];
      if (!map) return;
      pushUnique(purpose, map.purpose);
      pushUnique(must, map.must);
      pushUnique(theme, map.theme);
      pushUnique(mood, map.mood);
      pushUnique(dessert, map.dessert);
    });

    // ✅ 호환 키도 함께 채움
    const atmosphere = Array.from(new Set([...theme, ...mood]));
    const menu = dessert.slice();
    const required = must.slice();

    return {
      // 지역(기존 유지)
      region: regionExpanded,

      // ✅ 요청하신 “Source Tags” 키들
      purpose,
      must,
      theme,
      mood,
      dessert,

      // ✅ 기존 키(호환)
      atmosphere,
      menu,
      required,

      // ✅ CSV 컬럼명 기반 키(호환)
      atmosphere_tags: atmosphere,
      menu_tags: menu,
      companion_tags: purpose,
    };
  };

  const hasSelection =
    (selected["지역"]?.size || 0) +
      (selected["방문 목적"]?.size || 0) +
      (selected["테마/분위기"]?.size || 0) +
      (selected["디저트"]?.size || 0) +
      (selected["필수 조건"]?.size || 0) >
    0;

  const activeChips = useMemo(() => {
    const chips = [];
    for (const [group, set] of Object.entries(selected)) {
      for (const v of set) chips.push({ group, value: v });
    }
    return chips;
  }, [selected]);

  // ✅ 선택된 칩(상단) 표시값: 지역이면 이모지 포함해서 보여주기
  const displayChipValue = (group, value) => {
    if (group === "지역") {
      if (value === "광주 전체") return `${getRegionEmoji(value)} 광주(전체)`;
      if (value.startsWith("광주 ")) return `${getRegionEmoji(value)} ${value.replace("광주 ", "")}`;
      return `${getRegionEmoji(value)} ${value}`;
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
        {/* ✅ 광주 토글 버튼 */}
        <button
          type="button"
          className={`filter-chip-wrap region-toggle ${isGwangjuOpen ? "is-open" : ""}`}
          onClick={() => setIsGwangjuOpen((p) => !p)}
          aria-expanded={isGwangjuOpen}
        >
          <div className="filter-chip-inner">
            <div className="filter-chip-text">
              <span>{REGION_EMOJI_MAP["광주 전체"]} 광주</span>
              <span className={`region-caret ${isGwangjuOpen ? "open" : ""}`}>▾</span>
            </div>
          </div>
        </button>

        {/* ✅ 나주/담양/화순 */}
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
                <div className="filter-chip-text">
                  {getRegionEmoji(option)} {option}
                </div>
              </div>
            </button>
          );
        })}

        {/* ✅ 광주 하위(구) 옵션 */}
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
                    <div className="filter-chip-text">
                      {getRegionEmoji(value)} {label}
                    </div>
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
    <aside className="sidebar" style={{ display: isOpen ? "block" : "none", height: "100vh" }}>
      <div className="sidebar-layout" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="sidebar-content-wrap" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
          <div className="sidebar-scroll-area" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
          <div className="sidebar-footer" style={{ marginTop: "auto" }}>
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
