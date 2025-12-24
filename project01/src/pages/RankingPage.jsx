import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Header from "../components/Header"; // 경로 유지
import "../styles/RankingPage.css";

/**
 * RankingPage (Consumer + Creator)
 * - Consumer: 인기 메뉴 TOP / 핫한 거리 TOP
 * - Creator: 창업자 인사이트 (메뉴 트렌드 / 메뉴 조합 / 목적 / 분위기 / 맛)
 *
 * NOTE
 * - Creator는 /api/creator/insights 를 직접 조회합니다.
 * - 프로젝트 단계에서는 시간축(최근성) 기반 트렌드가 아니라 “현재 수집된 리뷰 텍스트” 기반 집계입니다.
 */

// ---------------------------
// Helpers
// ---------------------------

const MENU_CAT_LABEL = { dessert: "디저트", drink: "음료", meal: "식사" };
const MENU_CAT_TONE = { dessert: "good", drink: "info", meal: "muted" };

const ACTION_BTN_STYLE = {
  padding: "6px 10px",
  fontSize: 12,
  whiteSpace: "nowrap",
  width: "auto",
  minWidth: "max-content",
  flexShrink: 0,
  wordBreak: "keep-all",
  lineHeight: 1.1,
};

const TAG_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
  wordBreak: "keep-all",
  lineHeight: 1.0,
  flexShrink: 0,
  minWidth: "max-content",
};


function menuCatLabel(cat) {
  return MENU_CAT_LABEL[cat] || "기타";
}

function menuCatTone(cat) {
  return MENU_CAT_TONE[cat] || "muted";
}

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

function safeNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function abbreviateAreaName(v) {
  const s = String(v || "").trim();
  if (!s) return "";

  // 흔한 행정구역 표기를 짧게 표시(표시만 축약, 데이터 키는 원본 유지)
  const reps = [
    ["광주광역시", "광주"],
    ["부산광역시", "부산"],
    ["대구광역시", "대구"],
    ["대전광역시", "대전"],
    ["인천광역시", "인천"],
    ["울산광역시", "울산"],
    ["서울특별시", "서울"],
    ["세종특별자치시", "세종"],
    ["경기도", "경기"],
    ["강원특별자치도", "강원"],
    ["강원도", "강원"],
    ["충청북도", "충북"],
    ["충청남도", "충남"],
    ["전라북도", "전북"],
    ["전라남도", "전남"],
    ["경상북도", "경북"],
    ["경상남도", "경남"],
    ["제주특별자치도", "제주"],
    ["제주도", "제주"],
  ];

  let out = s;
    for (const [a, b] of reps) out = out.replace(a, b);
  return out;
}

function buildMenuTrendFromCafes(items = [], catMap) {
  const safe = Array.isArray(items) ? items : [];
  const count = new Map();

  const getCat = (name) => {
    try {
      return catMap && typeof catMap.get === "function" ? (catMap.get(name) || "") : "";
    } catch {
      return "";
    }
  };

  for (const c of safe) {
    if (!Array.isArray(c.desserts)) continue;
    const uniq = [...new Set(c.desserts.filter(Boolean))];
    for (const d of uniq) count.set(d, (count.get(d) ?? 0) + 1);
  }

  return [...count.entries()]
    .sort((a, b) => {
      const d = (b[1] ?? 0) - (a[1] ?? 0);
      if (d) return d;
      return String(a[0]).localeCompare(String(b[0]), "ko");
    })
    .map(([name, mentions]) => ({
      name,
      category: getCat(name),
      mentions,
    }));
}

function buildHotAreasFromCafes(items = [], catMap) {
  const safe = Array.isArray(items) ? items : [];

  const getCat = (name) => {
    try {
      return catMap && typeof catMap.get === "function" ? (catMap.get(name) || "") : "";
    } catch {
      return "";
    }
  };

  // areaKey(도로명) -> stats
  const areaMap = new Map();

  for (const c of safe) {
    const area =
      c.road_area_key ||
      c.road_key ||
      c.neighborhood ||
      c._regionText ||
      c.region ||
      "기타";

    const ext = Number(c.reviewCountExternal ?? c.reviewCount ?? 0) || 0;
    const cap = Math.max(0, Math.min(10, ext));

    let cur = areaMap.get(area);
    if (!cur) {
      cur = {
        cafeCount: 0,
        reviewSumCap10: 0,
        full10Count: 0,
        menuSet: new Set(),
        menuCafeCount: new Map(),
      };
      areaMap.set(area, cur);
    }

    cur.cafeCount += 1;
    cur.reviewSumCap10 += cap;
    if (cap >= 10) cur.full10Count += 1;

    const menus = Array.isArray(c.desserts) ? c.desserts.filter(Boolean) : [];
    const uniqMenus = [...new Set(menus)];
    for (const m of uniqMenus) {
      cur.menuSet.add(m);
      cur.menuCafeCount.set(m, (cur.menuCafeCount.get(m) ?? 0) + 1);
    }
  }

  const areasAll = [...areaMap.entries()].map(([name, v]) => ({
    name,
    cafeCount: v.cafeCount,
    reviewSumCap10: v.reviewSumCap10,
    full10Count: v.full10Count,
    menuCount: v.menuSet.size,
    menuCafeCount: v.menuCafeCount,
  }));

  // 표본이 너무 적은 거리(카페 1개 등)가 상위권을 먹는 현상 방지
  const MIN_CAFES_PRIMARY = 3;
  const MIN_CAFES_FALLBACK = 2;

  let areas = areasAll.filter((a) => a.cafeCount >= MIN_CAFES_PRIMARY);
  if (areas.length < 10) areas = areasAll.filter((a) => a.cafeCount >= MIN_CAFES_FALLBACK);
  if (areas.length < 10) areas = areasAll;

  const maxCafeCount = Math.max(1, ...areas.map((a) => a.cafeCount));
  const maxMenuCount = Math.max(1, ...areas.map((a) => a.menuCount));

  const scoreOf = (a) => {
    const cafeCount = Math.max(1, a.cafeCount);
    const full10Ratio = a.full10Count / cafeCount; // 0~1
    const density = (a.reviewSumCap10 / cafeCount) / 10; // 평균(0~10) -> 0~1
    const variety = Math.log(1 + a.menuCount) / Math.log(1 + maxMenuCount); // 0~1
    const scale = Math.log(1 + cafeCount) / Math.log(1 + maxCafeCount); // 0~1

    const stability = cafeCount / (cafeCount + 3);

    // 카페수 비중 높게
    const quality = 0.45 * full10Ratio + 0.35 * density + 0.20 * variety;
    const score = 0.65 * scale + 0.35 * stability * quality;
    return { score, full10Ratio, density, variety, scale, stability };
  };

  const enriched = areas.map((a) => {
    const s = scoreOf(a);

    const cafeCount = a.cafeCount;
    const avg = cafeCount ? a.reviewSumCap10 / cafeCount : 0;

    const topMenus = [...a.menuCafeCount.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([name, mentions]) => {
        const cat = getCat(name);
        return {
          name,
          mentions,
          cat,
          label: menuCatLabel(cat),
        };
      });

    const score100 = Math.round(s.score * 1000) / 10;
    const meta = `카페 ${cafeCount}곳 · 평균 ${avg.toFixed(1)}/10 · 메뉴 ${a.menuCount}종`;

    return {
      name: a.name,
      meta,
      score100,
      cafeCount,
      avgReviewCap10: avg,
      reviewSumCap10: a.reviewSumCap10,
      full10Count: a.full10Count,
      full10Ratio: s.full10Ratio,
      menuCount: a.menuCount,
      topMenus,
      _scoreParts: {
        full10Ratio: s.full10Ratio,
        density: s.density,
        variety: s.variety,
        scale: s.scale,
        stability: s.stability,
      },
    };
  });

  enriched.sort((a, b) => {
    const d1 = (b.score100 ?? 0) - (a.score100 ?? 0);
    if (d1) return d1;
    const d2 = (b.cafeCount ?? 0) - (a.cafeCount ?? 0);
    if (d2) return d2;
    return String(a.name).localeCompare(String(b.name), "ko");
  });

  return enriched;
}

// ---------------------------
// UI Components
// ---------------------------

function Drawer({ open, title, onClose, children, bodyRef }) {
  // Render drawer in a portal to avoid being clipped by any parent layout/overflow/transform.
  // Also lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    zIndex: 9999,
    display: "flex",
    justifyContent: "flex-end",
  };

  const drawerStyle = {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100dvh",
    width: "min(560px, 94vw)",
    background: "#fff",
    boxShadow: "-6px 0 28px rgba(0,0,0,0.18)",
    borderRadius: "16px 0 0 16px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const headerStyle = {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flex: "0 0 auto",
  };

  const bodyStyle = {
    padding: "14px 16px",
    overflow: "auto",
    flex: "1 1 auto",
    minHeight: 0,
  };

  return createPortal(
    <div style={overlayStyle} onMouseDown={onClose}>
      <aside style={drawerStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div className="rkpg-drawer-title">{title}</div>
          <button className="rkpg-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div style={bodyStyle} ref={bodyRef}>{children}</div>
      </aside>
    </div>,
    document.body
  );
}

function Pill({ children, tone = "muted" }) {
  return <span className={`rkpg-pill ${tone}`}>{children}</span>;
}

function Progress({ label, value, max }) {
  const safeMax = Math.max(max ?? 1, 1);
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div className="rkpg-progress">
      <div className="rkpg-progress-row">
        <span className="rkpg-muted">{label}</span>
        <b>{value}</b>
      </div>
      <div className="rkpg-progress-track">
        <div className="rkpg-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------
// Page
// ---------------------------

export default function RankingPage() {
  // consumer | creator
  const [mode, setMode] = useState("consumer");

  // Consumer 메뉴 TOP 필터 (all | drink | dessert_meal)
  const [menuView, setMenuView] = useState("all");
  const [menuShowCount, setMenuShowCount] = useState(10);
  const [hotShowCount, setHotShowCount] = useState(10);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerCtx, setDrawerCtx] = useState({ type: "", key: "" });

  // Drawer 내부 스크롤 제어(포탈 바디 기준)
  const drawerBodyRef = useRef(null);

  // Drawer(전체 메뉴) 상태
  const [menuAllFilter, setMenuAllFilter] = useState("all"); // all|dessert|drink|meal|other
  const [menuAllSort, setMenuAllSort] = useState("pop"); // pop|alpha


  const openInsight = useCallback((title, ctx) => {
    const t = String(ctx?.type || "");

    // Drawer별로 내부 상태 초기화
    if (t === "menuAll") {
      setMenuAllFilter("all");
      setMenuAllSort("pop");
    }

    setDrawerTitle(title);
    setDrawerCtx(ctx);
    setDrawerOpen(true);
  }, []);

  // 서버 데이터(Consumer)
  const [serverUpdatedAt, setServerUpdatedAt] = useState("");
  const [dessertTrend, setDessertTrend] = useState([]);
  const [hotAreas, setHotAreas] = useState([]);

  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState("");
  const [apiCafes, setApiCafes] = useState([]);
  const [kwDict, setKwDict] = useState([]);

  // Creator 데이터
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState("");
  const [creatorData, setCreatorData] = useState({
    menus: [],
    pairs: [],
    purpose: [],
    atmosphere: [],
    taste: [],
    meta: null,
  });

  // keyword_dict -> category map (menus pill)
  const menuCatMap = useMemo(() => {
    const m = new Map();
    const arr = Array.isArray(kwDict) ? kwDict : [];
    for (const r of arr) {
      const k = String(r?.canonical_keyword ?? r?.canonical ?? "").trim();
      const c = String(r?.category ?? "").trim();
      if (k) m.set(k, c);
    }
    return m;
  }, [kwDict]);

  // Consumer: 전체 메뉴 목록(카페에서 실제 나온 메뉴)
  const allMenus = useMemo(() => {
    const safe = Array.isArray(apiCafes) ? apiCafes : [];
    const all = [];
    for (const c of safe) {
      if (Array.isArray(c.desserts)) all.push(...c.desserts.filter(Boolean));
    }

    const uniq = [...new Set(all)];
    const order = { dessert: 0, drink: 1, meal: 2 };
    uniq.sort((a, b) => {
      const ca = menuCatMap.get(a) || "";
      const cb = menuCatMap.get(b) || "";
      const oa = order[ca] ?? 9;
      const ob = order[cb] ?? 9;
      if (oa !== ob) return oa - ob;
      return String(a).localeCompare(String(b), "ko");
    });

    return uniq;
  }, [apiCafes, menuCatMap]);

  const dictMenus = useMemo(() => {
    const arr = Array.isArray(kwDict) ? kwDict : [];
    const out = [];
    for (const r of arr) {
      const cat = String(r?.category ?? "").trim();
      if (!(["dessert", "drink", "meal"].includes(cat))) continue;
      const k = String(r?.canonical_keyword ?? "").trim();
      if (k) out.push(k);
    }
    return [...new Set(out)].sort((a, b) => a.localeCompare(b, "ko"));
  }, [kwDict]);

  const missingMenus = useMemo(() => {
    const set = new Set(allMenus);
    return dictMenus.filter((k) => !set.has(k));
  }, [dictMenus, allMenus]);

  const menuCounts = useMemo(() => {
    const cnt = { dessert: 0, drink: 0, meal: 0, other: 0 };
    for (const k of allMenus) {
      const c = menuCatMap.get(k) || "";
      if (c === "dessert") cnt.dessert += 1;
      else if (c === "drink") cnt.drink += 1;
      else if (c === "meal") cnt.meal += 1;
      else cnt.other += 1;
    }
    return cnt;
  }, [allMenus, menuCatMap]);

  // 메뉴별 언급 카페 수(map) — Drawer 정렬 등에 사용
  const menuMentionsMap = useMemo(() => {
    const m = new Map();
    const src = Array.isArray(dessertTrend) ? dessertTrend : [];
    for (const it of src) {
      const k = String(it?.name ?? "").trim();
      if (!k) continue;
      m.set(k, safeNum(it?.mentions));
    }
    return m;
  }, [dessertTrend]);


  // Consumer: 메뉴 TOP 필터
  const menuViewCats = useMemo(() => {
    if (menuView === "drink") return ["drink"];
    if (menuView === "dessert_meal") return ["dessert", "meal"];
    return ["dessert", "drink", "meal"]; // all
  }, [menuView]);

  const menuViewHint = useMemo(() => {
    if (menuView === "drink") return "음료 기준";
    if (menuView === "dessert_meal") return "디저트+식사 기준";
    return "디저트·음료·식사 통합 기준";
  }, [menuView]);

  const onChangeMenuView = useCallback((v) => {
    setMenuView(v);
    setMenuShowCount(10);
  }, []);

  // Drawer(전체 메뉴)에서 필터/정렬 변경 시 상단으로 이동
  useEffect(() => {
    if (!drawerOpen) return;
    if (drawerCtx?.type !== "menuAll") return;
    try {
      drawerBodyRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      // ignore
    }
  }, [drawerOpen, drawerCtx?.type, menuAllFilter, menuAllSort]);


  const menuRankAll = useMemo(() => {
    const src = Array.isArray(dessertTrend) ? dessertTrend : [];
    const cats = new Set(menuViewCats);
    return src.filter((it) => cats.has((it?.category || "dessert")));
  }, [dessertTrend, menuViewCats]);

  const menuVisible = useMemo(() => {
    const n = Math.max(0, Math.min(Number(menuShowCount) || 0, menuRankAll.length));
    return menuRankAll.slice(0, n);
  }, [menuRankAll, menuShowCount]);

  const hotVisible = useMemo(() => {
    const src = Array.isArray(hotAreas) ? hotAreas : [];
    const n = Math.max(0, Math.min(Number(hotShowCount) || 0, src.length));
    return src.slice(0, n);
  }, [hotAreas, hotShowCount]);

  // ✅ Consumer 데이터 로드: /api/cafes + /api/keywords
  useEffect(() => {
    let alive = true;

    const run = async () => {
      setBootLoading(true);
      setBootError("");

      try {
        const cRes = await fetch("/api/cafes");
        if (!cRes.ok) throw new Error(`/api/cafes HTTP ${cRes.status}`);
        const cJson = await cRes.json();

        const list =
          Array.isArray(cJson) ? cJson :
          Array.isArray(cJson?.items) ? cJson.items :
          Array.isArray(cJson?.cafes) ? cJson.cafes :
          Array.isArray(cJson?.data) ? cJson.data :
          Array.isArray(cJson?.rows) ? cJson.rows : [];

        if (!alive) return;
        setApiCafes(list);

        // keyword_dict(메뉴 사전) 로드
        let kwItems = [];
        try {
          const kRes = await fetch("/api/keywords?limit=2000");
          if (kRes.ok) {
            const kJson = await kRes.json();
            kwItems = Array.isArray(kJson) ? kJson : Array.isArray(kJson?.items) ? kJson.items : [];
            if (alive) setKwDict(kwItems);
          }
        } catch {
          // ignore
        }

        const catMap = new Map();
        for (const r of kwItems) {
          const k = String(r?.canonical_keyword ?? r?.canonical ?? "").trim();
          const c = String(r?.category ?? "").trim();
          if (k) catMap.set(k, c);
        }

        setDessertTrend(buildMenuTrendFromCafes(list, catMap));
        setHotAreas(buildHotAreasFromCafes(list, catMap));

        // /api/status (옵션)
        fetch("/api/status")
          .then((r) => (r.ok ? r.json() : null))
          .then((sJson) => {
            if (!alive) return;
            if (sJson?.updatedAt) setServerUpdatedAt(sJson.updatedAt);
          })
          .catch(() => {
            /* ignore */
          });
      } catch (e) {
        if (!alive) return;
        setBootError(e?.message ?? String(e));
      } finally {
        if (alive) setBootLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  // ✅ Creator 데이터 로드: /api/creator/insights
  useEffect(() => {
    let alive = true;

    const run = async () => {
      setCreatorLoading(true);
      setCreatorError("");

      try {
        const r = await fetch("/api/creator/insights?limit=50&pairsLimit=50");
        if (!r.ok) throw new Error(`/api/creator/insights HTTP ${r.status}`);
        const j = await r.json();

        if (!alive) return;
        setCreatorData({
          menus: safeArr(j?.menus),
          pairs: safeArr(j?.pairs),
          purpose: safeArr(j?.purpose),
          atmosphere: safeArr(j?.atmosphere),
          taste: safeArr(j?.taste),
          meta: j?.meta ?? null,
        });
      } catch (e) {
        if (!alive) return;
        setCreatorError(e?.message ?? String(e));
      } finally {
        if (alive) setCreatorLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  // Drawer content
  const renderDrawerBody = useCallback(() => {
    const { type, key } = drawerCtx || {};

    // ✅ Consumer: 전체 메뉴 보기
    if (type === "menuAll") {
      const catOrder = { dessert: 0, drink: 1, meal: 2, other: 9 };

      const filterLabel =
        menuAllFilter === "dessert" ? "디저트" :
        menuAllFilter === "drink" ? "음료" :
        menuAllFilter === "meal" ? "식사" :
        menuAllFilter === "other" ? "기타" : "전체";

      const items = allMenus.filter((name) => {
        const cat = menuCatMap.get(name) || "";
        if (menuAllFilter === "dessert") return cat === "dessert";
        if (menuAllFilter === "drink") return cat === "drink";
        if (menuAllFilter === "meal") return cat === "meal";
        if (menuAllFilter === "other") return !["dessert", "drink", "meal"].includes(cat);
        return true;
      });

      items.sort((a, b) => {
        const ca = menuCatMap.get(a) || "";
        const cb = menuCatMap.get(b) || "";
        const oa = catOrder[ca] ?? 9;
        const ob = catOrder[cb] ?? 9;

        if (menuAllSort === "alpha") {
          if (menuAllFilter === "all" && oa !== ob) return oa - ob;
          return String(a).localeCompare(String(b), "ko");
        }

        const pa = menuMentionsMap.get(a) ?? 0;
        const pb = menuMentionsMap.get(b) ?? 0;
        const d = pb - pa;
        if (d) return d;
        if (menuAllFilter === "all" && oa !== ob) return oa - ob;
        return String(a).localeCompare(String(b), "ko");
      });

      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>전체 메뉴 키워드</b>
                <div className="rkpg-smallhint">현재 데이터 {allMenus.length}개 · 사전 {dictMenus.length}개</div>
              </div>
              <Pill tone="muted">{filterLabel}</Pill>
            
</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
              <div className="rkpg-seg">
                <button className={menuAllFilter === "all" ? "is-active" : ""} onClick={() => setMenuAllFilter("all")}>전체</button>
                <button className={menuAllFilter === "dessert" ? "is-active" : ""} onClick={() => setMenuAllFilter("dessert")}>디저트</button>
                <button className={menuAllFilter === "drink" ? "is-active" : ""} onClick={() => setMenuAllFilter("drink")}>음료</button>
                <button className={menuAllFilter === "meal" ? "is-active" : ""} onClick={() => setMenuAllFilter("meal")}>식사</button>
                <button className={menuAllFilter === "other" ? "is-active" : ""} onClick={() => setMenuAllFilter("other")}>기타</button>
              </div>

              <div className="rkpg-seg" style={{ marginLeft: "auto" }}>
                <button className={menuAllSort === "pop" ? "is-active" : ""} onClick={() => setMenuAllSort("pop")}>인기도</button>
                <button className={menuAllSort === "alpha" ? "is-active" : ""} onClick={() => setMenuAllSort("alpha")}>가나다</button>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>

              <Pill tone="good">디저트 {menuCounts.dessert}</Pill>
              <Pill tone="info">음료 {menuCounts.drink}</Pill>
              <Pill tone="muted">식사 {menuCounts.meal}</Pill>
              {menuCounts.other ? <Pill tone="muted">기타 {menuCounts.other}</Pill> : null}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {items.map((name) => {
                const cat = menuCatMap.get(name) || "";
                const mentions = menuMentionsMap.get(name) ?? 0;
                return (
                  <div
                    key={name}
                    className="rkpg-click"
                    onClick={() => openInsight(`[${menuCatLabel(cat)}] ${name} 인사이트`, { type: "menu", key: name })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      border: "1px solid rgba(0,0,0,0.10)",
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.02)",
                      cursor: "pointer",
                    }}
                  >
                    <Pill tone={menuCatTone(cat)}>{menuCatLabel(cat)}</Pill>
                    <b>{name}</b>
                    <span className="rkpg-muted" style={{ marginLeft: 6 }}>언급 {Number(mentions).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>

            {missingMenus.length ? (
              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: "pointer" }}>사전에는 있으나 데이터에 아직 등장하지 않은 메뉴 {missingMenus.length}개</summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  {missingMenus.map((name) => {
                    const cat = menuCatMap.get(name) || "";
                    return (
                      <div
                        key={name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          border: "1px dashed rgba(0,0,0,0.18)",
                          borderRadius: 12,
                        }}
                      >
                        <Pill tone={menuCatTone(cat)}>{menuCatLabel(cat)}</Pill>
                        <span>{name}</span>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      );
    }

    // Consumer: menu item
    if (type === "menu") {
      const item = dessertTrend.find((d) => d.name === key);
      const mentions = Number(item?.mentions ?? 0);
      const max = Math.max(1, ...dessertTrend.map((d) => Number(d.mentions ?? 0)));
      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>근거</b>
                <div className="rkpg-smallhint">카페 정보 기반 집계</div>
              </div>
              <Pill tone="info">메뉴</Pill>
            </div>
            <Progress label="언급 카페 수" value={mentions} max={max} />
            <div className="rkpg-smallhint">※ 이번 프로젝트는 기간 데이터가 없어 증감률을 계산하지 않습니다.</div>
          </div>
        </div>
      );
    }

    // Consumer: area method
    if (type === "areaMethod") {
      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>핫한 거리 산정 방식</b>
                <div className="rkpg-smallhint">크롤링 리뷰(카페당 최대 10개) 포착치 기반 · 시간축(최근성) 미사용 · 상권 분석/수요 예측 아님</div>
              </div>
              <Pill tone="muted">설명</Pill>
            </div>

            <div className="rkpg-insight-ul">
              • <b>집계 대상</b>: 기본은 <b>카페 3곳 이상</b>인 거리만 후보(10개 미만이면 2곳 이상으로 완화, 그래도 부족하면 전체 사용)<br />
              • <b>리뷰 포착치</b>: r = min(10, reviewCountExternal)<br />
              • <b>인기</b>: 10/10(꽉 찬) 카페 비율 = full10Count / cafeCount<br />
              • <b>밀도</b>: 카페당 평균 리뷰 포착치 = (Σ r / cafeCount) / 10<br />
              • <b>다양성</b>: 해당 거리의 유니크 메뉴 수(통합 메뉴 기준), log로 완만하게 반영<br />
              • <b>스케일</b>: 카페 수가 많은 거리의 안정도를 log로 반영<br />
              • <b>표본 안정도 보정</b>: 카페 수가 매우 적으면(1~3개) 과대평가를 줄이기 위해 stability 가중 적용
            </div>

            <div className="rkpg-insight-box" style={{ marginTop: 12 }}>
              <div className="rkpg-smallhint">최종 점수(0~100)는 아래 구성 요소를 합산 후 안정도 보정을 적용합니다.</div>
              <div className="rkpg-insight-ul" style={{ marginTop: 8 }}>
                • quality = 0.45×인기 + 0.35×밀도 + 0.20×다양성<br />
                • score = 0.65×스케일 + 0.35×stability×quality<br />
                • score100 = score × 100
              </div>
            </div>
          </div>
        </div>
      );
    }



    // Consumer: 전체 거리 보기
    if (type === "areaAll") {
      const items = Array.isArray(hotAreas) ? hotAreas : [];

      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>핫한 거리 전체</b>
                <div className="rkpg-smallhint">카페 3곳 이상 거리 우선(부족 시 완화) · 목록에서는 점수를 숨기고 근거만 표시합니다.</div>
              </div>
              <Pill tone="muted">전체</Pill>
            </div>

            {items.length ? (
              <ul className="rkpg-plainlist" style={{ marginTop: 10 }}>
                {items.map((it, idx) => (
                  <li
                    key={`${it?.name}-${idx}`}
                    className="rkpg-row-between rkpg-click"
                    style={{ alignItems: "center" }}
                    onClick={() => openInsight(`${abbreviateAreaName(it?.name)} 인사이트`, { type: "area", key: it?.name })}
                  >
                    <span>
                      <span className="rkpg-muted" style={{ marginRight: 8 }}>{idx + 1}.</span>
                      <b>{abbreviateAreaName(it?.name)}</b>
                    </span>
                    <span className="rkpg-muted">{String(it?.meta ?? "")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rkpg-smallhint" style={{ marginTop: 10 }}>표시할 데이터가 없습니다.</div>
            )}
          </div>
        </div>
      );
    }
    // Consumer: area item
    if (type === "area") {
      const item = hotAreas.find((a) => a.name === key);
      const parts = item?._scoreParts || {};
      const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;

      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>거리 인사이트</b>
                <div className="rkpg-smallhint">크롤링 리뷰(카페당 최대 10개) 포착치 기반</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
<button className="rkpg-btn" style={ACTION_BTN_STYLE} onClick={() => openInsight("핫한 거리 산정 방식", { type: "areaMethod" })}>
                  산정 방식
                </button>
                <Pill tone="info">핫플</Pill>
              </div>
            </div>

            <div className="rkpg-opprow-grid" style={{ marginTop: 10 }}>
              <div className="rkpg-insight-ul">• 점수(참고): <b>{item?.score100 ?? "-"}</b></div>
              <div className="rkpg-insight-ul">• 카페 수: <b>{item?.cafeCount ?? "-"}</b></div>
              <div className="rkpg-insight-ul">• 평균 리뷰(캡10): <b>{item ? item.avgReviewCap10.toFixed(1) : "-"}/10</b></div>
              <div className="rkpg-insight-ul">• 10/10 비율: <b>{item ? pct(item.full10Ratio) : "-"}</b></div>
              <div className="rkpg-insight-ul">• 메뉴 다양성: <b>{item?.menuCount ?? "-"}</b>종</div>
              <div className="rkpg-insight-ul">• 총 리뷰(캡10 합): <b>{item?.reviewSumCap10 ?? "-"}</b></div>
            </div>

            <div style={{ marginTop: 12 }}>
              <Progress label="인기(10/10 비율)" value={Math.round((parts.full10Ratio ?? 0) * 100)} max={100} />
              <Progress label="밀도(평균/10)" value={Math.round((parts.density ?? 0) * 100)} max={100} />
              <Progress label="다양성(log)" value={Math.round((parts.variety ?? 0) * 100)} max={100} />
              <Progress label="스케일(log)" value={Math.round((parts.scale ?? 0) * 100)} max={100} />
            </div>

            <div className="rkpg-insight-box" style={{ marginTop: 12 }}>
              <div className="rkpg-row-between">
                <b>대표 메뉴</b>
                <Pill tone="muted">TOP 3</Pill>
              </div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(item?.topMenus ?? []).length ? (
                  item.topMenus.map((m) => (
                    <span
                      key={m.name}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(0,0,0,0.12)",
                      }}
                    >
                      <Pill tone={menuCatTone(m.cat)}>{m.label}</Pill>
                      <span style={{ marginLeft: 8 }}>{m.name}</span>
                      <span className="rkpg-muted" style={{ marginLeft: 8 }}>({m.mentions})</span>
                    </span>
                  ))
                ) : (
                  <span className="rkpg-muted">-</span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Creator: about
    if (type === "creatorAbout") {
      const meta = creatorData?.meta;
      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>창업자 인사이트 산정 방식</b>
                <div className="rkpg-smallhint">상권 분석/수요 예측 배제 · 시간 트렌드(최근성) 미사용 · 키워드 언급량 기반</div>
              </div>
              <Pill tone="muted">설명</Pill>
            </div>

            <div className="rkpg-insight-ul">
              • 데이터: 카페별 <b>keyword_counts_json</b> 우선, 없으면 <b>top_keywords_json</b>로 폴백<br />
              • 메뉴/컨셉 분류: <b>keyword_dict</b>(canonical + synonyms) 기준 통합<br />
              • 시간 트렌드(최근성) 분석은 프로젝트 단계에서 사용하지 않습니다.
            </div>

            <div className="rkpg-insight-box" style={{ marginTop: 12 }}>
              <div className="rkpg-smallhint">
                점수는 언급량(mentionCount)과 등장 카페수(cafeCount)를 함께 반영합니다.
              </div>
              <div className="rkpg-insight-ul" style={{ marginTop: 8 }}>
                • score ≈ 0.7×log(1+mentionCount) + 0.3×log(1+cafeCount) × weight
              </div>
            </div>

            {meta ? (
              <div className="rkpg-smallhint" style={{ marginTop: 12 }}>
                사용 카페 수: {safeNum(meta.cafesUsed).toLocaleString()} · 기준시각: {String(meta.asOf || "")}<br />
                {meta.note ? `비고: ${meta.note}` : null}
              </div>
            ) : (
              <div className="rkpg-smallhint" style={{ marginTop: 12 }}>
                meta 정보가 없습니다.
              </div>
            )}
          </div>
        </div>
      );
    }

    // Creator: list drawers
    const listDrawer = (title, items, renderRow) => (
      <div className="rkpg-insight">
        <div className="rkpg-insight-box">
          <div className="rkpg-row-between">
            <b>{title}</b>
            <Pill tone="muted">전체</Pill>
          </div>

          {items.length ? (
            <ul className="rkpg-plainlist" style={{ marginTop: 10 }}>
              {items.map((it, idx) => (
                <li key={`${idx}-${it?.keyword || it?.a || ""}`} className="rkpg-row-between" style={{ alignItems: "center" }}>
                  {renderRow(it, idx)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rkpg-smallhint" style={{ marginTop: 10 }}>표시할 데이터가 없습니다.</div>
          )}
        </div>
      </div>
    );

    if (type === "creatorMenus") {
      const items = safeArr(creatorData?.menus);
      return listDrawer("메뉴 트렌드 전체", items, (it, idx) => (
        <>
          <span>
            <span className="rkpg-muted" style={{ marginRight: 8 }}>{idx + 1}.</span>
            <Pill tone={menuCatTone(it?.category)}>{menuCatLabel(it?.category)}</Pill>
            <b style={{ marginLeft: 8 }}>{String(it?.keyword ?? "")}</b>
          </span>
          <span className="rkpg-muted">언급 {safeNum(it?.mentionCount).toLocaleString()} · 카페 {safeNum(it?.cafeCount).toLocaleString()}</span>
        </>
      ));
    }

    if (type === "creatorPairs") {
      const items = safeArr(creatorData?.pairs)
        .filter((p) => safeNum(p?.cafeCount) >= 3)
        .sort((a, b) => {
          const d1 = safeNum(b?.cafeCount) - safeNum(a?.cafeCount);
          if (d1) return d1;
          const d2 = safeNum(b?.strength) - safeNum(a?.strength);
          if (d2) return d2;
          const an = `${String(a?.a || "")}+${String(a?.b || "")}`;
          const bn = `${String(b?.a || "")}+${String(b?.b || "")}`;
          return an.localeCompare(bn, "ko");
        });
      return listDrawer("메뉴 조합 전체", items, (it, idx) => (
        <>
          <span>
            <span className="rkpg-muted" style={{ marginRight: 8 }}>{idx + 1}.</span>
            <Pill tone={menuCatTone(it?.aCategory)}>{menuCatLabel(it?.aCategory)}</Pill>
            <b style={{ marginLeft: 8 }}>{String(it?.a ?? "")}</b>
            <span className="rkpg-muted" style={{ margin: "0 8px" }}>+</span>
            <Pill tone={menuCatTone(it?.bCategory)}>{menuCatLabel(it?.bCategory)}</Pill>
            <b style={{ marginLeft: 8 }}>{String(it?.b ?? "")}</b>
          </span>
          <span className="rkpg-muted">강도 {safeNum(it?.strength).toLocaleString()} · 카페 {safeNum(it?.cafeCount).toLocaleString()}</span>
        </>
      ));
    }

    if (type === "creatorPurpose") {
      const items = safeArr(creatorData?.purpose);
      return listDrawer("목적(컨셉) 전체", items, (it, idx) => (
        <>
          <span>
            <span className="rkpg-muted" style={{ marginRight: 8 }}>{idx + 1}.</span>
            <Pill tone="info">목적</Pill>
            <b style={{ marginLeft: 8 }}>{String(it?.keyword ?? "")}</b>
          </span>
          <span className="rkpg-muted">언급 {safeNum(it?.mentionCount).toLocaleString()} · 카페 {safeNum(it?.cafeCount).toLocaleString()}</span>
        </>
      ));
    }

    if (type === "creatorAtmosphere") {
      const items = safeArr(creatorData?.atmosphere);
      return listDrawer("분위기 전체", items, (it, idx) => (
        <>
          <span>
            <span className="rkpg-muted" style={{ marginRight: 8 }}>{idx + 1}.</span>
            <Pill tone="good">분위기</Pill>
            <b style={{ marginLeft: 8 }}>{String(it?.keyword ?? "")}</b>
          </span>
          <span className="rkpg-muted">언급 {safeNum(it?.mentionCount).toLocaleString()} · 카페 {safeNum(it?.cafeCount).toLocaleString()}</span>
        </>
      ));
    }

    if (type === "creatorTaste") {
      const items = safeArr(creatorData?.taste);
      return listDrawer("맛 키워드 전체", items, (it, idx) => (
        <>
          <span>
            <span className="rkpg-muted" style={{ marginRight: 8 }}>{idx + 1}.</span>
            <Pill tone="muted">맛</Pill>
            <b style={{ marginLeft: 8 }}>{String(it?.keyword ?? "")}</b>
          </span>
          <span className="rkpg-muted">언급 {safeNum(it?.mentionCount).toLocaleString()} · 카페 {safeNum(it?.cafeCount).toLocaleString()}</span>
        </>
      ));
    }

    // default
    return (
      <div className="rkpg-insight">
        <div className="rkpg-insight-box">
          <b>상세</b>
          <div className="rkpg-insight-ul">선택한 항목에 대한 상세 내용을 표시합니다.</div>
        </div>
      </div>
    );
  }, [drawerCtx, allMenus, dictMenus, missingMenus, menuCounts, menuCatMap, dessertTrend, hotAreas, creatorData, openInsight, menuAllFilter, menuAllSort, menuMentionsMap]);

  // Creator: cards data
  const creatorCards = useMemo(() => {
    const menus = safeArr(creatorData?.menus).slice(0, 10);
    const pairs = safeArr(creatorData?.pairs)
      .filter((p) => safeNum(p?.cafeCount) >= 3)
      .sort((a, b) => {
        const d1 = safeNum(b?.cafeCount) - safeNum(a?.cafeCount);
        if (d1) return d1;
        const d2 = safeNum(b?.strength) - safeNum(a?.strength);
        if (d2) return d2;
        const an = `${String(a?.a || "")}+${String(a?.b || "")}`;
        const bn = `${String(b?.a || "")}+${String(b?.b || "")}`;
        return an.localeCompare(bn, "ko");
      })
      .slice(0, 10);
    const purpose = safeArr(creatorData?.purpose).slice(0, 10);
    const atmosphere = safeArr(creatorData?.atmosphere).slice(0, 10);
    const taste = safeArr(creatorData?.taste).slice(0, 10);

    return [
      {
        id: "menus",
        title: "메뉴 트렌드 TOP",
        pill: <Pill tone="info">메뉴</Pill>,
        hint: "언급량 + 등장 카페수 기반",
        items: menus,
        onAll: () => openInsight("메뉴 트렌드 전체", { type: "creatorMenus" }),
        renderItem: (it, idx) => (
          <li key={`${it.keyword}-${idx}`} className="rank-item">
            <div className="rank-num">{idx + 1}</div>
            <div className="rank-main">
              <div className="rank-name">
                <Pill tone={menuCatTone(it.category)}>{menuCatLabel(it.category)}</Pill> {it.keyword}
              </div>
              <div className="rank-meta">언급 {safeNum(it.mentionCount).toLocaleString()} · 카페 {safeNum(it.cafeCount).toLocaleString()}</div>
            </div>
          </li>
        ),
      },
      {
        id: "pairs",
        title: "메뉴 조합 TOP",
        pill: <Pill tone="info">조합</Pill>,
        hint: "카페 3곳 이상에서 같이 등장",
        items: pairs,
        onAll: () => openInsight("메뉴 조합 전체", { type: "creatorPairs" }),
        renderItem: (it, idx) => (
          <li key={`${it.a}-${it.b}-${idx}`} className="rank-item">
            <div className="rank-num">{idx + 1}</div>
            <div className="rank-main">
              <div className="rank-name">
                <Pill tone={menuCatTone(it.aCategory)}>{menuCatLabel(it.aCategory)}</Pill> {it.a}
                <span className="rkpg-muted" style={{ margin: "0 8px" }}>+</span>
                <Pill tone={menuCatTone(it.bCategory)}>{menuCatLabel(it.bCategory)}</Pill> {it.b}
              </div>
              <div className="rank-meta">강도 {safeNum(it.strength).toLocaleString()} · 카페 {safeNum(it.cafeCount).toLocaleString()}</div>
            </div>
          </li>
        ),
      },
      {
        id: "purpose",
        title: "목적(컨셉) TOP",
        pill: <Pill tone="info">목적</Pill>,
        hint: "타겟/방문 목적 힌트",
        items: purpose,
        onAll: () => openInsight("목적(컨셉) 전체", { type: "creatorPurpose" }),
        renderItem: (it, idx) => (
          <li key={`${it.keyword}-${idx}`} className="rank-item">
            <div className="rank-num">{idx + 1}</div>
            <div className="rank-main">
              <div className="rank-name">{it.keyword}</div>
              <div className="rank-meta">언급 {safeNum(it.mentionCount).toLocaleString()} · 카페 {safeNum(it.cafeCount).toLocaleString()}</div>
            </div>
          </li>
        ),
      },
      {
        id: "atmosphere",
        title: "분위기 TOP",
        pill: <Pill tone="good">분위기</Pill>,
        hint: "공간 설계 방향",
        items: atmosphere,
        onAll: () => openInsight("분위기 전체", { type: "creatorAtmosphere" }),
        renderItem: (it, idx) => (
          <li key={`${it.keyword}-${idx}`} className="rank-item">
            <div className="rank-num">{idx + 1}</div>
            <div className="rank-main">
              <div className="rank-name">{it.keyword}</div>
              <div className="rank-meta">언급 {safeNum(it.mentionCount).toLocaleString()} · 카페 {safeNum(it.cafeCount).toLocaleString()}</div>
            </div>
          </li>
        ),
      },
      {
        id: "taste",
        title: "맛 키워드 TOP",
        pill: <Pill tone="muted">맛</Pill>,
        hint: "맛 포지셔닝",
        items: taste,
        onAll: () => openInsight("맛 키워드 전체", { type: "creatorTaste" }),
        renderItem: (it, idx) => (
          <li key={`${it.keyword}-${idx}`} className="rank-item">
            <div className="rank-num">{idx + 1}</div>
            <div className="rank-main">
              <div className="rank-name">{it.keyword}</div>
              <div className="rank-meta">언급 {safeNum(it.mentionCount).toLocaleString()} · 카페 {safeNum(it.cafeCount).toLocaleString()}</div>
            </div>
          </li>
        ),
      },
    ];
  }, [creatorData, openInsight]);

  return (
    <div className="rkpg-page">
      <Header />

      <main className="page-main">
        <div className="rkpg-head">
          <div>
            <div className="rkpg-title">디저트 카페 트렌딩 랭킹</div>
            <div className="rkpg-sub">
              데이터 기반으로 디저트·거리·키워드를 탐색해보세요.
              {serverUpdatedAt ? <span style={{ marginLeft: 10, opacity: 0.85 }}>데이터 기준일: {serverUpdatedAt}</span> : null}
              {bootLoading ? <span style={{ marginLeft: 10, opacity: 0.85 }}>불러오는 중…</span> : null}
              {!bootLoading ? (
                bootError ? (
                  <span style={{ marginLeft: 10, opacity: 0.85 }}>API 연결 실패: {bootError}</span>
                ) : (
                  <span style={{ marginLeft: 10, opacity: 0.85 }}>{apiCafes?.length ? "API 연결됨" : "-"}</span>
                )
              ) : null}
            </div>
          </div>

          <div className="rkpg-filters">
            <div className="rkpg-seg" style={{ marginRight: 6 }}>
              <button className={mode === "consumer" ? "is-active" : ""} onClick={() => setMode("consumer")}>
                소비자
              </button>
              <button className={mode === "creator" ? "is-active" : ""} onClick={() => setMode("creator")}>
                창업자
              </button>
            </div>
          </div>
        </div>

        {/* ---------------------------
            Consumer 영역
           --------------------------- */}
        {mode === "consumer" ? (
          <>
            <section className="rank-section">
              <div className="rank-section-title">인기 지표</div>
              <div className="rank-section-sub">메인 하단 인기 지표를 페이지로 확장한 화면입니다.</div>

              <div className="rank-grid" style={{ alignItems: "flex-start" }}>
                {/* 인기 메뉴 TOP */}
                <div className="rank-block" style={{ alignSelf: "flex-start" }}>
                  <div className="rank-block-header">
                    <div>
                      <div className="rank-block-title">인기 메뉴 TOP</div>
                      <div className="rkpg-smallhint">{menuViewHint}</div>
                      <div className="rkpg-smallhint">기준: 키워드가 등장한 카페 수(카페 내 중복 제거) · 동점 시 가나다 정렬</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div className="rkpg-seg" style={{ marginRight: 6 }}>
                        <button className={menuView === "all" ? "is-active" : ""} onClick={() => onChangeMenuView("all")}>
                          전체
                        </button>
                        <button className={menuView === "drink" ? "is-active" : ""} onClick={() => onChangeMenuView("drink")}>
                          음료
                        </button>
                        <button className={menuView === "dessert_meal" ? "is-active" : ""} onClick={() => onChangeMenuView("dessert_meal")}>
                          디저트+식사
                        </button>
                      </div>
<span className="rank-tag" style={TAG_STYLE}>언급</span>
                    </div>
                  </div>

                  <ul className="rank-list">
                    {menuVisible.length === 0 ? (
                      <li className="rank-item">
                        <div className="rank-main">
                          <div className="rank-meta">표시할 메뉴가 없습니다.</div>
                        </div>
                      </li>
                    ) : null}

                    {menuVisible.map((it, idx) => (
                      <li
                        key={it.name}
                        className="rank-item rkpg-click"
                        onClick={() => openInsight(`[${menuCatLabel(it.category)}] ${it.name} 인사이트`, { type: "menu", key: it.name })}
                      >
                        <div className="rank-num">{idx + 1}</div>
                        <div className="rank-main">
                          <div className="rank-name">
                            <Pill tone={menuCatTone(it.category)}>{menuCatLabel(it.category)}</Pill> {it.name}
                          </div>
                          <div className="rank-meta">언급 카페 {safeNum(it.mentions).toLocaleString()}곳</div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {menuRankAll.length > 10 ? (() => {
                    const inlineMax = Math.min(menuRankAll.length, 20);
                    return (
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8 }}>
                        {menuShowCount < inlineMax ? (
                          <button
                            className="rkpg-btn"
                            style={{ padding: "8px 12px", fontSize: 12 }}
                            onClick={() => setMenuShowCount((p) => Math.min((Number(p) || 0) + 10, inlineMax))}
                          >
                            더보기
                          </button>
                        ) : null}

                        {menuShowCount > 10 ? (
                          <button className="rkpg-btn" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => setMenuShowCount(10)}>
                            접기
                          </button>
                        ) : null}

                        {menuRankAll.length > inlineMax ? (
                          <button
                            className="rkpg-btn"
                            style={{ padding: "8px 12px", fontSize: 12 }}
                            onClick={() => openInsight("전체 메뉴 보기", { type: "menuAll" })}
                          >
                            전체 보기
                          </button>
                        ) : null}
                      </div>
                    );
                  })() : null}
                </div>

                {/* 핫한 거리 TOP */}
                <div className="rank-block" style={{ alignSelf: "flex-start" }}>
                  <div className="rank-block-header">
                    <div>
                      <div className="rank-block-title">핫한 거리 TOP</div>
                      <div className="rkpg-smallhint">기준: 크롤링 리뷰(카페당 최대 10개) 포착치 기반 · 집계대상: 카페 3곳 이상(부족시 완화)</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button className="rkpg-btn" style={ACTION_BTN_STYLE} onClick={() => openInsight("핫한 거리 산정 방식", { type: "areaMethod" })}>
                        산정 방식
                      </button>
                      <span className="rank-tag rank-tag-secondary" style={TAG_STYLE}>핫플</span>
                    </div>
                  </div>

                  <ul className="rank-list">
                    {hotVisible.map((it, idx) => (
                      <li
                        key={it.name}
                        className="rank-item rkpg-click"
                        onClick={() => openInsight(`${abbreviateAreaName(it.name)} 인사이트`, { type: "area", key: it.name })}
                      >
                        <div className="rank-num">{idx + 1}</div>
                        <div className="rank-main">
                          <div className="rank-name">{abbreviateAreaName(it.name)}</div>
                          <div className="rank-meta">{it.meta}</div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {Array.isArray(hotAreas) && hotAreas.length > 10 ? (() => {
                    const inlineMax = Math.min(hotAreas.length, 20);
                    return (
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8 }}>
                        {hotShowCount < inlineMax ? (
                          <button
                            className="rkpg-btn"
                            style={{ padding: "8px 12px", fontSize: 12 }}
                            onClick={() => setHotShowCount((p) => Math.min((Number(p) || 0) + 10, inlineMax))}
                          >
                            더보기
                          </button>
                        ) : null}

                        {hotShowCount > 10 ? (
                          <button className="rkpg-btn" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => setHotShowCount(10)}>
                            접기
                          </button>
                        ) : null}

                        {hotAreas.length > inlineMax ? (
                          <button
                            className="rkpg-btn"
                            style={{ padding: "8px 12px", fontSize: 12 }}
                            onClick={() => openInsight("핫한 거리 전체", { type: "areaAll" })}
                          >
                            전체 보기
                          </button>
                        ) : null}
                      </div>
                    );
                  })() : null}
                </div>
              </div>
            </section>
          </>
	        ) : (
          <>
            {/* ---------------------------
	              Creator 영역
	             --------------------------- */}
          <section className="rkpg-creator">
            <div className="rkpg-creator-head">
              <div>
                <div className="rkpg-creator-title">창업자 인사이트</div>
              </div>
              <div className="rkpg-creator-right">
                <button className="rkpg-btn" style={ACTION_BTN_STYLE} onClick={() => openInsight("창업자 인사이트 산정 방식", { type: "creatorAbout" })}>
                  산정 방식
                </button>
              </div>
            </div>

            {creatorLoading ? (
              <div className="rkpg-card" style={{ marginTop: 12 }}>
                <div className="rkpg-smallhint">불러오는 중…</div>
              </div>
            ) : creatorError ? (
              <div className="rkpg-card" style={{ marginTop: 12 }}>
                <div className="rkpg-smallhint">API 연결 실패: {creatorError}</div>
              </div>
            ) : null}

            <div className="rkpg-creator-grid" style={{ marginTop: 12 }}>
              {creatorCards.map((card) => (
                <div key={card.id} className="rkpg-card">
                  <div className="rkpg-card-head">
                    <div>
                      <div className="rkpg-card-title">{card.title}</div>
                      <div className="rkpg-card-sub">{card.hint}</div>
                    </div>
                    <div className="rkpg-card-right">
                      {card.pill}
                    </div>
                  </div>

                  <div className="rkpg-card-body">
                    <ul className="rank-list" style={{ marginTop: 0 }}>
                      {card.items.length ? card.items.map(card.renderItem) : (
                        <li className="rank-item">
                          <div className="rank-main">
                            <div className="rank-meta">표시할 데이터가 없습니다.</div>
                          </div>
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="rkpg-card-foot">
                    <button className="rkpg-btn primary" onClick={card.onAll}>
                      전체 보기 →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          </>
        )}

        <Drawer open={drawerOpen} title={drawerTitle} onClose={() => setDrawerOpen(false)} bodyRef={drawerBodyRef}>
          {renderDrawerBody()}
        </Drawer>
      </main>
    </div>
  );
}