import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import "../styles/Search.css";





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

const DESSERT_OPTIONS = [
  "케이크",
  "마카롱",
  "말차",
  "소금빵",
  "크로플",
  "휘낭시에",
  "빙수",
  "푸딩",
];

// ✅ 임시 mock 데이터 (나중에 API로 교체)
const MOCK = [
  {
    id: 1,
    name: "스윗라운지",
    region: "dong-gu",
    neighborhood: "동명동",
    score: 87, // 달콤 인덱스(임의)
    rating: 4.6,
    reviewCount: 214,
    themes: ["photo", "dessert"],
    desserts: ["케이크", "말차", "휘낭시에"],
    thumb: "/main/dong-gu.jpg",
    why: ["말차 진함", "크림 밸런스", "자연광 포토존"],
    excerpt: "말차 향이 진하고 크림이 무겁지 않아서 계속 먹게 돼요…",
  },
  {
    id: 2,
    name: "베이크하우스 197",
    region: "gwangsan-gu",
    neighborhood: "수완지구",
    score: 82,
    rating: 4.4,
    reviewCount: 158,
    themes: ["study", "dessert"],
    desserts: ["소금빵", "크로플"],
    thumb: "/main/gwangsan-gu.jpg",
    why: ["좌석 넓음", "콘센트", "빵 라인업"],
    excerpt: "자리 넉넉하고 콘센트 많아서 작업하기 좋아요…",
  },
];

export default function Search() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();

  // URL -> 초기값
 const initialRegions = (sp.get("regions") ?? "").split(",").filter(Boolean);
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

  // ✅ URL 변경 시 폼 상태도 동기화 (뒤로가기/앞으로가기 대응)
  useEffect(() => {
    setRegions((sp.get("regions") ?? "").split(",").filter(Boolean));
    setQ(sp.get("q") ?? "");
    setSort(sp.get("sort") ?? "relevance");
    setThemes((sp.get("themes") ?? "").split(",").filter(Boolean));
    setDesserts((sp.get("desserts") ?? "").split(",").filter(Boolean));
  }, [sp]);

  const pushParams = (next) => {
    const params = new URLSearchParams();

    const nextRegions = next.regions ?? regions;
    const nextQ = (next.q ?? q).trim();
    const nextSort = next.sort ?? sort;
    const nextThemes = next.themes ?? themes;
    const nextDesserts = next.desserts ?? desserts;

    if (nextRegions?.length) params.set("regions", nextRegions.join(","));
    if (nextQ) params.set("q", nextQ);
    if (nextSort) params.set("sort", nextSort);
    if (nextThemes?.length) params.set("themes", nextThemes.join(","));
    if (nextDesserts?.length) params.set("desserts", nextDesserts.join(","));

    setSp(params, { replace: true });
  };

  const applySearch = (e) => {
    if (e) e.preventDefault();
    pushParams({});
  };

  // URL 변경 -> fetch (현재는 mock 필터링)
  useEffect(() => {
    setLoading(true);

    const urlRegions = (sp.get("regions") ?? "").split(",").filter(Boolean);
    const urlQ = (sp.get("q") ?? "").trim().toLowerCase();
    const urlSort = sp.get("sort") ?? "relevance";
    const urlThemes = (sp.get("themes") ?? "").split(",").filter(Boolean);
    const urlDesserts = (sp.get("desserts") ?? "").split(",").filter(Boolean);

    let arr = [...MOCK];

    if (urlRegions.length) {
  arr = arr.filter((x) => urlRegions.includes(x.region));
}
    
    if (urlQ) {
      arr = arr.filter((x) => {
        const hay = `${x.name} ${x.neighborhood} ${x.why.join(" ")} ${x.desserts.join(" ")}`.toLowerCase();
        return hay.includes(urlQ);
      });
    }

    if (urlThemes.length) {
      arr = arr.filter((x) => urlThemes.every((t) => x.themes.includes(t)));
    }

    if (urlDesserts.length) {
      arr = arr.filter((x) => urlDesserts.every((d) => x.desserts.includes(d)));
    }

    if (urlSort === "score") arr.sort((a, b) => b.score - a.score);
    if (urlSort === "rating") arr.sort((a, b) => b.rating - a.rating);
    if (urlSort === "reviews") arr.sort((a, b) => b.reviewCount - a.reviewCount);

    const t = setTimeout(() => {
      setResults(arr);
      setLoading(false);
    }, 200);

    return () => clearTimeout(t);
  }, [sp]);

const regionLabels = useMemo(() => {
  const rs = (sp.get("regions") ?? "").split(",").filter(Boolean);
  if (!rs.length) return ["전체"];

  return rs.map((v) => REGION_OPTIONS.find((o) => o.value === v)?.label || v);
}, [sp]);


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

    setRegions([]);          // 지역 체크 해제(= 전체)
    setQ("");
    setSort("relevance");
    setThemes([]);
    setDesserts([]);

    
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
  {regionLabels.map((label) => (
    <span key={label} className="pill">
      {label}
    </span>
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


            <label className="sr-field grow">
              <span className="sr-label">검색</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="카페명/동네/디저트 키워드"
              />
            </label>

            <label className="sr-field">
              <span className="sr-label">정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">관련도</option>
                <option value="score">달콤지수 높은 순</option>
                <option value="rating">평점 높은 순</option>
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

            {/* ✅ 지역 */}
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

    {/* 나머지 지역 */}
    {REGION_OPTIONS.filter((r) => r.value !== "all").map((r) => (
      <label key={r.value} className="check">
        <input
          type="checkbox"
          checked={regions.includes(r.value)}
          onChange={() => toggleRegion(r.value)}
        />
        <span>{r.label}</span>
      </label>
    ))}
  </div>
  </div>



          <div className="filter-block"></div>
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

            <button className="sr-btn" type="button" onClick={() => pushParams({})}>
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
            <div className="card-list">
              {results.map((x) => (
                <button
                  type="button"
                  key={x.id}
                  className="result-card"
                  onClick={() => navigate(`/cafe/${x.id}`)}
                >
                  <div className="thumb">
                    <img src={x.thumb} alt="" />
                  </div>

                  <div className="info">
                    <div className="row1">
                      <div className="name">{x.name}</div>
                      <div className="score">
                        <span className="badge">달콤지수</span>
                        <span className="score-num">{x.score}</span>
                      </div>
                    </div>

                    <div className="row2">
                      <span className="place">{x.neighborhood}</span>
                      <span className="dot">·</span>
                      <span className="meta">평점 {x.rating}</span>
                      <span className="dot">·</span>
                      <span className="meta">리뷰 {x.reviewCount}개</span>
                    </div>

                    <div className="why">
                      {x.why.slice(0, 3).map((w) => (
                        <span key={w} className="tag">
                          {w}
                        </span>
                      ))}
                    </div>

                    <div className="excerpt">“{x.excerpt}”</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
