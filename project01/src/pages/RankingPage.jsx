import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header"; // ← (폴더 위치에 따라 경로만 조정)
import "../styles/RankingPage.css"; // ✅ 랭킹 페이지 전용 CSS (파일 위치에 맞게 경로 조정)

/**
 * RankingPage (Consumer + Creator)
 * - Consumer: 트렌딩 디저트 / 핫한 동네 / 카페 추천 리스트
 * - Creator: 창업자 인사이트 (메뉴 트렌드 / 상권 기회 / 고객 니즈 / 포지셔닝)
 *
 * NOTE
 * - 백엔드 연결 전에는 Mock 데이터로 동작합니다.
 * - 백엔드가 준비되면 /api/cafes 로 fetch 하도록 되어 있습니다. (region/sort는 프론트에서 처리)
 */

function buildMenuTrendFromCafes(items = [], catMap, limit = null) {
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

  const arr = [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, mentions]) => ({
      name,
      category: getCat(name),
      delta: 0,
      mentions,
      prevMentions: mentions,
    }));

  if (typeof limit === "number" && Number.isFinite(limit)) return arr.slice(0, Math.max(0, limit));
  return arr;
}

const MENU_CAT_LABEL = { dessert: "디저트", drink: "음료", meal: "식사" };
const MENU_CAT_TONE = { dessert: "good", drink: "info", meal: "muted" };

function menuCatLabel(cat) {
  return MENU_CAT_LABEL[cat] || "기타";
}

function menuCatTone(cat) {
  return MENU_CAT_TONE[cat] || "muted";
}

function buildHotAreasFromCafes(items = [], catMap) {
  const safe = Array.isArray(items) ? items : [];
  const areaMap = new Map();     // area -> { demand, supply }
  const dessertMap = new Map();  // area -> Map(menu -> cafes)

  const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

  const getCat = (name) => {
    try {
      return catMap && typeof catMap.get === "function" ? (catMap.get(name) || "") : "";
    } catch {
      return "";
    }
  };

  for (const c of safe) {
    const area = c._regionText || c.neighborhood || c.region || "기타";
    const cur = areaMap.get(area) || { demand: 0, supply: 0 };
    cur.supply += 1;
    cur.demand += Number(c.reviewCount ?? 0);
    areaMap.set(area, cur);

    if (Array.isArray(c.desserts)) {
      const uniq = [...new Set(c.desserts.filter(Boolean))];
      if (!dessertMap.has(area)) dessertMap.set(area, new Map());
      const dm = dessertMap.get(area);
      for (const d of uniq) inc(dm, d, 1);
    }
  }

  const arr = [...areaMap.entries()].map(([name, v]) => {
    const ratio = v.supply ? v.demand / v.supply : 0;
    const dm = dessertMap.get(name);
    let meta = "메뉴";
    if (dm && dm.size) {
      const top = [...dm.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const cat = getCat(top[0]);
        meta = `${menuCatLabel(cat)} · ${top[0]} 인기`;
      }
    }
    return { name, meta, demand: v.demand, supply: v.supply, ratio };
  });

  if (!arr.length) return [];

  const ratios = arr.map((x) => x.ratio);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const norm = (r) => (max === min ? 50 : Math.round(((r - min) / (max - min)) * 100));

  return arr
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 10)
    .map((a) => ({
      name: a.name,
      meta: a.meta,
      demand: a.demand,
      supply: a.supply,
      opportunity: norm(a.ratio),
    }));
}

// ---------------------------
// Mock (백엔드 붙기 전 동작용)
// ---------------------------
const DESSERT_TREND = [
  { name: "크로플", delta: 12, mentions: 340, prevMentions: 304 },
  { name: "소금빵", delta: 9, mentions: 280, prevMentions: 257 },
  { name: "말차", delta: 7, mentions: 210, prevMentions: 196 },
  { name: "딸기 케이크", delta: 6, mentions: 180, prevMentions: 170 },
  { name: "휘낭시에", delta: 5, mentions: 150, prevMentions: 143 },
];

const HOT_AREAS = [
  { name: "동명동", meta: "감성/신상 카페", demand: 820, supply: 140, opportunity: 72 },
  { name: "상무지구", meta: "작업/모임", demand: 760, supply: 160, opportunity: 61 },
  { name: "첨단", meta: "대형 베이커리", demand: 690, supply: 150, opportunity: 58 },
  { name: "양림동", meta: "산책/분위기", demand: 610, supply: 105, opportunity: 66 },
  { name: "담양", meta: "드라이브/뷰", demand: 720, supply: 120, opportunity: 74 },
];


const CREATOR_MOCK = {
  // 언급량 급증 메뉴
  menuTrends: [
    { name: "소금빵", delta: 9, mentions: 280 },
    { name: "말차", delta: 7, mentions: 210 },
    { name: "크로플", delta: 12, mentions: 340 },
  ],
  // 수요(언급/리뷰) 대비 공급(경쟁) 갭이 큰 지역
  opportunityAreas: [
    { name: "담양", opportunity: 74, demand: 720, supply: 120 },
    { name: "동명동", opportunity: 72, demand: 820, supply: 140 },
    { name: "양림동", opportunity: 66, demand: 610, supply: 105 },
  ],
  // 고객이 좋아하는(니즈) 요소
  needsTop: [
    { name: "주차", mentions: 420 },
    { name: "조용", mentions: 380 },
    { name: "좌석", mentions: 350 },
    { name: "넓다", mentions: 310 },
  ],
};

// ---------------------------
// UI Components
// ---------------------------
function Drawer({ open, title, onClose, children }) {
  return (
    <div className={`rkpg-overlay ${open ? "is-open" : ""}`} onMouseDown={onClose}>
      <aside className="rkpg-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rkpg-drawer-header">
          <div className="rkpg-drawer-title">{title}</div>
          <button className="rkpg-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="rkpg-drawer-body">{children}</div>
      </aside>
    </div>
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

function buildCreatorInsights(items = []) {
  const safe = Array.isArray(items) ? items : [];

  const inc = (map, key, by = 1) => {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + by);
  };

  const dessertCount = new Map();   // 디저트 키워드 빈도
  const whyCount = new Map();       // 니즈(why) 키워드 빈도
  const areaMap = new Map();        // 상권(동네)별 수요/공급
  const areaDessertMap = new Map(); // 상권(동네)별 디저트 포함 카페 수(포지셔닝)

  for (const c of safe) {
    const neighborhood = c._regionText || c.neighborhood || c.region || "기타";

    // 상권별 수요/공급
    const supply = 1;
    const demand = Number(c.reviewCount ?? 0);
    const prev = areaMap.get(neighborhood) ?? { supply: 0, demand: 0 };
    areaMap.set(neighborhood, {
      supply: prev.supply + supply,
      demand: prev.demand + demand,
    });

    // 메뉴 트렌드(디저트) + 상권별 대표 디저트(포지셔닝)
    if (Array.isArray(c.desserts)) {
      const uniqDesserts = [...new Set(c.desserts)];
      for (const d of uniqDesserts) {
        inc(dessertCount, d);

        let dm = areaDessertMap.get(neighborhood);
        if (!dm) {
          dm = new Map();
          areaDessertMap.set(neighborhood, dm);
        }
        inc(dm, d);
      }
    }

    // 니즈(why)
    if (Array.isArray(c.why)) {
      const uniqWhy = [...new Set(c.why)];
      for (const w of uniqWhy) inc(whyCount, w);
    }
  }

  // 메뉴 트렌드 TOP
  const menuTrends = [...dessertCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, mentions]) => ({ name, mentions }));

  // 고객 니즈 TOP
  const needsTop = [...whyCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, mentions]) => ({ name, mentions }));

  // 상권 기회지수 TOP (수요/공급 비율을 0~100으로 정규화)
  const areaArr = [...areaMap.entries()].map(([name, v]) => {
    const ratio = v.supply > 0 ? v.demand / v.supply : 0;
    return { name, demand: v.demand, supply: v.supply, ratio };
  });

  let opportunityAreas = [];
  if (areaArr.length > 0) {
    const ratios = areaArr.map((x) => x.ratio);
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    const norm = (r) => {
      if (max === min) return 50;
      return Math.round(((r - min) / (max - min)) * 100);
    };

    opportunityAreas = areaArr
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10)
      .map((a) => ({
        name: a.name,
        demand: a.demand,
        supply: a.supply,
        opportunity: norm(a.ratio),
      }));
  }

  
// 상권별 특화 메뉴 TOP (포지셔닝)
// - 케이크 같은 '전지역 공통 1등'은 변별력이 낮아서 제외
// - 전체 대비 해당 상권에서 얼마나 더 자주 포함되는지(lift)로 뽑습니다.
const stopDesserts = new Set(["케이크"]);
const totalCafes = safe.length || 1;

const globalShare = new Map();
for (const [d, cnt] of dessertCount.entries()) {
  globalShare.set(d, cnt / totalCafes);
}

const dessertHotspots = [...areaDessertMap.entries()]
  .map(([area, dm]) => {
    const total = areaMap.get(area)?.supply ?? 0;
    if (total <= 0) return null;

    let best = null;

    for (const [dessert, cafes] of dm.entries()) {
      if (stopDesserts.has(dessert)) continue;
      if (cafes < 5) continue; // 표본 최소치
      const pArea = cafes / total;
      const pAll = globalShare.get(dessert) ?? 0;
      if (!pAll) continue;

      const lift = pArea / pAll;

      const cand = { area, dessert, cafes, total, share: Math.round(pArea * 100), lift: Math.round(lift * 10) / 10 };
      if (!best) best = cand;
      else if (cand.lift > best.lift) best = cand;
      else if (cand.lift === best.lift && cand.cafes > best.cafes) best = cand;
    }

    return best;
  })
  .filter(Boolean)
  .sort((a, b) => b.lift - a.lift || b.share - a.share || b.cafes - a.cafes)
  .slice(0, 10);

return { menuTrends, opportunityAreas, needsTop, dessertHotspots };
}


// ---------------------------
// Main Page
// ---------------------------
export default function RankingPage() {
  const navigate = useNavigate();

  // consumer | creator
  const [mode, setMode] = useState("consumer");
  // 메뉴 TOP 필터 (all | drink | dessert_meal | dessert | meal)
  const [menuView, setMenuView] = useState("all");
  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerCtx, setDrawerCtx] = useState({ type: "", key: "" });

  // 서버 데이터(있으면 우선), 없으면 Mock 유지
  const [serverUpdatedAt, setServerUpdatedAt] = useState("");
  const [dessertTrend, setDessertTrend] = useState(DESSERT_TREND);
  const menuViewCats = useMemo(() => {
    if (menuView === "drink") return ["drink"];
    if (menuView === "dessert") return ["dessert"];
    if (menuView === "meal") return ["meal"];
    if (menuView === "dessert_meal") return ["dessert", "meal"];
    return ["dessert", "drink", "meal"];
  }, [menuView]);

  const menuViewHint = useMemo(() => {
    if (menuView === "drink") return "음료 기준";
    if (menuView === "dessert") return "디저트 기준";
    if (menuView === "meal") return "식사 기준";
    if (menuView === "dessert_meal") return "디저트+식사 기준";
    return "디저트·음료·식사 통합 기준";
  }, [menuView]);

  const menuTop10 = useMemo(() => {
    const src = Array.isArray(dessertTrend) ? dessertTrend : [];
    const cats = new Set(menuViewCats);
    return src.filter((it) => cats.has((it?.category || "dessert"))).slice(0, 10);
  }, [dessertTrend, menuViewCats]);

  const [hotAreas, setHotAreas] = useState(HOT_AREAS);
  const [creator, setCreator] = useState(CREATOR_MOCK);

  // ✅ 백엔드 연결 확인용 (/api/status, /api/cafes)
  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState("");
  const [apiStatus, setApiStatus] = useState(null);
  const [apiCafes, setApiCafes] = useState([]);
  const [kwDict, setKwDict] = useState([]);
  const [menuSearch, setMenuSearch] = useState("");

  const openInsight = useCallback((title, ctx) => {
    if (ctx?.type === "menuAll") setMenuSearch("");
    setDrawerTitle(title);
    setDrawerCtx(ctx);
    setDrawerOpen(true);
  }, []);

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

  // ✅ 단일 진실 소스: /api/cafes 한 번만 불러오고 region/sort는 프론트에서 처리
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

        // ✅ keyword_dict(메뉴 사전)도 같이 불러와서 카테고리 라벨에 사용
        let kwItems = [];
        try {
          const kRes = await fetch("/api/keywords?limit=2000");
          if (kRes.ok) {
            const kJson = await kRes.json();
            kwItems = Array.isArray(kJson) ? kJson : Array.isArray(kJson?.items) ? kJson.items : [];
            setKwDict(kwItems);
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

        // 소비자/창업자 인사이트를 DB(/api/cafes) 기반으로 갱신
        setCreator(buildCreatorInsights(list));
        setDessertTrend(buildMenuTrendFromCafes(list, catMap));
        setHotAreas(buildHotAreasFromCafes(list, catMap));

        // /api/status는 있으면 표시, 없어도 동작하게(옵션)
        fetch("/api/status")
          .then((r) => (r.ok ? r.json() : null))
          .then((sJson) => {
            if (!alive) return;
            setApiStatus(sJson);
            if (sJson?.updatedAt) setServerUpdatedAt(sJson.updatedAt);
          })
          .catch(() => {
            /* ignore */
          });
      } catch (e) {
        // API가 없거나 실패하면 Mock 유지
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

  // Creator: 카드 내용 구성
  const creatorCards = useMemo(() => {
    const topMenu = (creator?.menuTrends ?? []).slice(0, 3);
    const topOpp = (creator?.opportunityAreas ?? []).slice(0, 3);
    const topNeeds = (creator?.needsTop ?? []).slice(0, 4);
    const topHotspots = (creator?.dessertHotspots ?? []).slice(0, 4);

    const safeHotspotRows = topHotspots.length
      ? topHotspots.map((h) => ({
          left: h.area,
          right: `${h.dessert} · ${h.share}% (${Number(h.cafes).toLocaleString()}곳) · ${h.lift}배`,
        }))
      : [{ left: "특화 메뉴 없음", right: "케이크 제외/표본(5곳) 기준" }];

    return [
      {
        id: "menu",
        title: "메뉴 트렌드",
        tone: "info",
        pill: "메뉴",
        desc: "언급량이 많은 메뉴 키워드 기준으로 메뉴/MD 우선순위를 정하세요.",
        rows: topMenu.map((m) => ({ left: m.name, right: `언급 카페 ${Number(m.mentions).toLocaleString()}곳` })),
        cta: "근거/액션",
        ctx: { type: "creator", key: "menu" },
      },
      {
        id: "opp",
        title: "상권 기회지수 TOP",
        tone: "info",
        pill: "입지",
        desc: "수요(언급/리뷰) 대비 공급(경쟁)이 낮은 지역은 ‘틈’이 생깁니다.",
        rows: topOpp.map((a) => ({ left: a.name, right: `기회 ${a.opportunity}` })),
        cta: "근거/액션",
        ctx: { type: "creator", key: "opportunity" },
      },
      {
        id: "needs",
        title: "고객 니즈 TOP",
        tone: "good",
        pill: "니즈",
        desc: "리뷰에서 자주 같이 언급되는 ‘만족 포인트’를 먼저 고정하세요.",
        rows: topNeeds.map((k) => ({ left: k.name, right: `카페 ${Number(k.mentions).toLocaleString()}곳` })),
        cta: "체크리스트",
        ctx: { type: "creator", key: "needs" },
      },
      {
        id: "hotspot",
        title: "상권별 특화 메뉴 TOP",
        tone: "info",
        pill: "메뉴×입지",
        desc: "케이크(공통 1등)를 제외하고, 전체 대비 상권에서 더 자주 나오는 ‘특화 메뉴’를 뽑았습니다.",
        rows: safeHotspotRows,
        cta: "근거/액션",
        ctx: { type: "creator", key: "hotspot" },
      },
    ];
  }, [creator]);

  // Creator: KPI 타일
  const creatorKpis = useMemo(() => {
    const topOpp = (creator?.opportunityAreas ?? [])[0];
    const topMenu = (creator?.menuTrends ?? [])[0];
    const topNeed = (creator?.needsTop ?? [])[0];
    const topHotspot = (creator?.dessertHotspots ?? [])[0];

    return [
      {
        tone: "info",
        label: "인기 메뉴 1순위",
        value: topMenu ? `${topMenu.name} (언급 카페 ${Number(topMenu.mentions).toLocaleString()}곳)` : "-",
        hint: "메뉴/콘텐츠 우선순위",
        onClick: () => openInsight("메뉴 트렌드 근거/액션", { type: "creator", key: "menu" }),
      },
      {
        tone: "info",
        label: "기회 상권 1순위",
        value: topOpp ? `${topOpp.name} (${topOpp.opportunity})` : "-",
        hint: "수요-공급 갭",
        onClick: () => openInsight("상권 기회지수 근거/액션", { type: "creator", key: "opportunity" }),
      },
      {
        tone: "good",
        label: "최상위 니즈",
        value: topNeed ? `${topNeed.name} (${topNeed.mentions})` : "-",
        hint: "고정 안내/공간 설계",
        onClick: () => openInsight("고객 니즈 체크리스트", { type: "creator", key: "needs" }),
      },
      {
        tone: "info",
        label: "상권 대표 디저트",
        value: topHotspot
          ? `${topHotspot.area}: ${topHotspot.dessert} (${topHotspot.share}% · ${topHotspot.lift}배)`
          : "-",
        hint: "포지셔닝 힌트",
        onClick: () => openInsight("상권별 특화 메뉴 근거/액션", { type: "creator", key: "hotspot" }),
      },
    ];
  }, [creator, openInsight]);

  const renderDrawerBody = useCallback(() => {
    const { type, key } = drawerCtx || {};

    // ✅ Consumer/관리: 전체 메뉴(디저트·음료·식사) 보기
    if (type === "menuAll") {
      const q = (menuSearch || "").trim().toLowerCase();
      const filtered = allMenus.filter((name) => {
        const n = String(name || "");
        if (!q) return true;
        const cat = menuCatMap.get(n) || "";
        const label = menuCatLabel(cat);
        return n.toLowerCase().includes(q) || label.toLowerCase().includes(q);
      });

      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>전체 메뉴 키워드</b>
                <div className="rkpg-smallhint">
                  현재 데이터 {allMenus.length}개 · 사전 {dictMenus.length}개
                </div>
              </div>
              <Pill tone="muted">전체</Pill>
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="검색 (예: 음료 / 케이크 / 브런치)"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.15)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <Pill tone="good">디저트 {menuCounts.dessert}</Pill>
              <Pill tone="info">음료 {menuCounts.drink}</Pill>
              <Pill tone="muted">식사 {menuCounts.meal}</Pill>
              {menuCounts.other ? <Pill tone="muted">기타 {menuCounts.other}</Pill> : null}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {filtered.map((name) => {
                const cat = menuCatMap.get(name) || "";
                return (
                  <div
                    key={name}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      border: "1px solid rgba(0,0,0,0.10)",
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <Pill tone={menuCatTone(cat)}>{menuCatLabel(cat)}</Pill>
                    <b>{name}</b>
                  </div>
                );
              })}
            </div>

            {missingMenus.length ? (
              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: "pointer" }}>
                  사전에는 있으나 데이터에 아직 등장하지 않은 메뉴 {missingMenus.length}개
                </summary>
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

    // Consumer: dessert
    if (type === "dessert") {
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
              <Pill tone="info">트렌딩</Pill>
            </div>
            <Progress label="언급 카페 수" value={mentions} max={max} />
            <div className="rkpg-smallhint">※ 이번 프로젝트는 기간 데이터가 없어 증감률을 계산하지 않습니다.</div>
          </div>

        </div>
      );
    }

    // Consumer: area
    if (type === "area") {
      const item = hotAreas.find((a) => a.name === key);
      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>상권 요약</b>
                <div className="rkpg-smallhint">기준(예시)</div>
              </div>
              <Pill tone="info">핫플</Pill>
            </div>

            <div className="rkpg-insight-ul">
              • 성격: <b>{item?.meta ?? "-"}</b><br/>
              • 수요(언급/리뷰): <b>{item?.demand ?? "-"}</b><br/>
              • 공급(경쟁): <b>{item?.supply ?? "-"}</b><br/>
              • 기회지수: <b>{item?.opportunity ?? "-"}</b>
            </div>
          </div>

        </div>
      );
    }

    // Creator: 상세 패널
    if (type === "creator") {
      if (key === "menu") {
        const items = (creator?.menuTrends ?? []).slice(0, 10);
        const max = Math.max(1, ...items.map((x) => Number(x.mentions ?? 0)));
        return (
          <div className="rkpg-insight">
            <div className="rkpg-insight-box">
              <div className="rkpg-row-between">
                <div>
                  <b>메뉴 트렌드</b>
                  <div className="rkpg-smallhint">언급 카페 수 기준</div>
                </div>
                <Pill tone="info">메뉴</Pill>
              </div>

              <div style={{ marginTop: 10 }}>
                {items.length ? (
                  items.map((m) => (
                    <div key={m.name} style={{ marginBottom: 12 }}>
                      <div className="rkpg-row-between">
                        <span>{m.name}</span>
                        <b>{Number(m.mentions).toLocaleString()}곳</b>
                      </div>
                      <Progress label="언급 카페 수" value={Number(m.mentions)} max={max} />
                    </div>
                  ))
                ) : (
                  <div className="rkpg-smallhint">표시할 데이터가 없습니다.</div>
                )}
              </div>
            </div>

          </div>
        );
      }

      if (key === "opportunity") {
        const items = (creator?.opportunityAreas ?? []).slice(0, 10);
        return (
          <div className="rkpg-insight">
            <div className="rkpg-insight-box">
              <div className="rkpg-row-between">
                <div>
                  <b>상권 기회지수 TOP</b>
                  <div className="rkpg-smallhint">수요/공급 비율 기반 정규화</div>
                </div>
                <Pill tone="info">입지</Pill>
              </div>

              <div style={{ marginTop: 10 }}>
                {items.length ? (
                  items.map((a) => (
                    <div key={a.name} style={{ marginBottom: 12 }}>
                      <div className="rkpg-row-between">
                        <span>{a.name}</span>
                        <b>{a.opportunity}</b>
                      </div>
                      <div className="rkpg-opprow-grid">
                        <div className="rkpg-insight-ul">• 수요 <b>{a.demand}</b></div>
                        <div className="rkpg-insight-ul">• 공급 <b>{a.supply}</b></div>
                      </div>
                      <Progress label="기회지수" value={Number(a.opportunity)} max={100} />
                      {a.meta ? <div className="rkpg-smallhint">{a.meta}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="rkpg-smallhint">표시할 데이터가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (key === "needs") {
        const items = (creator?.needsTop ?? []).slice(0, 20);
        return (
          <div className="rkpg-insight">
            <div className="rkpg-insight-box">
              <div className="rkpg-row-between rkpg-rowgap">
                <div>
                  <b>고객 니즈 TOP</b>
                  <div className="rkpg-smallhint">리뷰에서 “좋다/편하다”로 자주 묶이는 요소</div>
                </div>
                <Pill tone="good">니즈</Pill>
              </div>

              <ul className="rkpg-plainlist" style={{ marginTop: 10 }}>
                {items.length ? items.map((k) => (
                  <li key={k.name} className="rkpg-row-between">
                    <span>{k.name}</span>
                    <b>{Number(k.mentions).toLocaleString()}</b>
                  </li>
                )) : <li className="rkpg-muted">표시할 데이터가 없습니다.</li>}
              </ul>
            </div>
          </div>
        );
      }

      if (key === "hotspot") {
        const items = (creator?.dessertHotspots ?? []).slice(0, 10);
        return (
          <div className="rkpg-insight">
            <div className="rkpg-insight-box">
              <div className="rkpg-row-between rkpg-rowgap">
                <div>
                  <b>상권별 특화 메뉴 TOP</b>
                  <div className="rkpg-smallhint">전체 대비 상권에서 더 자주 나오는 디저트</div>
                </div>
                <Pill tone="info">메뉴×입지</Pill>
              </div>

              {items.length ? (
                <div style={{ marginTop: 10 }}>
                  {items.map((h) => (
                    <div key={`${h.area}-${h.dessert}`} style={{ marginBottom: 12 }}>
                      <div className="rkpg-row-between">
                        <span>{h.area}</span>
                        <b>{h.dessert} · {h.share}% · {h.lift}배</b>
                      </div>
                      <Progress label="집중도" value={Number(h.share)} max={100} />
                      <div className="rkpg-smallhint">
                        {Number(h.cafes).toLocaleString()} / {Number(h.total).toLocaleString()}곳
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rkpg-smallhint" style={{ marginTop: 10 }}>
                  표시할 특화 메뉴가 없습니다. (케이크 제외/표본 5곳 기준)
                </div>
              )}
            </div>
          </div>
        );
      }
    }

    // default
    return (
      <div className="rkpg-insight">
        <div className="rkpg-insight-box">
          <b>상세 근거/액션</b>
          <div className="rkpg-insight-ul">선택한 항목에 대한 근거/액션을 표시합니다.</div>
        </div>
      </div>
    );
  }, [drawerCtx, dessertTrend, hotAreas, creator]);
  return (
    <div className="rkpg-page">
      <Header />

      <main className="page-main">
        <div className="rkpg-head">
          <div>
            <div className="rkpg-title">디저트 카페 트렌딩 랭킹</div>
            <div className="rkpg-sub">
              데이터 기반으로 디저트·상권·카페를 탐색해보세요. <span className="rkpg-muted" style={{ marginLeft: 10 }}></span>
              {serverUpdatedAt ? <span style={{ marginLeft: 10, opacity: 0.85 }}>데이터 기준일: {serverUpdatedAt}</span> : null}
              {bootLoading ? <span style={{ marginLeft: 10, opacity: 0.85 }}>불러오는 중…</span> : null}
              {!bootLoading ? (
                bootError ? (
                  <span style={{ marginLeft: 10, opacity: 0.85 }}>API 연결 실패(모의 데이터 사용): {bootError}</span>
                ) : (
                  <span style={{ marginLeft: 10, opacity: 0.85 }}>{apiCafes?.length ? "API 연결됨" : "모의 데이터"}</span>
                )
              ) : null}
            </div>
          </div>

          <div className="rkpg-filters">
            {/* Consumer / Creator 탭 */}
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

              <div className="rank-grid">
                {/* 디저트 */}
                <div className="rank-block">
                  <div className="rank-block-header">
                    <div>
                      <div className="rank-block-title">인기 메뉴 TOP</div>
                      <div className="rkpg-smallhint">{menuViewHint}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div className="rkpg-seg" style={{ marginRight: 6 }}>
                        <button className={menuView === "all" ? "is-active" : ""} onClick={() => setMenuView("all")}>전체</button>
                        <button className={menuView === "drink" ? "is-active" : ""} onClick={() => setMenuView("drink")}>음료</button>
                        <button className={menuView === "dessert_meal" ? "is-active" : ""} onClick={() => setMenuView("dessert_meal")}>디저트+식사</button>
                      </div>

                      <button
                        className="rkpg-btn"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={() => openInsight("전체 메뉴 보기", { type: "menuAll" })}
                      >
                        전체 보기
                      </button>
                      <span className="rank-tag">언급</span>
                    </div>
                  </div>

                  <ul className="rank-list">
                    {menuTop10.length === 0 ? (
                      <li className="rank-item"><div className="rank-main"><div className="rank-meta">표시할 메뉴가 없습니다.</div></div></li>
                    ) : null}
                    {menuTop10.map((it, idx) => (
                      <li
                        key={it.name}
                        className="rank-item rkpg-click"
                        onClick={() => openInsight(`[${menuCatLabel(it.category)}] ${it.name} 인사이트`, { type: "dessert", key: it.name })}
                      >
                        <div className="rank-num">{idx + 1}</div>
                        <div className="rank-main">
                          <div className="rank-name"><Pill tone={menuCatTone(it.category)}>{menuCatLabel(it.category)}</Pill> {it.name}</div>
                          <div className="rank-meta">언급 카페 {it.mentions}곳</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 동네 */}
                <div className="rank-block">
                  <div className="rank-block-header">
                    <div>
                      <div className="rank-block-title">핫한 동네 TOP</div>
                    </div>
                    <span className="rank-tag rank-tag-secondary">핫플</span>
                  </div>

                  <ul className="rank-list">
                    {hotAreas.map((it, idx) => (
                      <li
                        key={it.name}
                        className="rank-item rkpg-click"
                        onClick={() => openInsight(`${it.name} 인사이트`, { type: "area", key: it.name })}
                      >
                        <div className="rank-num">{idx + 1}</div>
                        <div className="rank-main">
                          <div className="rank-name">{it.name}</div>
                          <div className="rank-meta">{it.meta}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </>
        ) : (
          /* ---------------------------
              Creator 영역
             --------------------------- */
          <section className="rkpg-creator">
            <div className="rkpg-creator-head">
              <div>
                <div className="rkpg-creator-title">창업자 인사이트</div>
                <div className="rkpg-creator-sub rkpg-muted">
                  카페 메뉴/키워드 동향을 알아가세요
                </div>
              </div>
              <div className="rkpg-creator-right">
                <button className="rkpg-btn" onClick={() => navigate("/map")}>
                  지도에서 상권 보기
                </button>
              </div>
            </div>
            <div className="rkpg-card" style={{ marginTop: 12 }}>
</div>

            {/* KPI 타일 */}
            <div className="rkpg-kpi-grid">
              {creatorKpis.map((k, i) => (
                <button key={i} className={`rkpg-kpi ${k.tone}`} onClick={k.onClick}>
                  <div className="rkpg-kpi-label">{k.label}</div>
                  <div className="rkpg-kpi-value">{k.value}</div>
                  <div className="rkpg-kpi-hint">{k.hint}</div>
                </button>
              ))}
            </div>

            {/* 인사이트 카드 */}
            <div className="rkpg-creator-grid">
              {creatorCards.map((card) => (
                <div key={card.id} className="rkpg-card">
                  <div className="rkpg-card-head">
                    <div>
                      <div className="rkpg-card-title">{card.title}</div>
                      <div className="rkpg-card-sub">{card.desc}</div>
                    </div>
                    <div className="rkpg-card-right">
                      <Pill tone={card.tone}>{card.pill}</Pill>
                    </div>
                  </div>

                  <div className="rkpg-card-body">
                    <div className="rkpg-list">
                      {card.rows.map((r, idx) => (
                        <div key={idx} className="rkpg-list-row">
                          <b>{r.left}</b>
                          <span className="rkpg-muted">{r.right}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rkpg-smallhint">
                      클릭하면 “근거 → 액션” 흐름으로 바로 정리해드립니다.
                    </div>
                  </div>

                  <div className="rkpg-card-foot">
                    <button className="rkpg-btn primary" onClick={() => openInsight(card.title, card.ctx)}>
                      {card.cta} →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <Drawer open={drawerOpen} title={drawerTitle} onClose={() => setDrawerOpen(false)}>
          {renderDrawerBody()}
        </Drawer>
      </main>
    </div>
  );
}
