import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header"; // ← (폴더 위치에 따라 경로만 조정)
import "../styles/RankingPage.css"; // ✅ 랭킹 페이지 전용 CSS (파일 위치에 맞게 경로 조정)

/**
 * RankingPage (Consumer + Creator)
 * - Consumer: 트렌딩 디저트 / 핫한 동네 / 카페 랭킹
 * - Creator: 창업자 인사이트 (메뉴 트렌드 / 상권 기회 / 고객 니즈 / 포지셔닝)
 *
 * NOTE
 * - 백엔드 연결 전에는 Mock 데이터로 동작합니다.
 * - 백엔드가 준비되면 /api/rankings?period=&region=&sort= 로 fetch 하도록 되어 있습니다.
 */

function mapCafesToConsumerRank(items = []) {
  const safe = Array.isArray(items) ? items : [];
  return safe.map((c) => {
    const area = c._regionText || c.neighborhood || c.region || "기타";
    const meta =
      Array.isArray(c.why) && c.why.length
        ? c.why.slice(0, 3).join(" · ")
        : Array.isArray(c.desserts) && c.desserts.length
          ? c.desserts.slice(0, 2).join(" · ")
          : typeof c.excerpt === "string"
            ? c.excerpt.replace("키워드:", "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" · ")
            : "";

    return {
      name: c.name ?? "-",
      area,
      meta: meta || "-",
      score: Number(c.score ?? 0),
      reviewCount: Number(c.reviewCount ?? 0),
      // 원본 보관(필요하면 상세에서 활용)
      _raw: c,
    };
  });
}

function buildDessertTrendFromCafes(items = []) {
  const safe = Array.isArray(items) ? items : [];
  const count = new Map();

  for (const c of safe) {
    if (!Array.isArray(c.desserts)) continue;
    const uniq = [...new Set(c.desserts.filter(Boolean))];
    for (const d of uniq) count.set(d, (count.get(d) ?? 0) + 1);
  }

  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, mentions]) => ({
      name,
      delta: 0,
      mentions,
      prevMentions: mentions,
    }));
}

function buildHotAreasFromCafes(items = []) {
  const safe = Array.isArray(items) ? items : [];
  const areaMap = new Map();     // area -> { demand, supply }
  const dessertMap = new Map();  // area -> Map(dessert -> cafes)

  const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

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
    let meta = "디저트";
    if (dm && dm.size) {
      const top = [...dm.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) meta = `${top[0]} 인기`;
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

function matchRegion(selected, areaText) {
  if (!selected || selected === "all") return true;
  const a = String(areaText ?? "");
  if (selected === "gwangju") return a.includes("구"); // 광주권(동구/서구/남구/북구/광산구 등)
  if (selected === "naju") return a.includes("나주");
  if (selected === "damyang") return a.includes("담양");
  if (selected === "hwasun") return a.includes("화순");
  return true;
}



function getDalcomBreakdown(raw, fallbackScore = 0) {
  const r = raw || {};

  // build_cafe_db_enriched_v5.py calc_score 기준(0~100):
  // 블로그(40) + 메뉴다양성(15) + 맛키워드(20) + 분위기(15) + 주차(10)

  const blogCount =
    (typeof r.blogCount === "number" ? r.blogCount : undefined) ??
    (typeof r.blog_count === "number" ? r.blog_count : undefined);

  // 메뉴다양성: desserts 배열(카테고리)로 대체 계산
  const desserts = Array.isArray(r.desserts) ? r.desserts.filter(Boolean) : [];
  const menuCount = desserts.length ? new Set(desserts).size : 0;

  const tasteHits =
    (typeof r.tasteHits === "number" ? r.tasteHits : undefined) ??
    (typeof r.taste_sc === "number" ? r.taste_sc : undefined);

  const atmosHits =
    (typeof r.atmosHits === "number" ? r.atmosHits : undefined) ??
    (typeof r.atmos_sc === "number" ? r.atmos_sc : undefined);

  const parkingText = String(r._parking ?? r.parking ?? "").trim();
  const parkingOk = parkingText.includes("가능");

  const round1 = (x) => Math.round(x * 10) / 10;

  const blogPoints =
    typeof blogCount === "number" ? round1((Math.min(blogCount, 30) / 30) * 40) : undefined;

  const menuPoints = round1((Math.min(menuCount, 8) / 8) * 15);

  const tastePoints =
    typeof tasteHits === "number" ? round1((Math.min(tasteHits, 15) / 15) * 20) : undefined;

  const atmosPoints =
    typeof atmosHits === "number" ? round1((Math.min(atmosHits, 15) / 15) * 15) : undefined;

  const parkingPoints = parkingOk ? 10 : 0;

  const score = Number(r.score ?? fallbackScore ?? 0);

  const knownNums = [blogPoints, menuPoints, tastePoints, atmosPoints].filter((v) => typeof v === "number");
  const knownTotal = round1(knownNums.reduce((a, b) => a + b, 0) + parkingPoints);

  const missing = [];
  if (typeof blogCount !== "number") missing.push("blogCount");
  if (typeof tasteHits !== "number") missing.push("tasteHits");
  if (typeof atmosHits !== "number") missing.push("atmosHits");

  return {
    score,
    blogCount,
    menuCount,
    tasteHits,
    atmosHits,
    parkingText: parkingText || "-",
    parkingOk,
    blogPoints,
    menuPoints,
    tastePoints,
    atmosPoints,
    parkingPoints,
    knownTotal,
    missing,
  };
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

const CAFE_RANK = [
  { name: "카페 하루", area: "나주", meta: "조용/디저트/주차", score: 92, reviewCount: 128 },
  { name: "인스틸 커피", area: "나주", meta: "감성/케이크", score: 89, reviewCount: 96 },
  { name: "욘더스콘", area: "나주", meta: "스콘/사진", score: 86, reviewCount: 84 },
  { name: "데일리박스", area: "나주", meta: "베이커리/주차", score: 84, reviewCount: 77 },
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

  
// 상권별 특화 디저트 TOP (포지셔닝)
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

  // daily | weekly | monthly
  const [period, setPeriod] = useState("monthly");
  const [region, setRegion] = useState("all");
  const [sort, setSort] = useState("score");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerCtx, setDrawerCtx] = useState({ type: "", key: "" });

  // 서버 데이터(있으면 우선), 없으면 Mock 유지
  const [serverUpdatedAt, setServerUpdatedAt] = useState("");
  const [dessertTrend, setDessertTrend] = useState(DESSERT_TREND);
  const [hotAreas, setHotAreas] = useState(HOT_AREAS);
  const [cafes, setCafes] = useState(CAFE_RANK);
  const [consumerCafeLimit, setConsumerCafeLimit] = useState(10);
  const [creator, setCreator] = useState(CREATOR_MOCK);
  const [loading, setLoading] = useState(false);

  // ✅ 백엔드 연결 확인용 (/api/status, /api/cafes)
  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState("");
  const [apiStatus, setApiStatus] = useState(null);
  const [apiCafes, setApiCafes] = useState([]);

  const periodLabel = useMemo(() => {
    if (period === "daily") return "오늘";
    if (period === "weekly") return "주간";
    return "월간";
  }, [period]);

  const openInsight = useCallback((title, ctx) => {
    setDrawerTitle(title);
    setDrawerCtx(ctx);
    setDrawerOpen(true);
  }, []);

  useEffect(() => {
  let alive = true;

  const run = async () => {
    setBootLoading(true);
    setBootError("");

    try {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/cafes"),
      ]);

      if (!sRes.ok) throw new Error(`/api/status HTTP ${sRes.status}`);
      if (!cRes.ok) throw new Error(`/api/cafes HTTP ${cRes.status}`);

      const sJson = await sRes.json().catch(() => null);
      const cJson = await cRes.json();

      const list =
        Array.isArray(cJson) ? cJson :
        Array.isArray(cJson?.items) ? cJson.items :   // ✅ 추가
        Array.isArray(cJson?.cafes) ? cJson.cafes :
        Array.isArray(cJson?.data) ? cJson.data :
        Array.isArray(cJson?.rows) ? cJson.rows : [];


      if (!alive) return;
      setApiStatus(sJson);
      setApiCafes(list);
      setCreator(buildCreatorInsights(list));

      // ✅ 소비자 랭킹도 DB(/api/cafes) 기반으로 갱신
      setCafes(mapCafesToConsumerRank(list));
      setDessertTrend(buildDessertTrendFromCafes(list));
      setHotAreas(buildHotAreasFromCafes(list));
      if (sJson?.updatedAt) setServerUpdatedAt(sJson.updatedAt);
    } catch (e) {
      if (!alive) return;
      setBootError(e?.message ?? String(e));
    } finally {
      if (alive) setBootLoading(false);
    }
  };

  run();
  return () => { alive = false; };
}, []);


  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ period, region, sort });
        const res = await fetch(`/api/rankings?${qs.toString()}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("rankings api not ready");
        const json = await res.json();

        if (!alive) return;

        if (json?.updatedAt) setServerUpdatedAt(json.updatedAt);
        if (Array.isArray(json?.dessertTrend)) setDessertTrend(json.dessertTrend);
        if (Array.isArray(json?.hotAreas)) setHotAreas(json.hotAreas);
        if (Array.isArray(json?.cafes)) setCafes(json.cafes);
        if (json?.creator) setCreator(json.creator);
      } catch (e) {
        // 의도된 fallback: Mock 유지
      } finally {
        if (alive) setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [period, region, sort]);

  const cafesSorted = useMemo(() => {
  const arr = [...cafes];
  const filtered = region === "all" ? arr : arr.filter((c) => matchRegion(region, c.area));
  if (sort === "score") filtered.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (sort === "name") filtered.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return filtered;
}, [cafes, sort, region]);
useEffect(() => {
    setConsumerCafeLimit(10);
  }, [region, sort, cafes]);
// Creator: 카드 내용 구성
  const creatorCards = useMemo(() => {
    const topMenu = (creator?.menuTrends ?? []).slice(0, 3);
    const topOpp = (creator?.opportunityAreas ?? []).slice(0, 3);
    const topNeeds = (creator?.needsTop ?? []).slice(0, 4);
    const topHotspots = (creator?.dessertHotspots ?? []).slice(0, 4);
    const safeHotspotRows = topHotspots.length
      ? topHotspots.map((h) => ({ left: h.area, right: `${h.dessert} · ${h.share}% (${Number(h.cafes).toLocaleString()}곳) · ${h.lift}배` }))
      : [{ left: "특화 디저트 없음", right: "케이크 제외/표본(5곳) 기준" }];

    return [
      {
        id: "menu",
        title: `${periodLabel} 메뉴 트렌드`,
        tone: "info",
        pill: "메뉴",
        desc: "언급량이 빠르게 증가하는 디저트 키워드 기준으로 메뉴/MD 우선순위를 정하세요.",
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
        pill: "운영",
        desc: "리뷰에서 ‘좋다’로 자주 묶이는 운영 요소는 재방문에 직결됩니다.",
        rows: topNeeds.map((k) => ({ left: k.name, right: `카페 ${Number(k.mentions).toLocaleString()}곳` })),
        cta: "체크리스트",
        ctx: { type: "creator", key: "needs" },
      },
{
  id: "hotspot",
  title: "상권별 특화 디저트 TOP",
  tone: "info",
  pill: "메뉴×입지",
  desc: "케이크(공통 1등)를 제외하고, 전체 대비 상권에서 더 자주 나오는 ‘특화 디저트’를 뽑았습니다.",
  rows: safeHotspotRows,
  cta: "근거/액션",
  ctx: { type: "creator", key: "hotspot" },
},
];
  }, [creator, periodLabel]);

  const creatorKpis = useMemo(() => {
    const topOpp = (creator?.opportunityAreas ?? [])[0];
    const topMenu = (creator?.menuTrends ?? [])[0];
    const topNeed = (creator?.needsTop ?? [])[0];
    const topHotspot = (creator?.dessertHotspots ?? [])[0];
return [
      {
        tone: "info",
        label: "인기 디저트 1순위",
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
  onClick: () => openInsight("상권별 대표 디저트", { type: "creator", key: "hotspot" }),
},
];
  }, [creator, openInsight]);

  const renderDrawerBody = () => {
    const { type, key } = drawerCtx;

    // Consumer: dessert
    if (type === "dessert") {
      const item = dessertTrend.find((d) => d.name === key);
      const mentions = item?.mentions ?? 0;
      const prev = item?.prevMentions ?? 0;
      const delta = item?.delta ?? 0;
      const max = Math.max(mentions, prev, 1);

      return (
        <div className="rkpg-insight">
          <div className="rkpg-insight-box">
            <div className="rkpg-row-between">
              <div>
                <b>근거</b>
                <div className="rkpg-smallhint">카페 정보 기반 집계(기간 비교 없음)</div>
              </div>
              <Pill tone="info">트렌딩</Pill>
            </div>
            <Progress label="언급 카페 수" value={mentions} max={max} />
            <Progress label="(참고) 동일 기준" value={prev} max={max} />
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
                <div className="rkpg-smallhint">{periodLabel} 기준(예시)</div>
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
// Consumer: cafe
if (type === "cafe") {
  const item = cafes.find((c) => c.name === key);
  const raw = item?._raw;
  const bd = getDalcomBreakdown(raw, item?.score);

  const reason =
    Array.isArray(raw?.why) && raw.why.length
      ? raw.why.slice(0, 6).join(" · ")
      : typeof raw?.excerpt === "string" && raw.excerpt
        ? raw.excerpt.replace("키워드:", "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6).join(" · ")
        : "-";

  return (
    <div className="rkpg-insight">
      <div className="rkpg-insight-box">
        <div className="rkpg-row-between">
          <div>
            <b>카페 요약</b>
            <div className="rkpg-smallhint">소비자용 요약(추천/만족도/리뷰수는 서로 다른 지표입니다)</div>
          </div>
          <Pill tone="info">카페</Pill>
        </div>

        <div className="rkpg-insight-ul">
          • 지역: <b>{item?.area ?? "-"}</b><br/>
          • 요약 키워드: <b>{item?.meta ?? "-"}</b><br/>
          • 달콤지수(추천): <b>{Number(item?.score ?? 0).toFixed(1)}</b><br/>
          • 리뷰수: <b>{Number(item?.reviewCount ?? 0).toLocaleString()}</b><br/>
          • 주차: <b>{bd.parkingText}</b><br/>
          • 근거 키워드: <b>{reason}</b>
        </div>
      </div>

      <div className="rkpg-insight-box">
        <div className="rkpg-row-between rkpg-rowgap">
          <div>
            <b>달콤지수 구성(기여도)</b>
            <div className="rkpg-smallhint">
              점수식(0~100): 블로그(40) + 메뉴(15) + 맛키워드(20) + 분위기(15) + 주차(10)
            </div>
          </div>
          <Pill tone="muted">설명</Pill>
        </div>

        {bd.missing.length ? (
          <div className="rkpg-smallhint" style={{ marginTop: 8 }}>
            ※ 현재 백엔드가 분해용 값({bd.missing.join(", ")})을 내려주지 않아 일부 항목은 비어 보입니다.
            <br/>
            (정확한 기여도 표시를 원하시면 /api/cafes에 blog_count, taste_sc, atmos_sc를 포함해 주세요)
          </div>
        ) : null}

        <div style={{ marginTop: 10 }}>
          {typeof bd.blogPoints === "number" ? (
            <Progress
              label={`블로그 노출 기여(최대 40) · ${bd.blogCount}개`}
              value={bd.blogPoints}
              max={40}
            />
          ) : (
            <div className="rkpg-smallhint">• 블로그 노출 기여: <b>-</b> (blog_count 미제공)</div>
          )}

          <Progress
            label={`메뉴 다양성 기여(최대 15) · ${bd.menuCount}종`}
            value={bd.menuPoints}
            max={15}
          />

          {typeof bd.tastePoints === "number" ? (
            <Progress
              label={`맛 키워드 기여(최대 20) · ${bd.tasteHits}회`}
              value={bd.tastePoints}
              max={20}
            />
          ) : (
            <div className="rkpg-smallhint">• 맛 키워드 기여: <b>-</b> (taste_sc 미제공)</div>
          )}

          {typeof bd.atmosPoints === "number" ? (
            <Progress
              label={`분위기 키워드 기여(최대 15) · ${bd.atmosHits}회`}
              value={bd.atmosPoints}
              max={15}
            />
          ) : (
            <div className="rkpg-smallhint">• 분위기 키워드 기여: <b>-</b> (atmos_sc 미제공)</div>
          )}

          <Progress
            label={`주차 보너스(최대 10) · ${bd.parkingOk ? "가능" : "정보/불가"}`}
            value={bd.parkingPoints}
            max={10}
          />

          <div className="rkpg-smallhint" style={{ marginTop: 10 }}>
            • 계산된 합(표시 가능한 항목 기준): <b>{bd.knownTotal}</b> / 100<br/>
            • 실제 달콤지수(백엔드 제공): <b>{Number(bd.score ?? 0).toFixed(1)}</b>
          </div>
        </div>
      </div>

      <button className="rank-more-btn" onClick={() => navigate("/map")}>
        지도에서 위치 확인 →
      </button>
    </div>
  );
}

    // Creator
    if (type === "creator") {
      const maxMenu = Math.max(...(creator?.menuTrends ?? []).map((x) => x.mentions), 1);
      const maxNeed = Math.max(...(creator?.needsTop ?? []).map((x) => x.mentions), 1);

      if (key === "menu") {
        return (
          <div className="rkpg-insight">
            <div className="rkpg-insight-box">
              <div className="rkpg-row-between rkpg-rowgap">
                <div>
                  <b>메뉴 트렌드 근거</b>
                  <div className="rkpg-smallhint">가장 많이 언급된 키워드</div>
                </div>
                <Pill tone="info">메뉴</Pill>
              </div>

              {(creator?.menuTrends ?? []).slice(0, 8).map((m) => (
                <div key={m.name} style={{ marginBottom: 12 }}>
                  <div className="rkpg-row-between">
                    <span>{m.name}</span>
                    <b>언급 카페 {Number(m.mentions).toLocaleString()}곳</b>
                  </div>
                  <Progress label="언급" value={m.mentions} max={maxMenu} />
                </div>
              ))}
            </div>

            <div className="rkpg-insight-box">
              <b>바로 실행 액션</b>
              <div className="rkpg-insight-ul">
                • TOP 키워드 1개에 집중: <b>시그니처 1 + 보조 2</b>로 단순화<br/>
                • 사진은 “단독샷 + 단면/식감 + 매장 컨셉” 3장 세트로 통일<br/>
                • 피크타임 병목(제조/픽업/결제) 체크 후 개선
              </div>
            </div>
          </div>
        );
      }

      if (key === "opportunity") {
        return (
          <div className="rkpg-insight">
            <div className="rkpg-insight-box">
              <div className="rkpg-row-between rkpg-rowgap">
                <div>
                  <b>상권 기회지수 근거</b>
                  <div className="rkpg-smallhint">수요(언급/리뷰) 대비 공급(경쟁) 갭</div>
                </div>
                <Pill tone="info">입지</Pill>
              </div>

              {(creator?.opportunityAreas ?? []).slice(0, 10).map((a) => (
                <div key={a.name} className="rkpg-opprow">
                  <div className="rkpg-row-between">
                    <b>{a.name}</b>
                    <Pill tone="info">기회 {a.opportunity}</Pill>
                  </div>
                  <div className="rkpg-opprow-grid">
                    <div className="rkpg-insight-ul">• 수요 <b>{a.demand}</b></div>
                    <div className="rkpg-insight-ul">• 공급 <b>{a.supply}</b></div>
                  </div>
                  <div className="rkpg-smallhint">
                    팁: 기회지수 + “컨셉 중복도(같은 키워드 카페 수)”를 같이 보시면 실패 확률이 확 떨어집니다.
                  </div>
                </div>
              ))}
            </div>

            <div className="rkpg-insight-box">
              <b>바로 실행 액션</b>
              <div className="rkpg-insight-ul">
                • 입지는 숫자보다 “<b>목적</b>”이 먼저입니다(데이트/작업/가족 중 1개 고정).<br/>
                • 공급이 많은 상권은 “맛”보다 <b>회전/대기/동선</b> 개선이 더 효과적입니다.
              </div>
            </div>
          </div>
        );
      }

      if (key === "needs") {
        return (
          <div className="rkpg-insight">
            <div className="rkpg-insight-box">
              <div className="rkpg-row-between rkpg-rowgap">
                <div>
                  <b>고객 니즈 TOP</b>
                  <div className="rkpg-smallhint">리뷰에서 “좋다/편하다”로 자주 묶이는 요소</div>
                </div>
                <Pill tone="good">운영</Pill>
              </div>

              {(creator?.needsTop ?? []).slice(0, 12).map((k) => (
                <div key={k.name} style={{ marginBottom: 10 }}>
                  <div className="rkpg-row-between">
                    <span>{k.name}</span>
                    <b>{k.mentions}</b>
                  </div>
                  <Progress label="언급" value={k.mentions} max={maxNeed} />
                </div>
              ))}
            </div>

            <div className="rkpg-insight-box">
              <b>운영 체크리스트</b>
              <div className="rkpg-insight-ul">
                • 주차: 가능/불가 말고 <b>대수/조건</b>까지 표기<br/>
                • 좌석: 콘센트/테이블 간격/단체석 여부 고정 안내<br/>
                • 조용함: 존 분리(작업 존/대화 존) + 피크타임 혼잡도 안내
              </div>
            </div>
          </div>
        );
      }

      
if (key === "hotspot") {
  return (
    <div className="rkpg-insight">
      <div className="rkpg-insight-box">
        <div className="rkpg-row-between rkpg-rowgap">
          <div>
            <b>상권별 특화 디저트 TOP</b>
            <div className="rkpg-smallhint">상권 비중(%) + 전체 대비 과대표현(lift, 배수)</div>
          </div>
          <Pill tone="info">메뉴×입지</Pill>
        </div>

        {(creator?.dessertHotspots ?? []).length === 0 ? (
          <div className="rkpg-smallhint" style={{ marginTop: 10 }}>표시할 특화 디저트가 없습니다. (케이크 제외/표본 5곳 기준)</div>
        ) : null}

        {(creator?.dessertHotspots ?? []).slice(0, 10).map((h) => (
          <div key={`${h.area}-${h.dessert}`} style={{ marginBottom: 12 }}>
            <div className="rkpg-row-between">
              <span>{h.area}</span>
              <b>{h.dessert} · {h.share}% · {h.lift}배</b>
            </div>
            <Progress label="집중도" value={h.share} max={100} />
            <div className="rkpg-smallhint">
              {Number(h.cafes).toLocaleString()} / {Number(h.total).toLocaleString()}곳
            </div>
          </div>
        ))}
      </div>

      <div className="rkpg-insight-box">
        <b>액션</b>
        <div className="rkpg-insight-ul">
          • 비중이 높은 디저트는 <b>상권의 기대치</b>입니다 → 품질/차별 포인트를 준비하세요<br/>
          • 비중이 낮은 디저트는 <b>틈새</b>일 수 있습니다 → 상권 기회지수와 함께 판단하세요
        </div>
      </div>
    </div>
  );
}

// (해당 섹션 제거)
// NOTE: 선택한 key(menu/opportunity/needs/hotspot)만 상세 패널을 보여줍니다.

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
  };

  return (
    <div className="rkpg-page">
      <Header />

      <main className="page-main">
        <div className="rkpg-head">
          <div>
            <div className="rkpg-title">랭킹</div>
            <div className="rkpg-sub">
              {periodLabel} 트렌딩/핫플을 한눈에 확인해보세요.
              {serverUpdatedAt ? <span style={{ marginLeft: 10, opacity: 0.85 }}>데이터 기준일: {serverUpdatedAt}</span> : null}
              {loading ? <span style={{ marginLeft: 10, opacity: 0.85 }}>불러오는 중…</span> : null}
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

            {/* 지역/정렬 */}
            <select className="rkpg-select" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역 선택">
              <option value="all">전체</option>
              <option value="gwangju">광주</option>
              <option value="naju">나주</option>
              <option value="damyang">담양</option>
              <option value="hwasun">화순</option>
            </select>
            
          </div>
        </div>

        {/* ---------------------------
            Consumer 영역
           --------------------------- */}
        {mode === "consumer" ? (
          <>
            <section className="rank-section">
              <div className="rank-section-title">최근 트렌딩/핫플 랭킹</div>
              <div className="rank-section-sub">메인 하단 랭킹을 페이지로 확장한 화면입니다.</div>

              <div className="rank-grid">
                {/* 디저트 */}
                <div className="rank-block">
                  <div className="rank-block-header">
                    <div>
                      <div className="rank-block-title">최근 트렌딩 디저트</div>
                      <div className="rank-block-caption">{periodLabel} 기준</div>
                    </div>
                    <span className="rank-tag">트렌딩</span>
                  </div>

                  <ul className="rank-list">
                    {dessertTrend.map((it, idx) => (
                      <li
                        key={it.name}
                        className="rank-item rkpg-click"
                        onClick={() => openInsight(`${it.name} 인사이트`, { type: "dessert", key: it.name })}
                      >
                        <div className="rank-num">{idx + 1}</div>
                        <div className="rank-main">
                          <div className="rank-name">{it.name}</div>
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
                      <div className="rank-block-title">최근 핫한 동네</div>
                      <div className="rank-block-caption">{periodLabel} 기준</div>
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

            {/* 카페 랭킹 */}
            <section className="rkpg-cafe">
              <div className="rkpg-cafe-head">
                <div className="rkpg-cafe-title">카페 랭킹</div>
                <button className="rank-more-btn rkpg-mini" onClick={() => openInsight("카페 랭킹 인사이트", { type: "cafe", key: cafesSorted[0]?.name })}>
                  인사이트 보기 →
                </button>
              </div>

              <div className="rkpg-cafe-grid">
                {cafesSorted.slice(0, consumerCafeLimit).map((c, idx) => (
                  <div key={c.name} className="rkpg-cafe-card">
                    <div className="rkpg-cafe-top">
                      <div className="rkpg-badge">{idx + 1}</div>
                      <div>
                        <div className="rkpg-cafe-name">{c.name}</div>
                        <div className="rkpg-cafe-meta">
                          {c.area} · {c.meta} · 달콤지수 {c.score}
                          {typeof c.reviewCount === "number" ? <span style={{ marginLeft: 8, opacity: 0.85 }}>리뷰 {c.reviewCount}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="rkpg-cafe-actions">
                      <button className="rkpg-btn" onClick={() => openInsight(`${c.name} 인사이트`, { type: "cafe", key: c.name })}>
                        상세/근거
                      </button>
                      <button className="rkpg-btn primary" onClick={() => navigate("/map")}>
                        지도에서 보기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {cafesSorted.length > consumerCafeLimit ? (
  <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
    <button
      className="rkpg-btn"
      onClick={() => setConsumerCafeLimit((v) => Math.min(v + 10, cafesSorted.length))}
    >
      더보기 (+10)
    </button>
  </div>
) : null}
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
                  디저트 업계의 최신 동향을 알아가세요
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
