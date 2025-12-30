import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, useLocation, useNavigationType } from "react-router-dom";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import "../styles/Search.css";

const REGION_ALIAS_MAP = {
  // keys
  "dong-gu": "dong-gu",
  "nam-gu": "nam-gu",
  "buk-gu": "buk-gu",
  "seo-gu": "seo-gu",
  "gwangsan-gu": "gwangsan-gu",
  hwasun: "hwasun",
  damyang: "damyang",
  naju: "naju",

  // 한글/변형
  "광주동구": "dong-gu",
  "광주 동구": "dong-gu",
  동구: "dong-gu",

  "광주남구": "nam-gu",
  "광주 남구": "nam-gu",
  남구: "nam-gu",

  "광주북구": "buk-gu",
  "광주 북구": "buk-gu",
  북구: "buk-gu",

  "광주서구": "seo-gu",
  "광주 서구": "seo-gu",
  서구: "seo-gu",

  "광주광산구": "gwangsan-gu",
  "광주 광산구": "gwangsan-gu",
  광산구: "gwangsan-gu",

  화순: "hwasun",
  화순군: "hwasun",
  담양: "damyang",
  담양군: "damyang",
  나주: "naju",
  나주시: "naju",
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
  { value: "dong-gu", label: "광주 동구" },
  { value: "nam-gu", label: "광주 남구" },
  { value: "buk-gu", label: "광주 북구" },
  { value: "seo-gu", label: "광주 서구" },
  { value: "gwangsan-gu", label: "광주 광산구" },
  { value: "hwasun", label: "화순" },
  { value: "damyang", label: "담양" },
  { value: "naju", label: "나주" },
];

function fallbackThumb(regionKey) {
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
  if (lower.includes("file://") || lower.includes("file:/")) return fallbackThumb(regionKey);
  if (/^[a-zA-Z]:\\/.test(s)) return fallbackThumb(regionKey);

  return s;
}

function parseKeywords(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  if (/키워드\s*분석\s*중/.test(s)) return [];

  const cleaned = s
    .replace(/^[“”"']?\s*키워드\s*[:：]\s*/i, "")
    .replace(/[“”"']\s*$/, "")
    .trim();

  return cleaned
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ✅ Search 페이지(서버 목록)에서도 Sidebar 필터가 동일하게 동작하도록: "프론트에서" 매칭
// - 지도 페이지는 보통 프론트에서 tags 텍스트로 필터링하는데, Search는 서버에 파라미터를 넘기면 일부가 무시/불일치할 수 있음
const normalizeForMatch = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");

const tokenVariants = (token) => {
  const base = normalizeForMatch(token);
  if (!base) return [];
  // "콘센트/와이파이"처럼 묶인 토큰도 매칭되게 분해
  const parts = base.split(/[\/|·]/).filter(Boolean);
  return Array.from(new Set([base, ...parts]));
};

const pickArr = (v) => (Array.isArray(v) ? v : []);

const buildHayForMatch = (x) => {
  const chunks = [
    x?.name,
    x?.neighborhood,
    x?.excerpt,
    x?._address,
    x?._regionText,
    x?._oneshotText,
    pickArr(x?.why).join(" "),
    pickArr(x?.keywords).join(" "),
    pickArr(x?.atmosphere_tags).join(" "),
    pickArr(x?.menu_tags).join(" "),
    pickArr(x?.companion_tags).join(" "),
    pickArr(x?.required).join(" "),
    pickArr(x?.must).join(" "),
    pickArr(x?.purpose).join(" "),
    pickArr(x?.theme).join(" "),
    pickArr(x?.mood).join(" "),
    pickArr(x?.dessert).join(" "),
    pickArr(x?.themes).join(" "),
    pickArr(x?.desserts).join(" "),
  ];
  return normalizeForMatch(chunks.filter(Boolean).join(" "));
};

const matchAnyToken = (x, tokens) => {
  const list = (tokens || []).filter(Boolean);
  if (!list.length) return true;

  const hay = buildHayForMatch(x);
  if (!hay) return false;

  return list.some((t) => tokenVariants(t).some((v) => v && hay.includes(v)));
};

const applyClientFilters = (items, { themes, desserts, purposes, moods, musts }) => {
  const src = Array.isArray(items) ? items : [];
  return src.filter(
    (x) =>
      matchAnyToken(x, themes) &&
      matchAnyToken(x, desserts) &&
      matchAnyToken(x, purposes) &&
      matchAnyToken(x, moods) &&
      matchAnyToken(x, musts)
  );
};

// Sidebar region 확장값(동구/광주/광주광역시/코드 등) 중에서 Search API가 쓰는 code만 추출
const REGION_CODE_SET = new Set([
  "dong-gu",
  "nam-gu",
  "buk-gu",
  "seo-gu",
  "gwangsan-gu",
  "hwasun",
  "damyang",
  "naju",
]);

const toRegionCodesFromSidebarPrefs = (regionArr = []) => {
  const out = [];
  for (const r of Array.isArray(regionArr) ? regionArr : []) {
    const norm = normalizeRegionToken(r);
    if (REGION_CODE_SET.has(norm) && !out.includes(norm)) out.push(norm);
  }
  return out;
};

export default function Search() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const spKey = sp.toString();

  // ✅ 서버 요청 파라미터는 region/q/sort만 사용(나머지 Sidebar 필터는 프론트에서 적용)
  // - Search 페이지에서 purpose/moods/must/themes/desserts를 서버로 넘기면(또는 토큰이 완전히 일치하지 않으면) 일부 필터가 "안 먹는" 현상이 생길 수 있음
  const serverFetchKey = useMemo(() => {
    const paramsIn = new URLSearchParams(spKey);
    const urlRegions = parseList(paramsIn.get("region"));
    const urlQ = (paramsIn.get("q") ?? "").trim();
    const urlSort = paramsIn.get("sort") ?? "relevance";

    const params = new URLSearchParams();
    if (urlRegions.length) params.set("region", urlRegions.join(","));
    if (urlQ) params.set("q", urlQ);
    if (urlSort) params.set("sort", urlSort);

    return params.toString();
  }, [spKey]);


  const location = useLocation();
  const navType = useNavigationType();

  // 스크롤 복원용
  const scrollKey = useMemo(() => `di:scroll:search:${location.search}`, [location.search]);
  const scrollYRef = useRef(0);
  const leavingRef = useRef(false);
  const restoredRef = useRef(false);

  // URL -> state 초기
  const [regions, setRegions] = useState(parseList(sp.get("region")));
  const [q, setQ] = useState(sp.get("q") ?? "");
  const sortRaw = sp.get("sort") ?? "relevance";
  const [sort, setSort] = useState(sortRaw === "score" ? "relevance" : sortRaw);

  // ✅ Sidebar(source token) 기반 필터값을 URL에서 그대로 관리
  const [themes, setThemes] = useState((sp.get("themes") ?? "").split(",").filter(Boolean));
  const [desserts, setDesserts] = useState((sp.get("desserts") ?? "").split(",").filter(Boolean));
  const [purposes, setPurposes] = useState((sp.get("purpose") ?? "").split(",").filter(Boolean));
  const [moods, setMoods] = useState((sp.get("moods") ?? "").split(",").filter(Boolean));
  const [musts, setMusts] = useState((sp.get("must") ?? "").split(",").filter(Boolean));

  const [page, setPage] = useState(Math.max(1, Number(sp.get("page") || 1)));

  // 결과 상태
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  // ✅ 스크롤 추적
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

  // ✅ URL 변경 시 폼 상태도 동기화
  useEffect(() => {
    const params = new URLSearchParams(spKey);

    setRegions(parseList(params.get("region")));
    setQ(params.get("q") ?? "");

    const nextSortRaw = params.get("sort") ?? "relevance";
    setSort(nextSortRaw === "score" ? "relevance" : nextSortRaw);

    setThemes((params.get("themes") ?? "").split(",").filter(Boolean));
    setDesserts((params.get("desserts") ?? "").split(",").filter(Boolean));
    setPurposes((params.get("purpose") ?? "").split(",").filter(Boolean));
    setMoods((params.get("moods") ?? "").split(",").filter(Boolean));
    setMusts((params.get("must") ?? "").split(",").filter(Boolean));

    setPage(Math.max(1, Number(params.get("page") || 1)));
  }, [spKey]);

  const pushParams = (next) => {
    const params = new URLSearchParams();

    const nextRegions = next.regions ?? regions;
    const nextQ = String(next.q ?? q).trim();
    const nextSort = next.sort ?? sort;

    const nextThemes = next.themes ?? themes;
    const nextDesserts = next.desserts ?? desserts;
    const nextPurposes = next.purposes ?? purposes;
    const nextMoods = next.moods ?? moods;
    const nextMusts = next.musts ?? musts;

    const nextPage = next.page ?? 1;

    if (nextRegions?.length) params.set("region", nextRegions.join(","));
    if (nextQ) params.set("q", nextQ);
    if (nextSort) params.set("sort", nextSort);

    if (nextThemes?.length) params.set("themes", nextThemes.join(","));
    if (nextDesserts?.length) params.set("desserts", nextDesserts.join(","));
    if (nextPurposes?.length) params.set("purpose", nextPurposes.join(","));
    if (nextMoods?.length) params.set("moods", nextMoods.join(","));
    if (nextMusts?.length) params.set("must", nextMusts.join(","));

    if (nextPage > 1) params.set("page", String(nextPage));

    const nextKey = params.toString();
    if (nextKey !== spKey) setSp(params, { replace: true });
  };

  const applySearch = (e) => {
    if (e) e.preventDefault();
    // 검색은 q/sort만 갱신(필터는 Sidebar에서 "검색" 눌러야 URL로 반영)
    pushParams({ page: 1, q, sort });
  };

  // ✅ /api/cafes 호출은 "서버가 확실히 이해하는" 파라미터만 사용 (region/q/sort)
//    나머지 Sidebar 필터(purpose/moods/must/themes/desserts)는 아래에서 프론트 필터로 적용
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const data = await apiFetch(`/api/cafes${serverFetchKey ? `?${serverFetchKey}` : ""}`);

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
  }, [serverFetchKey]);


  // ✅ 뒤로/앞으로(POP)로 돌아왔을 때: 클릭했던 카드 위치로 복원 (1회)
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
        el.scrollIntoView({ block: "center" });
        restoredRef.current = true;
        return;
      }

      tries += 1;
      if (tries < 120) {
        requestAnimationFrame(tick);
        return;
      }

      restoredRef.current = true;
    };

    requestAnimationFrame(tick);
  }, [navType, loading, location.search, results.length, page]);

  // ✅ Sidebar -> Search(URL) 변환
  const handleSidebarSearch = (prefs) => {
    const nextRegions = toRegionCodesFromSidebarPrefs(prefs?.region);

    const nextThemes = Array.isArray(prefs?.theme) ? prefs.theme : [];
    const nextDesserts = Array.isArray(prefs?.dessert) ? prefs.dessert : [];
    const nextPurposes = Array.isArray(prefs?.purpose) ? prefs.purpose : [];
    const nextMoods = Array.isArray(prefs?.mood) ? prefs.mood : [];
    const nextMusts = Array.isArray(prefs?.must) ? prefs.must : [];

    pushParams({
      page: 1,
      regions: nextRegions,
      themes: nextThemes,
      desserts: nextDesserts,
      purposes: nextPurposes,
      moods: nextMoods,
      musts: nextMusts,
      q,
      sort,
    });
  };

  const resetFilters = () => {
    setRegions([]);
    setThemes([]);
    setDesserts([]);
    setPurposes([]);
    setMoods([]);
    setMusts([]);
    setQ("");
    setSort("relevance");
    setPage(1);

    if (spKey !== "") {
      setSp(new URLSearchParams(), { replace: true });
    }
  };

  // Sidebar 선택 복구용(현재 URL 상태를 initialPrefs로 제공)
  const sidebarInitialPrefs = useMemo(() => {
    return {
      region: regions,
      theme: themes,
      dessert: desserts,
      purpose: purposes,
      mood: moods,
      must: musts,

      // 호환 키(복구 안정화)
      atmosphere: [...themes, ...moods],
      menu: desserts,
      required: musts,

      atmosphere_tags: [...themes, ...moods],
      menu_tags: desserts,
      companion_tags: purposes,
    };
  }, [regions, themes, desserts, purposes, moods, musts]);

  const filteredResults = useMemo(
    () => applyClientFilters(results, { themes, desserts, purposes, moods, musts }),
    [results, themes, desserts, purposes, moods, musts]
  );

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const startPage = Math.floor((page - 1) / 10) * 10 + 1;
  const endPage = Math.min(startPage + 9, totalPages);

  const pagedResults = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredResults.slice(start, start + PAGE_SIZE);
  }, [filteredResults, page]);

  const goPage = (p) => {
    const next = Math.min(Math.max(1, p), totalPages);
    pushParams({ page: next });
  };

  const regionSummary = useMemo(() => {
    if (!regions.length) return "전체";
    return regions
      .map((v) => REGION_OPTIONS.find((x) => x.value === v)?.label ?? v)
      .join(", ");
  }, [regions]);

  const summaryQ = sp.get("q") ?? "";
  const count = filteredResults.length;

  return (
    <div className="sr-page">
      <Header showInfoBar={false} />

      {/* 상단: 검색 조건 바 */}
      <section className="sr-topbar">
        <div className="sr-container">
          <div className="sr-title">
            <h1>검색 결과</h1>
            <p className="sr-summary">
              <span className="pill">{regionSummary}</span>
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
            <label className="sr-field grow">
              <span className="sr-label">검색</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="카페명/주소/키워드" />
            </label>

            <label className="sr-field">
              <span className="sr-label">정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">관련도</option>
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
        {/* ✅ 필터: Sidebar.jsx 1:1 사용 */}
        <aside className="sr-filters">
          <Sidebar
            isOpen={true}
            toggleSidebar={() => {}}
            showClose={false}
            initialPrefs={sidebarInitialPrefs}
            onReset={resetFilters}
            onSearch={handleSidebarSearch}
          />
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

                      sessionStorage.setItem(scrollKey, String(scrollYRef.current));
                      sessionStorage.setItem("di:lastFocus", JSON.stringify({ search: location.search, id: x.id }));

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

                  <button type="button" disabled={startPage === 1} onClick={() => goPage(startPage - 1)}>
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

                  <button type="button" disabled={endPage === totalPages} onClick={() => goPage(endPage + 1)}>
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
