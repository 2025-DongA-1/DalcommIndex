import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import "../styles/Main.css";

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

  const trendingDesserts = useMemo(
    () => [
      { name: "크로플", delta: "+12%" },
      { name: "소금빵", delta: "+9%" },
      { name: "말차", delta: "+7%" },
      { name: "딸기 케이크", delta: "+6%" },
      { name: "휘낭시에", delta: "+5%" },
    ],
    []
  );

  const hotNeighborhoods = useMemo(
    () => [
      { name: "동명동", note: "감성/신상 카페" },
      { name: "상무지구", note: "작업/모임" },
      { name: "첨단", note: "대형 베이커리" },
      { name: "양림동", note: "산책/분위기" },
      { name: "담양", note: "드라이브/뷰" },
    ],
    []
  );

  const [region, setRegion] = useState(regionOptions[0].value);
  const [keyword, setKeyword] = useState("");

  const goSearch = (e) => {
  e.preventDefault();
  const q = keyword.trim();

  const params = new URLSearchParams();
  if (region !== "all") params.set("regions", region);
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
          onClick={() =>
            navigate(
              `/search?region=${encodeURIComponent(region)}&themes=${encodeURIComponent(c.key)}`
            )
          }
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

        {/* 랭킹(기존 유지, 사이즈만 정리) */}
        <section className="rank-section">
          <div className="section-head">
            <h2>랭킹</h2>
            <span className="muted">최근 트렌딩/핫플을 스냅샷으로</span>
          </div>

          <div className="rank-two-col">
            <div className="panel">
              <div className="panel-head">
                <h3>최근 트렌딩 디저트</h3>
                <button className="linkish" onClick={() => navigate("/rankingPage")}>
                  인사이트 보기 →
                </button>
              </div>
              <ol className="rank-list">
                {trendingDesserts.map((d, i) => (
                  <li key={d.name} className="rank-item">
                    <span className="no">{i + 1}</span>
                    <span className="name">{d.name}</span>
                    <span className="meta">{d.delta}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>최근 핫한 동네</h3>
                <button className="linkish" onClick={() => navigate("/rankingPage")}>
                  인사이트 보기 →
                </button>
              </div>
              <ol className="rank-list">
                {hotNeighborhoods.map((n, i) => (
                  <li key={n.name} className="rank-item">
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
