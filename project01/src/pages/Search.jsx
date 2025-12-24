import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, useLocation, useNavigationType } from "react-router-dom";
import Header from "../components/Header";
import "../styles/Search.css";



const REGION_ALIAS_MAP = {
  // keys
  "dong-gu": "dong-gu",
  "nam-gu": "nam-gu",
  "buk-gu": "buk-gu",
  "seo-gu": "seo-gu",
  "gwangsan-gu": "gwangsan-gu",
  "hwasun": "hwasun",
  "damyang": "damyang",
  "naju": "naju",

  // 한글/변형
  "광주동구": "dong-gu",
  "광주 동구": "dong-gu",
  "동구": "dong-gu",

  "광주남구": "nam-gu",
  "광주 남구": "nam-gu",
  "남구": "nam-gu",

  "광주북구": "buk-gu",
  "광주 북구": "buk-gu",
  "북구": "buk-gu",

  "광주서구": "seo-gu",
  "광주 서구": "seo-gu",
  "서구": "seo-gu",

  "광주광산구": "gwangsan-gu",
  "광주 광산구": "gwangsan-gu",
  "광산구": "gwangsan-gu",

  "화순군": "hwasun",
  "담양군": "damyang",
  "나주시": "naju",
};

const normalizeRegionToken = (x) => {
  const t = String(x ?? "").trim();
  if (!t) return "";
  if (t === "all") return "all";

  if (REGION_ALIAS_MAP[t]) return REGION_ALIAS_MAP[t];
  const noSpace = t.replace(/\s/g, "");
  if (REGION_ALIAS_MAP[noSpace]) return REGION_ALIAS_MAP[noSpace];

  return t;
};

const parseList = (v) =>
  (v ?? "")
    .split(",")
    .map(normalizeRegionToken)
    .filter(Boolean)
    .filter((x) => x !== "all");

const PAGE_SIZE = 10;

const API_BASE = import.meta.env.VITE_API_BASE || "";


async function apiFetch(path, { method = "GET", body } = {}) {
  const token = localStorage.getItem("accessToken");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "요청 실패");
    err.status = res.status;
    throw err;
  }
  return data;
}

const REGION_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "dong-gu", label: "광주 동구" },
  { value: "nam-gu", label: "광주 남구" },
  { value: "buk-gu", label: "광주 북구" },
  { value: "seo-gu", label: "광주 서구" },
  { value: "gwangsan-gu", label: "광주 광산구" },
  { value: "hwasun", label: "화순" },
  { value: "damyang", label: "담양" },
  { value: "naju", label: "나주" },
];

const THEME_OPTIONS = [
  { key: "dessert", label: "디저트 맛집" },
  { key: "photo", label: "사진/포토존" },
  { key: "study", label: "공부/작업" },
  { key: "date", label: "데이트" },
  { key: "family", label: "가족/아이" },
  { key: "cake", label: "주문 케이크" },
];

const DESSERT_OPTIONS = ["케이크", "마카롱", "말차", "소금빵", "크로플", "휘낭시에", "빙수", "푸딩"];

function fallbackThumb(regionKey) {
  // 기존 Search MOCK에서 쓰던 이미지 경로와 맞춤
  if (regionKey === "dong-gu") return "/main/dong-gu.jpg";
  if (regionKey === "nam-gu") return "/main/namgu.png";
  if (regionKey === "buk-gu") return "/main/bukgu.jpg";
  if (regionKey === "seo-gu") return "/main/seogu.jpg";
  if (regionKey === "gwangsan-gu") return "/main/gwangsan.jpg";
  if (regionKey === "hwasun") return "/main/hwasun.jpg";
  if (regionKey === "damyang") return "/main/damyang.jpg";
  if (regionKey === "naju") return "/main/naju.jpg";
  return "/main/gwangsan-gu.jpg";
}

function normalizeThumb(src, regionKey) {
  const s0 = String(src ?? "");
  const s = s0.replace(/^\uFEFF/, "").trim(); // BOM 제거
  const lower = s.toLowerCase();

  if (!s || s === "\\N" || lower === "null") return fallbackThumb(regionKey);

  // file://, file:/ 변형까지 방어 (대소문자 포함)
  if (lower.includes("file://") || lower.includes("file:/")) return fallbackThumb(regionKey);
  // 윈도우 절대경로(C:\...) 방어
  if (/^[a-zA-Z]:\\/.test(s)) return fallbackThumb(regionKey);

  return s;
}

function parseKeywords(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return [];

  // "키워드 분석 중" 같은 placeholder는 제외
  if (/키워드\s*분석\s*중/.test(s)) return [];

  // 앞의 "키워드:" 제거 + 양끝 따옴표(일반/스마트쿼트) 제거
  const cleaned = s
    .replace(/^[“”"']?\s*키워드\s*[:：]\s*/i, "")
    .replace(/[“”"']\s*$/, "")
    .trim();

  // 쉼표로 분리
  return cleaned
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ✅ 방문 목적(추가)
const PURPOSE_OPTIONS = [
  { key: "date", label: "데이트", aliases: ["데이트", "커플", "연인"] },
  { key: "study", label: "공부·작업(콘센트, 와이파이)", aliases: ["공부", "작업", "콘센트", "와이파이", "wifi", "wi-fi", "노트북"] },
  { key: "family", label: "가족·아이", aliases: ["가족", "아이", "키즈", "유아", "아기"] },
  { key: "solo", label: "혼카페", aliases: ["혼카페", "혼자"] },
  { key: "group", label: "모임(단체석)", aliases: ["모임", "단체", "단체석", "회식"] },
  { key: "anniversary", label: "기념일(예약, 홀케이크)", aliases: ["기념일", "예약", "홀케이크", "생일", "파티"] },
];

// ✅ 분위기(추가)
const MOOD_OPTIONS = [
  { key: "quiet", label: "조용한", aliases: ["조용", "조용한", "차분", "정숙"] },
  { key: "emotional", label: "감성", aliases: ["감성", "무드", "분위기"] },
  { key: "photo", label: "사진 잘 나오는", aliases: ["사진", "포토", "포토존", "인생샷"] },
  { key: "spacious", label: "넓은·쾌적", aliases: ["넓", "넓은", "쾌적", "공간", "좌석 많"] },
  { key: "cozy", label: "아늑한", aliases: ["아늑", "포근", "따뜻"] },
  { key: "hip", label: "힙한", aliases: ["힙", "트렌디", "감각", "핫플"] },
  { key: "vintage", label: "빈티지", aliases: ["빈티지", "레트로"] },
  { key: "view", label: "뷰맛집(야외/루프탑)", aliases: ["뷰", "야외", "루프탑", "테라스", "경치"] },
];

const MOOD_MAP = Object.fromEntries(MOOD_OPTIONS.map((o) => [o.key, o]));

const matchesMood = (cafe, key) => {
  const opt = MOOD_MAP[key];
  if (!opt) return true;

  const hay = [
    cafe?.name,
    cafe?.address,
    cafe?.excerpt,
    ...(Array.isArray(cafe?.why) ? cafe.why : []),
    ...(Array.isArray(cafe?.keywords) ? cafe.keywords : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return opt.aliases.some((w) => hay.includes(String(w).toLowerCase()));
};

const filterByMoods = (items, moods) => {
  if (!moods?.length) return items;
  return items.filter((cafe) => moods.every((m) => matchesMood(cafe, m)));
};

// ✅ 편의 조건(필수 조건, 추가)
const MUST_OPTIONS = [
  { key: "parking", label: "주차 가능", aliases: ["주차", "주차가능", "주차 가능"] },
  { key: "noKids", label: "노키즈존", aliases: ["노키즈", "노키즈존"] },
  { key: "pet", label: "반려동물 동반", aliases: ["반려동물", "애견", "펫", "동반"] },
  { key: "outlet", label: "콘센트", aliases: ["콘센트", "전원", "멀티탭"] },
  { key: "wifi", label: "와이파이", aliases: ["와이파이", "wifi", "wi-fi"] },
  { key: "reservation", label: "예약 가능", aliases: ["예약", "예약가능", "예약 가능"] },
  { key: "group", label: "단체 가능", aliases: ["단체", "단체석", "단체가능", "단체 가능"] },
];

const MUST_MAP = Object.fromEntries(MUST_OPTIONS.map((o) => [o.key, o]));

const matchesMust = (cafe, key) => {
  const opt = MUST_MAP[key];
  if (!opt) return true;

  const hay = [
    cafe?.name,
    cafe?.address,
    cafe?.excerpt,
    ...(Array.isArray(cafe?.why) ? cafe.why : []),
    ...(Array.isArray(cafe?.keywords) ? cafe.keywords : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return opt.aliases.some((w) => hay.includes(String(w).toLowerCase()));
};

const filterByMusts = (items, musts) => {
  if (!musts?.length) return items;
  return items.filter((cafe) => musts.every((m) => matchesMust(cafe, m)));
};


const PURPOSE_MAP = Object.fromEntries(PURPOSE_OPTIONS.map((o) => [o.key, o]));

const extractPurposesFromText = (text = "") => {
  const t = String(text).toLowerCase();
  return PURPOSE_OPTIONS
    .filter((opt) => opt.aliases.some((w) => t.includes(String(w).toLowerCase())))
    .map((opt) => opt.key);
};

const stripPurposeWordsFromText = (text = "") => {
  let out = String(text);
  for (const opt of PURPOSE_OPTIONS) {
    for (const w of opt.aliases) {
      const escaped = String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(escaped, "gi"), " ");
    }
  }
  return out.replace(/\s+/g, " ").trim();
};

const matchesPurpose = (cafe, key) => {
  const opt = PURPOSE_MAP[key];
  if (!opt) return true;

  const hay = [
    cafe?.name,
    cafe?.address,
    cafe?.excerpt,
    ...(Array.isArray(cafe?.why) ? cafe.why : []),
    ...(Array.isArray(cafe?.keywords) ? cafe.keywords : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return opt.aliases.some((w) => hay.includes(String(w).toLowerCase()));
};

const filterByPurposes = (items, purposes) => {
  if (!purposes?.length) return items;
  return items.filter((cafe) => purposes.every((p) => matchesPurpose(cafe, p)));
};



export default function Search() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const pageFromUrl = Math.max(1, Number(sp.get("page") || 1));
  const [page, setPage] = useState(pageFromUrl);
  const spKey = sp.toString();

   const location = useLocation();
  const navType = useNavigationType();

  // 검색 쿼리(=같은 검색조건)별로 스크롤 저장 키
  const scrollKey = useMemo(() => `di:scroll:search:${location.search}`, [location.search]);

  // 픽셀 저장(계속 sessionStorage에 쓰지 않고 ref에만 저장)
  const scrollYRef = useRef(0);
  const leavingRef = useRef(false);
  const restoredRef = useRef(false);

  // URL -> 초기값
  const initialRegions = parseList(sp.get("region"));
  const initialQ = sp.get("q") ?? "";
  const initialSort = sp.get("sort") ?? "relevance"; // relevance | score | rating | reviews
  const initialThemes = (sp.get("themes") ?? "").split(",").filter(Boolean);
  const initialDesserts = (sp.get("desserts") ?? "").split(",").filter(Boolean);
  const initialMoods = (sp.get("moods") ?? "").split(",").filter(Boolean);
const initialMusts = (sp.get("must") ?? "").split(",").filter(Boolean);

const [moods, setMoods] = useState(initialMoods);
const [musts, setMusts] = useState(initialMusts);

const initialPurposes = (sp.get("purpose") ?? "").split(",").filter(Boolean);
const [purposes, setPurposes] = useState(initialPurposes);


  // 폼 상태
  const [regions, setRegions] = useState(initialRegions);
  const [q, setQ] = useState(initialQ);
  const [sort, setSort] = useState(initialSort);
  const [themes, setThemes] = useState(initialThemes);
  const [desserts, setDesserts] = useState(initialDesserts);

  // 결과 상태
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

// ✅ 숫자만 바꾸기 위한 "미리보기 개수"
const [previewCount, setPreviewCount] = useState(null);
const [previewLoading, setPreviewLoading] = useState(false);

// ✅ state(현재 선택값) -> querystring 만들기 (page 제외)
const buildQueryKey = ({ regions, q, sort, themes, desserts, moods, musts, purposes }) => {
  const p = new URLSearchParams();
  if (regions?.length) p.set("region", regions.join(","));
  if ((q ?? "").trim()) p.set("q", (q ?? "").trim());
  if (sort) p.set("sort", sort);
  if (themes?.length) p.set("themes", themes.join(","));
  if (desserts?.length) p.set("desserts", desserts.join(","));
  if (moods?.length) p.set("moods", moods.join(","));
  if (musts?.length) p.set("must", musts.join(","));
  if (purposes?.length) p.set("purpose", purposes.join(",")); // ✅ 방문목적
  return p.toString();
};


// ✅ URL(spKey)에서 page 제거한 appliedKey
const appliedKeyNoPage = useMemo(() => {
  const p = new URLSearchParams(spKey);
  p.delete("page");
  return p.toString();
}, [spKey]);

// ✅ state 기준 draftKey
const draftKeyNoPage = useMemo(() => {
  return buildQueryKey({ regions, q, sort, themes, desserts, moods, musts, purposes });
}, [regions, q, sort, themes, desserts, moods, musts, purposes]);

// ✅ 지금 선택값이 "적용된 값"과 다른가?
const isDraft = draftKeyNoPage !== appliedKeyNoPage;



   // ✅ 현재 스크롤을 ref로만 추적 (뒤로가기 복원용)
  useEffect(() => {
    leavingRef.current = false;
    scrollYRef.current = window.scrollY || 0;

    const onScroll = () => {
      if (leavingRef.current) return;
      scrollYRef.current = window.scrollY || 0;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrollKey]);

  // ✅ URL 변경 시 폼 상태도 동기화 (뒤로가기/앞으로가기 대응)
  // useEffect(() => {
  //   setRegions(parseList(sp.get("region")));
  //   setQ(sp.get("q") ?? "");
  //   setSort(sp.get("sort") ?? "relevance");
  //   setThemes((sp.get("themes") ?? "").split(",").filter(Boolean));
  //   setDesserts((sp.get("desserts") ?? "").split(",").filter(Boolean));
  // }, [sp]);

  useEffect(() => {
    const params = new URLSearchParams(spKey);

    setRegions(parseList(params.get("region")));
    setQ(params.get("q") ?? "");
    setSort(params.get("sort") ?? "relevance");
    setThemes((params.get("themes") ?? "").split(",").filter(Boolean));
    setDesserts((params.get("desserts") ?? "").split(",").filter(Boolean));
    

      setMoods((params.get("moods") ?? "").split(",").filter(Boolean));
  setMusts((params.get("must") ?? "").split(",").filter(Boolean));
  setPurposes((params.get("purpose") ?? "").split(",").filter(Boolean));
    setPage(Math.max(1, Number(params.get("page") || 1)));
  }, [spKey]);
    
  // const pushParams = (next) => {
  //   const params = new URLSearchParams();

  //   const nextRegions = next.regions ?? regions;
  //   const nextQ = (next.q ?? q).trim();
  //   const nextSort = next.sort ?? sort;
  //   const nextThemes = next.themes ?? themes;
  //   const nextDesserts = next.desserts ?? desserts;

  //   if (nextRegions?.length) params.set("region", nextRegions.join(",")); 
  //   if (nextQ) params.set("q", nextQ);
  //   if (nextSort) params.set("sort", nextSort);
  //   if (nextThemes?.length) params.set("themes", nextThemes.join(","));
  //   if (nextDesserts?.length) params.set("desserts", nextDesserts.join(","));

  //   setSp(params, { replace: true });
  // };

  const pushParams = (next) => {
    const params = new URLSearchParams();

    const nextRegions = next.regions ?? regions;
    const nextQ = (next.q ?? q).trim();
    const nextSort = next.sort ?? sort;
    const nextThemes = next.themes ?? themes;
    const nextDesserts = next.desserts ?? desserts;

      const nextMoods = next.moods ?? moods;
  const nextMusts = next.musts ?? musts;
  const nextPurposes = next.purposes ?? purposes;
    const nextPage = next.page ?? 1;

    if (nextRegions?.length) params.set("region", nextRegions.join(","));
    if (nextQ) params.set("q", nextQ);
    if (nextSort) params.set("sort", nextSort);
    if (nextThemes?.length) params.set("themes", nextThemes.join(","));
    if (nextDesserts?.length) params.set("desserts", nextDesserts.join(","));

    if (nextMoods?.length) params.set("moods", nextMoods.join(","));
  if (nextMusts?.length) params.set("must", nextMusts.join(","));
    if (nextPurposes?.length) params.set("purpose", nextPurposes.join(","));

    if (nextPage > 1) params.set("page", String(nextPage));
    const nextKey = params.toString();
    if (nextKey !== spKey) {
      setSp(params, { replace: true });
    }
  };

  



const applySearch = (e) => {
  if (e) e.preventDefault();

  // 1) q에서 방문목적 키워드 추출
  const extracted = extractPurposesFromText(q);

  // 2) 기존 선택 + 추출 합치기(중복 제거)
  const nextPurposes = Array.from(new Set([...(purposes || []), ...extracted]));

  // 3) 방문목적 단어는 q에서 제거 (원치 않으면 이 줄은 빼셔도 됩니다)
  const nextQ = stripPurposeWordsFromText(q);

  setPurposes(nextPurposes);
  setQ(nextQ);

  pushParams({ page: 1, q: nextQ, purposes: nextPurposes });
};

  // ✅ URL 변경 -> DB API 호출
  useEffect(() => {
    let alive = true;

    const paramsIn = new URLSearchParams(spKey);
    const urlRegions = parseList(paramsIn.get("region"));
    const urlQ = (paramsIn.get("q") ?? "").trim();
    const urlSort = paramsIn.get("sort") ?? "relevance";
    const urlThemes = (paramsIn.get("themes") ?? "").split(",").filter(Boolean);
    const urlDesserts = (paramsIn.get("desserts") ?? "").split(",").filter(Boolean);

    (async () => {
      try {
        setLoading(true);

        const params = new URLSearchParams();
        if (urlRegions.length) params.set("region", urlRegions.join(","));
        if (urlQ) params.set("q", urlQ);
        if (urlSort) params.set("sort", urlSort);
        if (urlThemes.length) params.set("themes", urlThemes.join(","));
        if (urlDesserts.length) params.set("desserts", urlDesserts.join(","));

        const qs = params.toString();
        const data = await apiFetch(`/api/cafes${qs ? `?${qs}` : ""}`);

        if (!alive) return;

        const items = Array.isArray(data.items) ? data.items : [];
        const normalized = items.map((x) => ({
          ...x,
          thumb: normalizeThumb(x.thumb, x.region),
          rating: x.rating ?? null,
          reviewCount: x.reviewCount ?? 0,
          why: Array.isArray(x.why) ? x.why : [],
          excerpt: x.excerpt || "",
          keywords: parseKeywords(x.excerpt),  
          neighborhood: x.neighborhood || "",
          score: Number(x.score || 0) || 0,
        }));

        setResults(normalized);
      } catch (e) {
        if (!alive) return;
        setResults([]);
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [spKey]);

  // ✅ 선택(state)이 바뀌면 "개수만" 미리보기로 갱신 (리스트는 안 바꿈)
useEffect(() => {
  let alive = true;

  // draft가 아니면(=적용값과 같으면) 미리보기 끔
  if (!isDraft) {
    setPreviewCount(null);
    setPreviewLoading(false);
    return;
  }

  // 입력/클릭 연타 대비 debounce
  const t = setTimeout(async () => {
    try {
      setPreviewLoading(true);

      const qs = draftKeyNoPage;
      const data = await apiFetch(`/api/cafes${qs ? `?${qs}` : ""}`);

      if (!alive) return;
     const items = Array.isArray(data.items) ? data.items : [];

const normalized = items.map((x) => ({
  ...x,
  thumb: normalizeThumb(x.thumb, x.region),
  rating: x.rating ?? null,
  reviewCount: x.reviewCount ?? 0,
  why: Array.isArray(x.why) ? x.why : [],
  excerpt: x.excerpt || "",
  keywords: parseKeywords(x.excerpt),
  neighborhood: x.neighborhood || "",
  score: Number(x.score || 0) || 0,
}));

const previewFiltered = filterByPurposes(normalized, purposes);
setPreviewCount(previewFiltered.length);
    } catch (e) {
      if (!alive) return;
      setPreviewCount(null);
      console.error(e);
    } finally {
      if (alive) setPreviewLoading(false);
    }
  }, 200);

  return () => {
    alive = false;
    clearTimeout(t);
  };
}, [draftKeyNoPage, isDraft]);



   // ✅ 뒤로/앞으로(POP)로 돌아왔을 때: 클릭했던 카드 위치로 복원 (1회만)
// ✅ 뒤로/앞으로(POP)로 돌아왔을 때: 클릭했던 카드 위치로 복원 (1회만)
useEffect(() => {
  if (navType !== "POP") {
    restoredRef.current = false;
    return;
  }
  if (restoredRef.current) return;
  if (loading) return;

  let focus = null;
  try {
    const raw = sessionStorage.getItem("di:lastFocus");
    focus = raw ? JSON.parse(raw) : null;
  } catch {}

  const focusId = focus && focus.search === location.search ? focus.id : null;
  if (!focusId) return;

  let tries = 0;
  const tick = () => {
    const el = document.querySelector(`[data-cafe-id="${String(focusId)}"]`);
    if (el) {
      // ✅ 헤더 때문에 너무 위에 붙으면 start 대신 center가 더 자연스러움
      el.scrollIntoView({ block: "center" });
      restoredRef.current = true;
      return;
    }

    tries += 1;
    if (tries < 120) {
      requestAnimationFrame(tick); // 약 2초 정도 기다림
      return;
    }

    // 끝까지 못 찾으면(데이터가 바뀌었거나) 그냥 종료
    restoredRef.current = true;
  };

  requestAnimationFrame(tick);
}, [navType, loading, location.search, results.length, page]);



const regionPills = useMemo(() => {
  const rs = parseList(sp.get("region"));
  if (!rs.length) return ["전체"];

  return rs.map((v) => REGION_OPTIONS.find((x) => x.value === v)?.label ?? v);
}, [spKey]); // spKey 추천(지금 구조랑 맞음)

const appliedPurposes = useMemo(
  () => (sp.get("purpose") ?? "").split(",").filter(Boolean),
  [spKey]
);

const appliedMoods = useMemo(
  () => (sp.get("moods") ?? "").split(",").filter(Boolean),
  [spKey]
);

const appliedMusts = useMemo(
  () => (sp.get("must") ?? "").split(",").filter(Boolean),
  [spKey]
);


const filteredResults = useMemo(() => {
  let out = results;
  out = filterByPurposes(out, appliedPurposes);
  out = filterByMoods(out, appliedMoods);
  out = filterByMusts(out, appliedMusts);
  return out;
}, [results, appliedPurposes, appliedMoods, appliedMusts]);
 const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));

  const startPage = Math.floor((page - 1) / 10) * 10 + 1;
const endPage = Math.min(startPage + 9, totalPages);

const pagedResults = useMemo(() => {
  const start = (page - 1) * PAGE_SIZE;
  return filteredResults.slice(start, start + PAGE_SIZE);
}, [filteredResults, page]);

  const summaryQ = sp.get("q") ?? "";
const count = isDraft
  ? (previewLoading ? "..." : (previewCount ?? filteredResults.length))
  : filteredResults.length;



// ✅ Sidebar처럼 "선택된 필터" 표시용 라벨
const regionLabel = (value) =>
  REGION_OPTIONS.find((o) => o.value === value)?.label ?? value;

const purposeLabel = (key) =>
  PURPOSE_OPTIONS.find((o) => o.key === key)?.label ?? key;

const themeLabel = (key) =>
  THEME_OPTIONS.find((o) => o.key === key)?.label ?? key;


  // ✅ 검색결과 상단(전체 pill 자리)에 보여줄 "선택된 필터 칩"들
const summaryChips = useMemo(() => {
  const chips = [];

  // 지역(선택 없으면 '전체'는 pill로만 보여줄 거라 chips엔 안 넣음)
  regions.forEach((v) => {
    const label = REGION_OPTIONS.find((o) => o.value === v)?.label ?? v;
    chips.push({ group: "지역", value: v, label });
  });

  // 테마
  themes.forEach((k) => {
    const label = THEME_OPTIONS.find((t) => t.key === k)?.label ?? k;
    chips.push({ group: "테마", value: k, label });
  });
  
  // 방문목적
   purposes.forEach((k) => {
    const label = purposeLabel(k);
    chips.push({ group: "방문 목적", value: k, label });
  });

  // 분위기
moods.forEach((k) => {
  const label = MOOD_OPTIONS.find((o) => o.key === k)?.label ?? k;
  chips.push({ group: "분위기", value: k, label });
});

// 편의 조건
musts.forEach((k) => {
  const label = MUST_OPTIONS.find((o) => o.key === k)?.label ?? k;
  chips.push({ group: "편의 조건", value: k, label });
});

  // 디저트
  desserts.forEach((d) => {
    chips.push({ group: "디저트", value: d, label: d });
  });

  return chips;
}, [regions, themes, purposes, desserts]);

const removeSummaryChip = (chip) => {
  const nextRegions =
    chip.group === "지역" ? regions.filter((v) => v !== chip.value) : regions;
  const nextThemes =
    chip.group === "테마" ? themes.filter((v) => v !== chip.value) : themes;
   const nextPurposes =
    chip.group === "방문 목적" ? purposes.filter((v) => v !== chip.value) : purposes;
    const nextDesserts =
    chip.group === "디저트" ? desserts.filter((v) => v !== chip.value) : desserts;
   const nextMoods =
    chip.group === "분위기" ? moods.filter((v) => v !== chip.value) : moods;
    const nextMusts =
   chip.group === "편의 조건" ? musts.filter((v) => v !== chip.value) : musts;
  
   // 1) UI 상태 즉시 반영
  setRegions(nextRegions);
  setThemes(nextThemes);
  setPurposes(nextPurposes); 
  setDesserts(nextDesserts);
  setMoods(nextMoods);
  setMusts(nextMusts);

  // 2) URL도 같이 갱신해서 "검색 결과"가 바로 바뀌게
  pushParams({
    page: 1,
    regions: nextRegions,
    themes: nextThemes,
    purposes: nextPurposes,
    desserts: nextDesserts,
    moods: nextMoods,
    musts: nextMusts,
  });
};


  const toggleTheme = (key) => {
    setThemes((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const toggleDessert = (name) => {
    setDesserts((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  const togglePurpose = (key) => {
  setPurposes((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
};
  


// ✅ 선택 여부
const hasSelection = regions.length + themes.length + desserts.length > 0;

// ✅ 선택된 칩 리스트(상단에 '선택된 필터가 없습니다' / 칩들 표시)
const activeChips = useMemo(() => {
  const chips = [];
  regions.forEach((v) => chips.push({ group: "지역", value: v, label: regionLabel(v) }));
  themes.forEach((v) => chips.push({ group: "테마", value: v, label: themeLabel(v) }));
  desserts.forEach((v) => chips.push({ group: "디저트", value: v, label: v }));
  return chips;
}, [regions, themes, desserts]);

// ✅ 칩 클릭 시 해제
const removeChip = (chip) => {
  if (chip.group === "지역") setRegions((p) => p.filter((x) => x !== chip.value));
  if (chip.group === "테마") setThemes((p) => p.filter((x) => x !== chip.value));
  if (chip.group === "디저트") setDesserts((p) => p.filter((x) => x !== chip.value));
};

// ✅ Sidebar 스타일 칩 버튼(클래스만 Sidebar와 동일하게 씀)
const ChipButton = ({ selected, onClick, children }) => (
  <button
    type="button"
    className={`filter-chip-wrap ${selected ? "is-selected" : ""}`}
    onClick={onClick}
    aria-pressed={selected}
  >
    <div className="filter-chip-inner">
      <div className="filter-chip-text">{children}</div>
    </div>
  </button>
);



 const toggleRegion = (val) => {
  setRegions((prev) =>
    prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
  );
};

const resetFilters = () => {
  // 1) 필터/검색어/정렬/페이지 전부 초기화 (UI 상태)
  setRegions([]);
  setThemes([]);
  setDesserts([]);
  setMoods([]);
  setMusts([]);
  setQ("");
  setSort("relevance");
  setPage(1);

  // 2) 미리보기 카운트도 초기화
  setPreviewCount(null);
  setPreviewLoading(false);

  // 3) 초기화 누르는 즉시 스켈레톤 보여주기 (빈 화면 방지)
  setLoading(true);

  // 4) URL 파라미터를 싹 비움 -> spKey="" -> useEffect([spKey])가 돌면서
  //    /api/cafes 로 호출되고 "전체 결과"로 results가 다시 채워짐
  setSp(new URLSearchParams(), { replace: true });
  setPurposes([]);
};





 
  

  const goPage = (p) => {
  const next = Math.min(Math.max(1, p), totalPages);
  pushParams({ page: next }); // URL도 같이 변경
  };

  return (
    <div className="sr-page">
      <Header showInfoBar={false} />

      {/* 상단: 검색 조건 바 */}
      <section className="sr-topbar">
        <div className="sr-container">
          <div className="sr-title">
            <h1>검색 결과</h1>
         <p className="sr-summary">
  {/* 지역 선택이 하나도 없으면 '전체'만 pill로 표시 */}
  {regions.length === 0 && <span className="pill">전체</span>}

  {/* ✅ 선택된 필터는 전부 ✕ 있는 칩으로 표시 */}
  {summaryChips.map((chip) => (
    <button
      key={`${chip.group}-${chip.value}`}
      type="button"
      className="active-filter-chip"
      onClick={() => removeSummaryChip(chip)}
      title="클릭하면 해제됩니다"
    >
      <span className="chip-group">{chip.group}</span>
      <span className="chip-value">{chip.label}</span>
      <span className="chip-x">✕</span>
    </button>
  ))}

  {summaryQ ? (
    <>
      <span className="dot">·</span>
      <span className="pill">“{summaryQ}”</span>
    </>
  ) : null}

  <span className="dot">·</span>
  <span className="count">{count}개</span>
</p>

          </div>

          <form className="sr-search" onSubmit={applySearch}>
            {/* <label className="sr-field">
              <span className="sr-label">지역</span>
              <select value={regions} onChange={(e) => setRegions(e.target.value)}>
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label> */}

            <label className="sr-field grow">
              <span className="sr-label">검색</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="카페명/주소/키워드"
              />
            </label>

            <label className="sr-field">
              <span className="sr-label">정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">관련도</option>
                <option value="score">달콤지수 높은 순</option>
                <option value="reviews">리뷰 많은 순</option>
              </select>
            </label>

            <button className="sr-btn primary" type="submit">
              검색
            </button>
          </form>
        </div>
      </section>

      {/* 본문: 필터 + 결과 */}
      <main className="sr-container sr-body">
<aside className="sr-filters">
  <div className="sidebar-layout">
    <div className="sidebar-content-wrap">
      {/* ✅ 1) 필터 헤더(사이드바 스타일) */}
      <div className="sidebar-header">
        <div className="filter-title-group">
          <div className="icon">🧁</div>
          <div className="text">필터</div>
        </div>

        <div className="filter-actions-group">
          <button type="button" className="filter-reset-btn" onClick={resetFilters}>
            초기화
          </button>
        </div>
      </div>

     
      {/* ✅ 3) 지역(체크박스 → 칩) */}
      <div className="filter-group">
        <div className="filter-group-title">
          <div className="text">지역</div>
        </div>

        <div className="filter-options-container region-group">
          {/* "전체"는 기존 로직 유지: regions 비우기 */}
          <ChipButton selected={regions.length === 0} onClick={() => setRegions([])}>
            전체
          </ChipButton>

          {REGION_OPTIONS.filter((o) => o.value !== "all").map((opt) => (
            <ChipButton
              key={opt.value}
              selected={regions.includes(opt.value)}
              onClick={() => toggleRegion(opt.value)}
            >
              {opt.label}
            </ChipButton>
          ))}
        </div>
      </div>

      {/* ✅ 4) 테마(체크박스 → 칩) */}
      <div className="filter-group">
        <div className="filter-group-title">
          <div className="text">테마</div>
        </div>

        <div className="filter-options-container">
          {THEME_OPTIONS.map((t) => (
            <ChipButton
              key={t.key}
              selected={themes.includes(t.key)}
              onClick={() => toggleTheme(t.key)}
            >
              {t.label}
            </ChipButton>
          ))}
        </div>
      </div>

      {/* ✅ 방문 목적(새로 추가) */}
<div className="filter-group">
  <div className="filter-group-title">
    <div className="text">방문 목적</div>
  </div>

  <div className="filter-options-container">
    {PURPOSE_OPTIONS.map((p) => (
      <ChipButton
        key={p.key}
        selected={purposes.includes(p.key)}
        onClick={() => togglePurpose(p.key)}
      >
        {p.label}
      </ChipButton>
    ))}
  </div>
</div>

<div className="filter-group">
  <div className="filter-group-title">
    <div className="text">분위기</div>
  </div>

  <div className="filter-options-container">
    {MOOD_OPTIONS.map((m) => (
      <ChipButton
        key={m.key}
        selected={moods.includes(m.key)}
        onClick={() =>
          setMoods((prev) => (prev.includes(m.key) ? prev.filter((x) => x !== m.key) : [...prev, m.key]))
        }
      >
        {m.label}
      </ChipButton>
    ))}
  </div>
</div>


<div className="filter-group">
  <div className="filter-group-title">
    <div className="text">편의 조건(필수)</div>
  </div>

  <div className="filter-options-container">
    {MUST_OPTIONS.map((m) => (
      <ChipButton
        key={m.key}
        selected={musts.includes(m.key)}
        onClick={() =>
          setMusts((prev) => (prev.includes(m.key) ? prev.filter((x) => x !== m.key) : [...prev, m.key]))
        }
      >
        {m.label}
      </ChipButton>
    ))}
  </div>
</div>



      {/* ✅ 5) 디저트(기존 버튼이 이미 칩이라 Sidebar 클래스만 적용) */}
      <div className="filter-group">
        <div className="filter-group-title">
          <div className="text">디저트</div>
        </div>

        <div className="filter-options-container">
          {DESSERT_OPTIONS.map((d) => (
            <ChipButton
              key={d}
              selected={desserts.includes(d)}
              onClick={() => toggleDessert(d)}
            >
              {d}
            </ChipButton>
          ))}
        </div>
      </div>
    </div>

    {/* ✅ 6) 하단 고정 버튼(필터 적용 → Sidebar처럼) */}
    <div className="sidebar-footer">
      <button
        type="button"
        className="sidebar-search-btn"
        onClick={applySearch}
        title="선택한 필터로 검색"
      >
        <span className="icon">🔍</span>
        <span className="text">검색</span>
      </button>
    </div>
  </div>
</aside>


        <section className="sr-results">
          {loading ? (
            <div className="skeleton-list">
              {[1, 2, 3].map((n) => (
                <div key={n} className="skeleton-card" />
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="empty">
              <div className="empty-title">결과가 없습니다</div>
              <div className="empty-sub">키워드를 줄이거나, 지역/필터를 풀어보세요.</div>
              <button className="sr-btn primary" onClick={() => navigate("/")}>
                메인으로
              </button>
            </div>
          ) : (
            <>
            <div className="card-list">
              {pagedResults.map((x) => (
                <button
                  type="button"
                  key={x.id}
                  data-cafe-id={x.id}
                  className="result-card"
                  onClick={() => {
                    leavingRef.current = true;

                      // 현재 픽셀 저장
                    sessionStorage.setItem(scrollKey, String(scrollYRef.current));

                      // 클릭한 카드 id 저장(핵심)
                      sessionStorage.setItem(
                       "di:lastFocus",
                         JSON.stringify({ search: location.search, id: x.id })
                          );

                          navigate(`/cafe/${x.id}`);
                           }}
>
                  <div className="thumb">
                    <img
                      src={x.thumb}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = fallbackThumb(x.region);
                      }}
                    />
                  </div>

                  <div className="info">
                    <div className="row1">
                      <div className="name">{x.name}</div>
                      <div className="score">
                        <span className="badge">달콤지수</span>
                        <span className="score-num">{Math.round(x.score)}</span>
                      </div>
                    </div>

                    <div className="row2">
                      <span className="place">{x.neighborhood || "지역 정보"}</span>
                      <span className="dot">·</span>
                      <span className="meta">리뷰 {x.reviewCount}개</span>
                      {x.rating != null && Number(x.rating) > 0 ? (
                        <>
                          <span className="dot">·</span>
                          <span className="meta">평점 {Number(x.rating).toFixed(1)}</span>
                        </>
                      ) : null}
                    </div>

                    <div className="why">
                      {Array.from(new Set([...(x.why || []), ...(x.keywords || [])]))
                        .slice(0, 8)
                        .map((w) => (
                          <span key={w} className="tag">
                            {w}
                          </span>
                        ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
  <div className="sr-pagination">
    <button type="button" disabled={page === 1} onClick={() => goPage(page - 1)}>
      이전
    </button>

    
  {/* ✅ 2) « : 10개 단위(이전 묶음) */}
  <button
    type="button"
    disabled={startPage === 1}
    onClick={() => goPage(startPage - 1)}
  >
    «
  </button>

    {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((p) => (

      <button
        key={p}
        type="button"
        className={p === page ? "on" : ""}
        onClick={() => goPage(p)}
      >
        {p}
      </button>
    ))}

      <button
    type="button"
    disabled={endPage === totalPages}
    onClick={() => goPage(endPage + 1)}
  >
    »
  </button>

    <button type="button" disabled={page === totalPages} onClick={() => goPage(page + 1)}>
      다음
    </button>
  </div>
)}
</>       
   )}
        </section>
      </main>
    </div>
  );
  
}
  