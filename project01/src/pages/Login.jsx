// src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from '../components/Header';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!email.trim() || !pw.trim()) return setErr("이메일과 비밀번호를 입력해주세요.");

    try {
      setLoading(true);
      // TODO: API 연동 (예: await api.post("/auth/login", { email, password: pw }))
      // 성공 시 토큰/유저 저장 -> nav("/map")
      nav("/map");
    } catch (e2) {
      setErr("로그인에 실패했습니다. 입력값을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Header />

      <main className="auth-main">
        <div className="card">
          <div className="card-title">로그인</div>
          <div className="card-subtitle">달콤 인덱스 서비스를 이용하려면 로그인해주세요.</div>

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label>이메일</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
            </div>

            <div className="form-group">
              <label>비밀번호</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호" />
            </div>

            {err && <div className="helper" style={{ color: "#d33" }}>{err}</div>}

            <button className="auth-submit-btn" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="bottom-text">
            아직 회원이 아니신가요? <Link to="/join">회원가입</Link>
          </div>
        </div>
    </main>
    </div>
    
  );
}
