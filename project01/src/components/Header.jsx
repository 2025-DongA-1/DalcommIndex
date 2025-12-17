import React from 'react'
import {Link, useNavigate} from 'react-router-dom'

const Header = ({showInfoBar = false}) => {
    const navigate = useNavigate()
  return (
    <>
      {/* 홈에서만 위 얇은 바 필요하면 showInfoBar={true}로 켜기 */}
      {showInfoBar && (
        <div className="top-info-bar">
          <span>디저트카페 탐색 · β 서비스</span>
          <a href="#" onClick={(e) => e.preventDefault()}>
            서비스 소개
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            문의하기
          </a>
        </div>
      )}

      <header className="topbar">
        {/* 로고 클릭 시 홈으로 */}
        <div className="logo" onClick={() => navigate("/")}>
          <div className="logo-mark"></div>
          <div>
            달콤 인덱스
            <div className="logo-sub">달콤한 리뷰를, 한눈에 인덱스</div>
          </div>
        </div>

        {/* 메뉴 */}
        <div className="top-nav">
          <Link to="/map">지도 검색</Link>
          <Link to="/chatbot">챗봇 추천</Link>

          <div className="top-actions">
            <button type="button" onClick={() => navigate("/login")}>
              로그인
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => navigate("/join")}
            >
              회원가입
            </button>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header


