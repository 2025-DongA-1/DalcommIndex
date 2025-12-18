// src/pages/Join.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from '../components/Header';

export default function Join() {
  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!name.trim() || !email.trim() || !pw.trim()) return setErr("필수 항목을 입력해주세요.");
    if (pw !== pw2) return setErr("비밀번호가 서로 일치하지 않습니다.");

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw, nickname: name,}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "회원가입 실패");

      // ✅ 가입 즉시 로그인
      localStorage.setItem("accessToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));      
      
      nav("/login");
    } catch (e2) {
      setErr("회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
     <div className="app-container">
      <Header />
    <main className="auth-main">
      <div className="card">
        <div className="card-title">회원가입</div>
        <div className="card-subtitle">간단한 정보 입력으로 가입할 수 있어요.</div>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>이름/닉네임</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 광진" />
          </div>

          <div className="form-group">
            <label>이메일</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
          </div>

          <div className="form-group">
            <label>비밀번호</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호" />
          </div>

          <div className="form-group">
            <label>비밀번호 확인</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="비밀번호 확인" />
          </div>

          {err && <div className="helper" style={{ color: "#d33" }}>{err}</div>}

          <button className="auth-submit-btn" disabled={loading}>
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <div className="bottom-text">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </div>
      </div>
    </main>
    </div>
  );
}
