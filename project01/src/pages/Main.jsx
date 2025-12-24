import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
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

  // ✅ 형님이 사진 넣을 자리: img 경로만 교체하면 됨
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
      { key: "cake", title: "주문 케이크", sub: "픽업·예약", img: "/main/cake.jpg" },
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

  const [trendingMenus, setTrendingMenus] = useState(fallbackTrending);
  const [hotRoadAreas, setHotRoadAreas] = useState(fallbackHot);
  const [rankLoading, setRankLoading] = useState(false);

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

  const [region, setRegion] = useState(regionOptions[0].value);
  const [keyword, setKeyword] = useState("");

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
              {["감성", "조용함", "포토존", "주문케이크", "비건", "가족"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  onClick={() => navigate(`/search?region=${encodeURIComponent(region)}&q=${encodeURIComponent(t)}`)}
                >
                  #{t}
                </button>
              ))}
            </div>
          </form>
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
                  onClick={() => navigate(`/search?region=${encodeURIComponent(region)}&themes=${encodeURIComponent(c.key)}`)}
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
    </div>
  );
}
