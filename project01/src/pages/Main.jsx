import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import PlacePopup from "../components/PlacePopup";
import "../styles/Main.css";

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function buildTrendingMenusFromCafes(cafes, topN = 5) {
  const counts = new Map();

  for (const c of safeArray(cafes)) {
    const menus = new Set(safeArray(c?.desserts));
    for (const m of menus) {
      if (!m) continue;
      counts.set(m, (counts.get(m) || 0) + 1);
    }
  }

  const arr = [...counts.entries()].map(([name, count]) => ({ name, count }));
  arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));

  return arr.slice(0, topN).map((x) => ({
    name: x.name,
    meta: `${x.count}곳`,
  }));
}

function buildHotRoadAreasFromCafes(cafes, topN = 5) {
  const list = safeArray(cafes);

  // 전역 메뉴 유니크(다양성 정규화용)
  const globalMenuSet = new Set();
  for (const c of list) for (const m of safeArray(c?.desserts)) if (m) globalMenuSet.add(m);
  const globalMenuCount = Math.max(1, globalMenuSet.size);

  // 그룹핑: road_area_key 우선, 없으면 road_key, neighborhood 순
  const groups = new Map();
  for (const c of list) {
    const key = c?.road_area_key || c?.road_key || c?.neighborhood || "기타";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let areas = [...groups.entries()].map(([key, cafesInArea]) => {
    const cafeCount = cafesInArea.length;

    // 크롤링 포착치: 카페당 최대 10개라는 가정
    let full10 = 0;
    let sumCap10 = 0;

    const areaMenuSet = new Set();

    for (const c of cafesInArea) {
      const rcRaw =
        Number(c?.reviewCountExternal ?? c?.review_count_external ?? c?.reviewCountTotal ?? c?.review_count_total ?? 0) || 0;
      const cap = Math.min(10, Math.max(0, rcRaw));
      sumCap10 += cap;
      if (cap >= 10) full10 += 1;

      for (const m of safeArray(c?.desserts)) if (m) areaMenuSet.add(m);
    }

    const full10Ratio = cafeCount > 0 ? full10 / cafeCount : 0; // 0~1
    const density = cafeCount > 0 ? sumCap10 / (cafeCount * 10) : 0; // 0~1
    const varietyNorm = Math.log1p(areaMenuSet.size) / Math.log1p(globalMenuCount); // 0~1

    // 표본 안정도(카페 수가 적을수록 품질 지표 영향 축소)
    const stability = cafeCount / (cafeCount + 3);

    // 카페 수 스케일(가장 큰 비중)
    // - 1~2개짜리 상권이 튀지 않도록 log 스케일
    const cafeCountScale = Math.log1p(cafeCount);

    const quality = 0.45 * full10Ratio + 0.35 * density + 0.20 * varietyNorm;

    return {
      key,
      cafeCount,
      full10Ratio,
      density,
      variety: areaMenuSet.size,
      cafeCountScale,
      score: 0.75 * cafeCountScale + 0.25 * (quality * stability),
    };
  });

  // 표본 너무 적은 곳은 기본 후보에서 제외(후보가 부족하면 완화)
  const applyMin = (minCafes) => areas.filter((a) => a.cafeCount >= minCafes);
  let filtered = applyMin(3);
  if (filtered.length < topN) filtered = applyMin(2);
  if (filtered.length < topN) filtered = areas;

  // cafeCountScale은 절대값이라서, 리스트 내에서 0~100으로 다시 정렬 안정화
  filtered.sort((a, b) => b.score - a.score || b.cafeCount - a.cafeCount || a.key.localeCompare(b.key, "ko"));

  // 점수는 표시용으로 0~100 범위로 재스케일(상대값)
  const maxScore = Math.max(...filtered.map((x) => x.score), 1);
  const minScore = Math.min(...filtered.map((x) => x.score), 0);

  const toScore100 = (s) => {
    if (maxScore === minScore) return 50;
    const v = (s - minScore) / (maxScore - minScore);
    return Math.round(v * 100);
  };

  return filtered.slice(0, topN).map((a) => ({
    name: a.key,
    note: `카페 ${a.cafeCount}곳 · ${toScore100(a.score)}점`,
  }));
}

function normalizeToken(v) {
  const s = String(v || "").trim();
  return s.replace(/^#/, "").trim();
}

function hashStringToInt(str) {
  // simple deterministic hash (32-bit)
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const out = [...safeArray(arr)];
  const rnd = mulberry32(seed >>> 0);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// ✅ 메인 검색창 아래 해시태그: "추출 키워드" 기반으로 가변 생성
// - desserts(메뉴 태그) 상위 N개 + why(상위 키워드) 상위 N개를 섞어서 6개 노출
// - 데이터가 고정이어도 "항상 상위 3개"로 고정되지 않도록, 상위 풀(topK)에서 시드 기반 셔플 후 샘플링
function buildDynamicHashtagChips(
  cafes,
  regionKey,
  { dessertMax = 3, keywordMax = 3, dessertPool = 25, keywordPool = 35, seed = 0 } = {}
) {
  const list = safeArray(cafes).filter((c) => {
    if (!regionKey || regionKey === "all") return true;
    return String(c?.region) === String(regionKey);
  });

  const countFrom = (getTokens) => {
    const m = new Map();
    for (const c of list) {
      const toks = safeArray(getTokens?.(c));
      // ✅ 카페 단위 중복 제거(한 카페에서 같은 키워드 3번 나와도 1회로 카운트)
      const uniqSet = new Set();
      for (const raw of toks) {
        const t = normalizeToken(raw);
        if (!t) continue;
        if (t.length < 2) continue;
        if (/^\d+$/.test(t)) continue;
        uniqSet.add(t);
      }
      for (const t of uniqSet) m.set(t, (m.get(t) || 0) + 1);
    }
    return m;
  };

  const topN = (m, n) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ko"))
      .slice(0, n)
      .map(([k]) => k);

  const dessertMap = countFrom((c) => c?.desserts);
  const keywordMap = countFrom((c) => c?.why);

  // ✅ "의미 있는" 후보 풀을 넉넉히 만든 뒤, 시드 셔플로 3개씩 뽑아서 고정 현상 제거
  const dessertPoolList = topN(dessertMap, dessertPool);
  const keywordPoolList = topN(keywordMap, keywordPool);

  const desserts = seededShuffle(dessertPoolList, (seed ^ 0x1a2b3c4d) >>> 0);
  const keywords = seededShuffle(keywordPoolList, (seed ^ 0x9e3779b9) >>> 0);

  const out = [];
  const used = new Set();

  for (const d of desserts) {
    if (used.has(d)) continue;
    used.add(d);
    out.push({ label: d, kind: "dessert" });
    if (out.filter((x) => x.kind === "dessert").length >= dessertMax) break;
  }
  for (const k of keywords) {
    if (used.has(k)) continue;
    used.add(k);
    out.push({ label: k, kind: "keyword" });
    if (out.filter((x) => x.kind === "keyword").length >= keywordMax) break;
  }

  // ✅ 부족하면 keywordMap에서 추가로 채우기
  if (out.length < dessertMax + keywordMax) {
    const more = seededShuffle(topN(keywordMap, Math.max(20, dessertMax + keywordMax + 20)), (seed ^ 0x31415926) >>> 0);
    for (const t of more) {
      if (out.length >= dessertMax + keywordMax) break;
      if (used.has(t)) continue;
      used.add(t);
      out.push({ label: t, kind: "keyword" });
    }
  }

  return out.slice(0, dessertMax + keywordMax);
}

export default function Main() {
  const navigate = useNavigate();

  const regionOptions = useMemo(
    () => [
      { value: "all", label: "전체" },
      { value: "dong-gu", label: "광주 동구" },
      { value: "nam-gu", label: "광주 남구" },
      { value: "buk-gu", label: "광주 북구" },
      { value: "seo-gu", label: "광주 서구" },
      { value: "gwangsan-gu", label: "광주 광산구" },
      { value: "hwasun", label: "화순" },
      { value: "damyang", label: "담양" },
      { value: "naju", label: "나주" },
    ],
    []
  );

  // ✅ 사진 넣을 자리: img 경로만 교체하면 됨
  const regionCards = useMemo(
    () => [
      { id: "dong-gu", title: "광주광역시 동구", sub: "동명동·충장로", img: "/main/dong-gu.jpg" },
      { id: "nam-gu", title: "광주광역시 남구", sub: "양림동·푸른길", img: "/main/namgu.png" },
      { id: "buk-gu", title: "광주광역시 북구", sub: "전대·운암", img: "/main/bukgu.jpg" },
      { id: "seo-gu", title: "광주광역시 서구", sub: "상무·풍암", img: "/main/seogu.jpg" },
      { id: "gwangsan-gu", title: "광주광역시 광산구", sub: "수완·첨단", img: "/main/gwangsan.jpg" },
      { id: "hwasun", title: "화순", sub: "드라이브·자연", img: "/main/hwasun.jpg" },
      { id: "damyang", title: "담양", sub: "대나무숲·뷰", img: "/main/damyang.jpg" },
      { id: "naju", title: "나주", sub: "주말 코스", img: "/main/naju.jpg" },
    ],
    []
  );

  const themeCards = useMemo(
    () => [
      { key: "dessert", title: "디저트 맛집", sub: "케이크·구움과자", img: "/main/dessert.jpg" },
      { key: "photo", title: "사진/포토존", sub: "감성·자연광", img: "/main/sajing.jpg" },
      { key: "study", title: "공부/작업", sub: "조용함·좌석", img: "/main/stu.jpg" },
      { key: "date", title: "데이트", sub: "분위기·코스", img: "/main/date.jpg" },
      { key: "family", title: "가족/아이", sub: "주차·키즈", img: "/main/fam.jpg" },
      { key: "pet", title: "반려동물 동반", sub: "반려동물과 함께", img: "/main/pet.png" },
    ],
    []
  );

  // 메인 랭킹(최신 데이터로 계산)
  const fallbackTrending = useMemo(
    () => [
      { name: "크로플", meta: "—" },
      { name: "소금빵", meta: "—" },
      { name: "말차", meta: "—" },
      { name: "케이크", meta: "—" },
      { name: "휘낭시에", meta: "—" },
    ],
    []
  );

  const fallbackHot = useMemo(
    () => [
      { name: "동구 동명로", note: "—" },
      { name: "서구 상무대로", note: "—" },
      { name: "광산구 수완로", note: "—" },
      { name: "남구 양림로", note: "—" },
      { name: "담양읍 메타세쿼이아로", note: "—" },
    ],
    []
  );

  const goThemeTab = (key) => {
    const params = new URLSearchParams();
    if (region && region !== "all") params.set("region", region);

    // Sidebar.jsx(UI_TO_SOURCE) 기준으로 “Search가 매칭 가능한 토큰”으로 변환
    // - Search는 URL의 themes/desserts/purpose/must 등을 읽고(:contentReference[oaicite:4]{index=4})
    //   buildHayForMatch에 포함된 텍스트에서 매칭합니다. :contentReference[oaicite:5]{index=5}
    const map = {
      // 디저트 맛집: themes 대신 desserts로 거는 게 안전
      dessert: { desserts: ["케이크", "쿠키/구움과자", "마카롱", "초콜릿/디저트특화", "크레페/와플"] },

      // 사진/포토존 (Sidebar: "📸 포토존" -> theme: ["포토존/인스타"]) :contentReference[oaicite:6]{index=6}
      photo: { themes: ["포토존/인스타"] },

      // 공부/작업 (Sidebar: "💻 카공/작업" -> purpose/must) :contentReference[oaicite:7]{index=7}
      study: { purpose: ["공부/작업"], must: ["콘센트/와이파이"] },

      // 데이트 (Sidebar: "❤️ 데이트") :contentReference[oaicite:8]{index=8}
      date: { purpose: ["데이트"] },

      // 가족/아이 (Sidebar: "👶 아이와 함께") :contentReference[oaicite:9]{index=9}
      family: { purpose: ["가족/키즈"], must: ["키즈/유모차"] },

      // 반려동물과 함께
      pet: { purpose: ["반려견동반"], must: ["반려견동반"] },
    };

    const picked = map[key];
    if (picked?.themes?.length) params.set("themes", picked.themes.join(","));
    if (picked?.desserts?.length) params.set("desserts", picked.desserts.join(","));
    if (picked?.purpose?.length) params.set("purpose", picked.purpose.join(","));
    if (picked?.must?.length) params.set("must", picked.must.join(","));
    if (picked?.q) params.set("q", picked.q);

    navigate(`/search?${params.toString()}`);
  };


  const [trendingMenus, setTrendingMenus] = useState(fallbackTrending);
  const [hotRoadAreas, setHotRoadAreas] = useState(fallbackHot);
  const [rankLoading, setRankLoading] = useState(false);

  const [cafesSnapshot, setCafesSnapshot] = useState([]);
  const [themeSeed, setThemeSeed] = useState(0);
  const [hashtagSeed, setHashtagSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));

  const [openCafeId, setOpenCafeId] = useState(null);
  const [openCafeLoading, setOpenCafeLoading] = useState(false);
  const [openCafe, setOpenCafe] = useState(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setRankLoading(true);
        const r = await fetch("/api/cafes");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const cafes = j?.items ?? j ?? [];

        const t = buildTrendingMenusFromCafes(cafes, 5);
        const h = buildHotRoadAreasFromCafes(cafes, 5);

        if (!alive) return;

        // ✅ 메인 “오늘의 테마 카페” 섹션에서 재활용
        setCafesSnapshot(Array.isArray(cafes) ? cafes : []);

        if (t.length) setTrendingMenus(t);
        if (h.length) setHotRoadAreas(h);
      } catch (e) {
        // 메인은 실패해도 하드 에러 대신 기본값 유지
        console.error("[Main] ranking snapshot load failed:", e);
      } finally {
        if (alive) setRankLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };

  }, []);

  // ✅ 카페 카드 클릭 시: 서버의 /api/cafes/:id 로 단건 상세를 가져와서 모달로 보여줌
  useEffect(() => {
    let alive = true;
    if (!openCafeId) {
      setOpenCafe(null);
      setOpenCafeLoading(false);
      return;
    }

    const loadDetail = async () => {
      try {
        setOpenCafeLoading(true);
        const r = await fetch(`/api/cafes/${openCafeId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        setOpenCafe(j?.cafe ?? null);
      } catch (e) {
        console.error("[Main] cafe detail load failed:", e);
        if (alive) setOpenCafe(null);
      } finally {
        if (alive) setOpenCafeLoading(false);
      }
    };

    loadDetail();

    const onKeyDown = (ev) => {
      if (ev.key === "Escape") setOpenCafeId(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      alive = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openCafeId]);


  // ✅ 메인 추천 카페 클릭 시: 지도 화면에서 쓰는 PlacePopup을 그대로 재사용
  const popupPlace = useMemo(() => {
    // 1) 상세 API(/api/cafes/:id)로 받은 데이터가 있으면 그걸 최우선
    if (openCafe) {
      return {
        ...openCafe,
        // PlacePopup이 읽는 URL 필드 보정(서버는 mapUrl로 내려줌)
        url: openCafe?.url || openCafe?.mapUrl || openCafe?.homepage || "",
        homepage: openCafe?.homepage || openCafe?.mapUrl || "",
        // PlacePopup은 menu 필드를 봄(서버는 mainMenu)
        menu: openCafe?.menu || openCafe?.mainMenu || "",
      };
    }

    // 2) 아직 상세를 못 받았으면 /api/cafes 목록 스냅샷으로 “임시 카드”라도 보여주기
    const stub = safeArray(cafesSnapshot).find((x) => Number(x?.id) === Number(openCafeId));
    if (!stub) {
      if (openCafeLoading) {
        return { name: "불러오는 중…", address: "", photos: [] };
      }
      return null;
    }

    return {
      id: Number(stub.id),
      cafe_id: Number(stub.id),
      name: stub?.name,
      region: stub?.region,
      address: stub?._address || "",
      score: Number(stub?.score || 0) || 0,
      rating: stub?.rating ?? null,
      reviewCount: Number(stub?.reviewCount || 0) || 0,
      photos: stub?.thumb ? [stub.thumb] : [],
      // 상세 URL은 상세 API 응답에서 채워지게 두기
      url: "",
      homepage: "",
      menu: "",
    };
  }, [openCafe, openCafeLoading, cafesSnapshot, openCafeId]);

  const [region, setRegion] = useState(regionOptions[0].value);
  const [keyword, setKeyword] = useState("");

  const fallbackHashtags = useMemo(() => ["감성", "조용함", "포토존", "주문케이크", "비건", "가족"], []);
  const hashtagChips = useMemo(() => {
    // ✅ 데이터가 고정이어도 해시태그가 항상 '상위 몇 개'로 고정되지 않게, 날짜/지역/seed 기반으로 셔플
    const now = new Date();
    const daySeed = Math.floor(
      (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 86400000
    );
    const seed = (daySeed ^ hashStringToInt(region) ^ (themeSeed * 131) ^ hashtagSeed) >>> 0;

    const chips = buildDynamicHashtagChips(cafesSnapshot, region, {
      dessertMax: 3,
      keywordMax: 3,
      dessertPool: 25,
      keywordPool: 35,
      seed,
    });
    if (chips && chips.length) return chips;

    // ✅ 데이터가 아직 없으면 기존 고정 해시태그 폴백
    return fallbackHashtags.map((t) => ({ label: t, kind: "keyword" }));
  }, [cafesSnapshot, region, fallbackHashtags, themeSeed, hashtagSeed]);

  const regionLabelMap = useMemo(() => {
    const m = new Map();
    for (const opt of regionOptions) m.set(opt.value, opt.label);
    return m;
  }, [regionOptions]);

  const toSearchUrl = useCallback(
    ({ regionValue, q, themes, desserts, sort } = {}) => {
      const params = new URLSearchParams();
      const r = regionValue ?? region;
      if (r && r !== "all") params.set("region", r);
      if (q) params.set("q", q);
      if (themes) params.set("themes", themes);
      if (desserts) params.set("desserts", desserts);
      if (sort) params.set("sort", sort);
      return `/search?${params.toString()}`;
    },
    [region]
  );

  const regionKeyFromText = (text) => {
    const t = String(text || "");
    if (t.includes("동구")) return "dong-gu";
    if (t.includes("남구")) return "nam-gu";
    if (t.includes("북구")) return "buk-gu";
    if (t.includes("서구")) return "seo-gu";
    if (t.includes("광산구")) return "gwangsan-gu";
    if (t.includes("화순")) return "hwasun";
    if (t.includes("담양")) return "damyang";
    if (t.includes("나주")) return "naju";
    return "all";
  };

  const extractRoadToken = (text) => {
    const s = String(text || "").replace(/\([^)]*\)/g, " ").trim();
    const parts = s.split(/\s+/).filter(Boolean);
    // 마지막 "로/길/대로" 토큰을 우선
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (/(로|길|대로)$/.test(p)) return p;
    }
    return parts[parts.length - 1] || "";
  };

  const sortByScore = (a, b) =>
    (Number(b?.score || 0) - Number(a?.score || 0)) ||
    (Number(b?.reviewCount || 0) - Number(a?.reviewCount || 0));

  const todayBundles = useMemo(() => {
    const cafes = Array.isArray(cafesSnapshot) ? cafesSnapshot : [];
    if (!cafes.length) return [];

    // “그날” 느낌: 날짜 기반 시드 + 사용자가 눌러서 바꾸는 themeSeed
    const now = new Date();
    const daySeed = Math.floor(
      (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 86400000
    );
    const seed = daySeed + themeSeed * 7;

    const menuPick = trendingMenus?.length ? trendingMenus[seed % trendingMenus.length]?.name : "";
    const hotPick = hotRoadAreas?.length ? hotRoadAreas[seed % hotRoadAreas.length]?.name : "";
    const themePick = themeCards?.length ? themeCards[seed % themeCards.length] : null;

    const menuItems = menuPick
      ? cafes
          .filter((c) => (Array.isArray(c?.desserts) ? c.desserts : []).includes(menuPick))
          .sort(sortByScore)
          .slice(0, 8)
      : [];

    const roadToken = extractRoadToken(hotPick);
    const hotRegion = regionKeyFromText(hotPick);

    const hotItems = hotPick
      ? cafes
          .filter((c) => {
            const ra = String(c?.road_area_key || "");
            const rk = String(c?.road_key || "");
            const nb = String(c?.neighborhood || "");
            const addr = String(c?._address || "");
            const hay = `${ra} ${rk} ${nb} ${addr}`;
            if (ra === hotPick || rk === hotPick || nb === hotPick) return true;
            if (roadToken && hay.includes(roadToken)) return true;
            if (hotPick && hay.includes(hotPick)) return true;
            return false;
          })
          .sort(sortByScore)
          .slice(0, 8)
      : [];

    const themeItems = themePick
      ? cafes
          .filter((c) => (Array.isArray(c?.themes) ? c.themes : []).includes(themePick.key))
          .sort(sortByScore)
          .slice(0, 8)
      : [];

    // 데이터가 적으면 안전하게 상위 스코어로 채움
    const topFallback = cafes.slice().sort(sortByScore).slice(0, 8);
    const finalMenuItems = menuItems.length ? menuItems : topFallback;
    const finalHotItems = hotItems.length ? hotItems : topFallback;
    const finalThemeItems = themeItems.length ? themeItems : topFallback;

    const shortHotTitle = roadToken ? roadToken : hotPick;

    return [
      {
        key: "menu",
        kicker: "오늘의 디저트",
        title: menuPick ? `오늘 ${menuPick}는 어때요?` : "오늘 뭐 먹지?",
        sub: "리뷰 텍스트에서 많이 언급된 메뉴 기반",
        cta: "맛집 찾아보기 →",
        onViewAll: () => navigate(toSearchUrl({ q: menuPick || undefined, desserts: menuPick || undefined })),
        items: finalMenuItems,
      },
      {
        key: "road",
        kicker: "오늘의 탐방 코스",
        title: shortHotTitle ? `달콤인덱스와 ${shortHotTitle} 카페 탐방` : "오늘은 어디로 갈까?",
        sub: "최근 언급/다양성이 높은 거리 기반",
        cta: "거리 카페 보기 →",
        onViewAll: () =>
          navigate(
            toSearchUrl({
              regionValue: hotRegion !== "all" ? hotRegion : undefined,
              q: roadToken || hotPick || undefined,
            })
          ),
        items: finalHotItems,
      },
      {
        key: "theme",
        kicker: "오늘의 테마",
        title: themePick ? `${themePick.title} 카페 모아보기` : "테마 카페",
        sub: themePick?.sub || "리뷰 키워드 기반 자동 분류",
        cta: "테마 전체보기 →",
        onViewAll: () => themePick && navigate(toSearchUrl({ themes: themePick.key })),
        items: finalThemeItems,
      },
    ];
  }, [cafesSnapshot, trendingMenus, hotRoadAreas, themeCards, themeSeed, navigate, toSearchUrl]);


  const goSearch = (e) => {
    e.preventDefault();
    const q = keyword.trim();

    const params = new URLSearchParams();
    if (region !== "all") params.set("region", region);
    if (q) params.set("q", q);

    navigate(`/search?${params.toString()}`);
  };

  return (
    <div className="main-page">
      <Header showInfoBar={true} />

      {/* ✅ 검색창 영역: 가로로 긴 배경이미지 + 검색박스 오버레이 */}
      <section className="hero-banner">
        <div className="hero-inner container">
          <form className="hero-search" onSubmit={goSearch}>
            <div className="search-row">
              <label className="field">
                <span className="label">지역</span>
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  {regionOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field grow">
                <span className="label">검색</span>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="동네, 카페명, 디저트(예: 말차, 크로플)"
                />
              </label>

              <button className="btn primary" type="submit">
                검색
              </button>
            </div>

            <div className="chip-row">
              {hashtagChips.map((ch) => (
                <button
                  key={`${ch.kind}:${ch.label}`}
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (ch.kind === "dessert") {
                      navigate(toSearchUrl({ desserts: ch.label, sort: "relevance" }));
                    } else {
                      navigate(toSearchUrl({ q: ch.label, sort: "relevance" }));
                    }
                  }}
                >
                  #{ch.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      </section>

      {/* ✅ 그날의 테마 카페 추천(실제 카페 카드) */}
      <section className="today-theme">
        <div className="container">
          <div className="today-head">
            <div>
              <h2>오늘의 테마 카페</h2>
              <div className="muted">리뷰 텍스트 기반으로 “메뉴/거리/테마” 3가지 루트로 추천해드립니다.</div>
            </div>

            <button
              type="button"
              className="linkish"
              onClick={() => {
                setThemeSeed((s) => (Number.isFinite(s) ? s + 1 : 1));
                // ✅ '다른 조합 보기'에 맞춰 해시태그도 같이 회전
                setHashtagSeed((x) => (Number.isFinite(x) ? x + 1 : 1));
              }}
              title="추천 조합을 바꿔보기"
            >
              다른 조합 보기 ↻
            </button>
          </div>

          {!todayBundles.length ? (
            <div className="today-empty big">추천 데이터를 불러오는 중입니다…</div>
          ) : (
            todayBundles.map((b) => (
              <div key={b.key} className="today-row">
                <div className="today-row-head">
                  <div className="today-row-title">
                    <div className="kicker">{b.kicker}</div>
                    <h3>{b.title}</h3>
                    <div className="muted">{b.sub}</div>
                  </div>

                  <button type="button" className="linkish" onClick={b.onViewAll}>
                    {b.cta}
                  </button>
                </div>

                <div className="today-scroll" role="list">
                  {safeArray(b.items).map((c) => {
                    const regionLabel = regionLabelMap.get(c?.region) || c?.region || "지역";
                    const ratingText = c?.rating == null ? "★ —" : `★ ${c.rating}`;
                    const rc = Number(c?.reviewCount || 0) || 0;

                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="cafe-mini"
                        role="listitem"
                        onClick={() => setOpenCafeId(c.id)}
                      >
                        <div className="thumb">
                          {c?.thumb ? (
                            <img src={c.thumb} alt="" loading="lazy" />
                          ) : (
                            <div className="thumb-fallback">No Image</div>
                          )}
                        </div>

                        <div className="meta">
                          <div className="name">{c?.name || "카페"}</div>
                          <div className="line">
                            {c?.neighborhood ? `${c.neighborhood} · ` : ""}
                            {regionLabel}
                          </div>
                          <div className="line2">
                            {ratingText} · 리뷰 {rc.toLocaleString("ko-KR")}
                          </div>

                          {safeArray(c?.why).length ? (
                            <div className="tags">
                              {safeArray(c.why)
                                .slice(0, 3)
                                .map((t) => (
                                  <span key={t} className="tag">
                                    {t}
                                  </span>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <main className="container main-content">
        {/* ✅ 지역/테마 추천: 2열로 “나란히”, 각자 3x2 그리드 */}
        <section className="reco-stack">
          {/* 지역별 추천 박스 */}
          <div className="reco-box">
            <div className="section-head">
              <h2>지역별 추천</h2>
              <button className="linkish" onClick={() => navigate("/search")}>
                지역 전체 보기 →
              </button>
            </div>

            <div className="img-grid region-grid">
              {regionCards.map((c) => (
                <button
                  key={c.id}
                  className="img-card"
                  onClick={() => navigate(`/search?region=${encodeURIComponent(c.id)}`)}
                >
                  <div className="thumb">
                    <img src={c.img} alt="" />
                  </div>
                  <div className="meta">
                    <div className="title">{c.title}</div>
                    <div className="sub">{c.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 테마별 추천 박스 */}
          <div className="reco-box">
            <div className="section-head">
              <h2>테마별 추천</h2>
              <span className="muted">리뷰 텍스트 기반 점수·키워드로 “왜 추천인지”까지</span>
            </div>

            <div className="img-grid theme-grid">
              {themeCards.map((c) => (
                <button
                  key={c.key}
                  className="img-card"
                  onClick={() => goThemeTab(c.key)}
                >
                  <div className="thumb">
                    <img src={c.img} alt="" />
                  </div>
                  <div className="meta">
                    <div className="title">{c.title}</div>
                    <div className="sub">{c.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 랭킹(최신 데이터로 스냅샷) */}
        <section className="rank-section">
          <div className="section-head">
            <h2>랭킹</h2>
            <span className="muted">
              최근 트렌딩/핫플을 스냅샷으로{rankLoading ? " (불러오는 중…)" : ""}
            </span>
          </div>

          <div className="rank-two-col">
            <div className="panel">
              <div className="panel-head">
                <h3>최근 트렌딩 메뉴</h3>
                <button className="linkish" onClick={() => navigate("/rankingPage")}>
                  인사이트 보기 →
                </button>
              </div>
              <ol className="rank-list">
                {trendingMenus.map((d, i) => (
                  <li key={`${d.name}-${i}`} className="rank-item">
                    <span className="no">{i + 1}</span>
                    <span className="name">{d.name}</span>
                    <span className="meta">{d.meta}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>최근 핫한 거리</h3>
                <button className="linkish" onClick={() => navigate("/rankingPage")}>
                  인사이트 보기 →
                </button>
              </div>
              <ol className="rank-list">
                {hotRoadAreas.map((n, i) => (
                  <li key={`${n.name}-${i}`} className="rank-item">
                    <span className="no">{i + 1}</span>
                    <span className="name">{n.name}</span>
                    <span className="meta">{n.note}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </main>

      
      {/* ✅ 메인 추천 카페 클릭 시: 지도 팝업(PlacePopup) 그대로 띄우기 */}
      <PlacePopup open={!!openCafeId} place={popupPlace} onClose={() => setOpenCafeId(null)} />

    </div>
  );
}
