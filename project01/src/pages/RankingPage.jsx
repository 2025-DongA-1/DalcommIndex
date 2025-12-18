import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header"; // ← (폴더 위치에 따라 경로만 조정)

const DESSERT_TREND = [
  { name: "크로플", delta: 12 },
  { name: "소금빵", delta: 9 },
  { name: "말차", delta: 7 },
  { name: "딸기 케이크", delta: 6 },
  { name: "휘낭시에", delta: 5 },
];

const HOT_AREAS = [
  { name: "동명동", meta: "감성/신상 카페" },
  { name: "상무지구", meta: "작업/모임" },
  { name: "첨단", meta: "대형 베이커리" },
  { name: "양림동", meta: "산책/분위기" },
  { name: "담양", meta: "드라이브/뷰" },
];

const CAFE_RANK = [
  { name: "카페 하루", area: "나주", meta: "조용/디저트/주차", score: 92 },
  { name: "인스틸 커피", area: "나주", meta: "감성/케이크", score: 89 },
  { name: "욘더스콘", area: "나주", meta: "스콘/사진", score: 86 },
  { name: "데일리박스", area: "나주", meta: "베이커리/주차", score: 84 },
];

function Drawer({ open, title, onClose, children }) {
  return (
    <div
      className={`rkpg-overlay ${open ? "is-open" : ""}`}
      onMouseDown={onClose}
    >
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

export default function RankingPage() {
  const navigate = useNavigate();

  const [period, setPeriod] = useState("monthly"); // daily | weekly | monthly
  const [region, setRegion] = useState("all");
  const [sort, setSort] = useState("score");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [selectedName, setSelectedName] = useState("");

  const periodLabel = useMemo(() => {
    if (period === "daily") return "오늘";
    if (period === "weekly") return "주간";
    return "월간";
  }, [period]);

  const cafesSorted = useMemo(() => {
    const arr = [...CAFE_RANK];
    if (sort === "score") arr.sort((a, b) => b.score - a.score);
    if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [sort]);

  const openInsight = (title, name = "") => {
    setDrawerTitle(title);
    setSelectedName(name);
    setDrawerOpen(true);
  };

  return (
    <div className="rkpg-page">
      {/* ✅ 공용 헤더 사용 */}
      <Header />

      <main className="page-main">
        {/* 페이지 헤더(필터바) */}
        <div className="rkpg-head">
          <div>
            <div className="rkpg-title">랭킹</div>
            <div className="rkpg-sub">
              {periodLabel} 트렌딩/핫플을 한눈에 확인해보세요.
            </div>
          </div>

          <div className="rkpg-filters">
            <div className="rkpg-seg">
              <button
                className={period === "daily" ? "is-active" : ""}
                onClick={() => setPeriod("daily")}
              >
                오늘
              </button>
              <button
                className={period === "weekly" ? "is-active" : ""}
                onClick={() => setPeriod("weekly")}
              >
                주간
              </button>
              <button
                className={period === "monthly" ? "is-active" : ""}
                onClick={() => setPeriod("monthly")}
              >
                월간
              </button>
            </div>

            <select
              className="rkpg-select"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="지역 선택"
            >
              <option value="all">전체</option>
              <option value="gwangju">광주</option>
              <option value="naju">나주</option>
              <option value="damyang">담양</option>
              <option value="jangseong">장성</option>
              <option value="hwasun">화순</option>
            </select>

            <select
              className="rkpg-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="정렬 선택"
            >
              <option value="score">종합점수</option>
              <option value="name">이름순</option>
            </select>
          </div>
        </div>

        {/* (기존 style.css의 rank-* 스타일 재사용) */}
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
                {DESSERT_TREND.map((it, idx) => (
                  <li
                    key={it.name}
                    className="rank-item rkpg-click"
                    onClick={() => openInsight(`${it.name} 인사이트`, it.name)}
                  >
                    <div className="rank-num">{idx + 1}</div>
                    <div className="rank-main">
                      <div className="rank-name">{it.name}</div>
                      <div className="rank-meta">증가율 +{it.delta}%</div>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                className="rank-more-btn"
                onClick={() => openInsight(`${periodLabel} 트렌딩 디저트 인사이트`)}
              >
                인사이트 보기 →
              </button>
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
                {HOT_AREAS.map((it, idx) => (
                  <li
                    key={it.name}
                    className="rank-item rkpg-click"
                    onClick={() => openInsight(`${it.name} 인사이트`, it.name)}
                  >
                    <div className="rank-num">{idx + 1}</div>
                    <div className="rank-main">
                      <div className="rank-name">{it.name}</div>
                      <div className="rank-meta">{it.meta}</div>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                className="rank-more-btn"
                onClick={() => openInsight(`${periodLabel} 핫한 동네 인사이트`)}
              >
                인사이트 보기 →
              </button>
            </div>
          </div>
        </section>

        {/* 카페 랭킹 */}
        <section className="rkpg-cafe">
          <div className="rkpg-cafe-head">
            <div className="rkpg-cafe-title">카페 랭킹</div>
            <button
              className="rank-more-btn rkpg-mini"
              onClick={() => openInsight("카페 랭킹 인사이트")}
            >
              인사이트 보기 →
            </button>
          </div>

          <div className="rkpg-cafe-grid">
            {cafesSorted.map((c, idx) => (
              <div key={c.name} className="rkpg-cafe-card">
                <div className="rkpg-cafe-top">
                  <div className="rkpg-badge">{idx + 1}</div>
                  <div>
                    <div className="rkpg-cafe-name">{c.name}</div>
                    <div className="rkpg-cafe-meta">
                      {c.area} · {c.meta} · 점수 {c.score}
                    </div>
                  </div>
                </div>

                <div className="rkpg-cafe-actions">
                  <button
                    className="rkpg-btn"
                    onClick={() => openInsight(`${c.name} 인사이트`, c.name)}
                  >
                    상세/근거
                  </button>
                  <button
                    className="rkpg-btn primary"
                    onClick={() => navigate("/map")}
                  >
                    지도에서 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Drawer open={drawerOpen} title={drawerTitle} onClose={() => setDrawerOpen(false)}>
        <div className="rkpg-insight">
          <div className="rkpg-insight-row">
            <span>대상</span>
            <b>{selectedName || "전체"}</b>
          </div>
          <div className="rkpg-insight-row">
            <span>기간</span>
            <b>{periodLabel}</b>
          </div>
          <div className="rkpg-insight-box">
            <b>인사이트 영역(추후 DB/분석 연결)</b>
            <div className="rkpg-insight-ul">
              • 최근 추이 그래프<br />
              • 함께 언급된 키워드 TOP<br />
              • 관련 카페 TOP 5
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
