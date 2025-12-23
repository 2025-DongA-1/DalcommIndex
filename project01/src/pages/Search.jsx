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

  // 폼 상태
  const [regions, setRegions] = useState(initialRegions);
  const [q, setQ] = useState(initialQ);
  const [sort, setSort] = useState(initialSort);
  const [themes, setThemes] = useState(initialThemes);
  const [desserts, setDesserts] = useState(initialDesserts);

  // 결과 상태
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

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

    const nextPage = next.page ?? 1;

    if (nextRegions?.length) params.set("region", nextRegions.join(","));
    if (nextQ) params.set("q", nextQ);
    if (nextSort) params.set("sort", nextSort);
    if (nextThemes?.length) params.set("themes", nextThemes.join(","));
    if (nextDesserts?.length) params.set("desserts", nextDesserts.join(","));

    if (nextPage > 1) params.set("page", String(nextPage));
    const nextKey = params.toString();
    if (nextKey !== spKey) {
      setSp(params, { replace: true });
    }
  };



  const applySearch = (e) => {
    if (e) e.preventDefault();
        pushParams({page: 1});
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

  

  const summaryQ = sp.get("q") ?? "";
  const count = results.length;

  const toggleTheme = (key) => {
    setThemes((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const toggleDessert = (name) => {
    setDesserts((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };
  

 const toggleRegion = (val) => {
  setRegions((prev) =>
    prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
  );
};

  const resetFilters = () => {
    // 지역/검색어는 유지하고, 필터/정렬만 초기화
    const keepRegions = regions;
    const keepQ = q;

    setRegions([]);          // 전체(=지역 선택 해제)
  setQ("");                // 검색어 제거
  setSort("relevance");    // 정렬 기본값
  setThemes([]);           // 테마 해제
  setDesserts([]);         // 디저트 해제

  // 2) URL 파라미터도 전부 삭제 (검색결과 상단 pill도 같이 초기화됨)
  setSp(new URLSearchParams(), { replace: true });


    
    setSort("relevance");
    setThemes([]);
    setDesserts([]);

    

    pushParams({
      regions: keepRegions,
      q: keepQ,
      sort: "relevance",
      themes: [],
      desserts: [],
    });
  };

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const startPage = Math.floor((page - 1) / 10) * 10 + 1;
const endPage = Math.min(startPage + 9, totalPages);

  const pagedResults = useMemo(() => {
  const start = (page - 1) * PAGE_SIZE;
  return results.slice(start, start + PAGE_SIZE);
  }, [results, page]);

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
              {regionPills.map((label) => (
                <span key={label} className="pill">{label}</span>
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
          <div className="box">
            <div className="box-head">
              <h2>필터</h2>
              <button className="linkish" type="button" onClick={resetFilters}>
                초기화
              </button>
            </div>

            <div className="filter-block">
                <div className="filter-title">지역</div>
                  <div className="check-list">
                    {/* 전체(= regions 비우기) */}
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={regions.length === 0}
                        onChange={() => setRegions([])}
                      />
                      <span>전체</span>
                    </label>

                    {REGION_OPTIONS.filter((o) => o.value !== "all").map((opt) => (
                      <label key={opt.value} className="check">
                        <input
                          type="checkbox"
                          checked={regions.includes(opt.value)}
                          onChange={() => toggleRegion(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>



          <div className="filter-block">
            <div className="filter-title">테마</div>
            <div className="check-list">
              {THEME_OPTIONS.map((t) => (
                <label key={t.key} className="check">
                  <input
                    type="checkbox"
                    checked={themes.includes(t.key)}
                    onChange={() => toggleTheme(t.key)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </div>

            <div className="filter-block">
              <div className="filter-title">디저트</div>
              <div className="chips">
                {DESSERT_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${desserts.includes(d) ? "on" : ""}`}
                    onClick={() => toggleDessert(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button className="sr-btn" type="button" onClick={() => pushParams({page: 1})}>
              필터 적용
            </button>
          </div>
        </aside>

        <section className="sr-results">
          {loading ? (
            <div className="skeleton-list">
              {[1, 2, 3].map((n) => (
                <div key={n} className="skeleton-card" />
              ))}
            </div>
          ) : results.length === 0 ? (
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
  