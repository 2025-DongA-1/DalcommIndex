import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

const Header = ({ showInfoBar = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ 초기값을 localStorage에서 바로 읽어서 화면 깜빡임 방지
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem("accessToken");
  });

  // ✅ 라우트가 바뀔 때마다 로그인 상태 동기화
  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("accessToken"));
  }, [location.pathname]);

  return (
    <>
  

      <header className="topbar">
        {/* 로고 클릭 시 홈으로 */}
      <div className="logo" onClick={() => navigate("/")}>
  <img className="logo-mark" src="/logo_crop.png" alt="로고" />
  <div>
    <span className="logo-title">달콤 인덱스</span>
    <div className="logo-sub">달콤한 리뷰를, 한눈에 인덱스</div>
  </div>
</div>

        {/* 메뉴 */}
        <div className="top-nav">
          <Link to="/map">지도 검색</Link>
          <Link to="/chatbot">챗봇 추천</Link>

          <div className="top-actions">
            {!isLoggedIn ? (
              <>
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
              </>
            ) : (
              <>
              <button
                type="button"
                className="primary"
                onClick={() => navigate("/mypage")}
              >
                마이페이지
              </button>

              <button
                type="button"
                className="logout"
                onClick={() => {
                  localStorage.removeItem("accessToken");
                  localStorage.removeItem("user");
                  setIsLoggedIn(false); // ✅ 즉시 UI 반영
                  navigate("/"); // 원하시면 "/login"으로 바꿔도 됩니다.
                }}
              >
                로그아웃
              </button>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
