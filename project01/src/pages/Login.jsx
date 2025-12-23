// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";

export default function Login() {
  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const nav = useNavigate();

  // 공통
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // 로그인
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  // 비밀번호 재설정(간단 버전)
  const [view, setView] = useState("login"); // "login" | "reset"
  const [step, setStep] = useState(1); // reset: 1(이메일+닉) -> 2(새 비번)

  const [resetEmail, setResetEmail] = useState("");
  const [resetNickname, setResetNickname] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const clearMsgs = () => {
    setErr("");
    setInfo("");
  };

  // ✅ Kakao OAuth 콜백 처리
  // - 백엔드가 /login#token=...&provider=kakao 로 리다이렉트합니다.
  // - 여기서 token을 localStorage에 저장하고, /api/me로 사용자 정보를 받아 저장한 뒤 홈으로 이동합니다.
  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#")) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const oauthError = params.get("oauth_error");
    const token = params.get("token");

    // ✅ 에러가 넘어오면 메시지 표시 후 hash 정리
    if (oauthError && !token) {
      setErr(decodeURIComponent(oauthError));
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      return;
    }

    if (!token) return;

    // ✅ token 저장
    localStorage.setItem("accessToken", token);

    const decodeJwtPayload = (t) => {
      try {
        const part = t.split(".")[1];
        if (!part) return null;
        const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(json);
      } catch {
        return null;
      }
    };

    // ✅ 사용자 정보 저장(/api/me). 실패하더라도 최소 payload로 저장 후 이동
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data?.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
        } else {
          const p = decodeJwtPayload(token);
          if (p) localStorage.setItem("user", JSON.stringify(p));
        }
      } catch {
        const p = decodeJwtPayload(token);
        if (p) localStorage.setItem("user", JSON.stringify(p));
      } finally {
        // hash 제거(새로고침 시 재처리 방지)
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        nav("/");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, nav]);

  const onSubmitLogin = async (e) => {
    e.preventDefault();
    clearMsgs();

    if (!email.trim() || !pw.trim()) return setErr("이메일과 비밀번호를 입력해주세요.");

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "로그인 실패");

      localStorage.setItem("accessToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      nav("/");
    } catch {
      setErr("로그인에 실패했습니다. 입력값을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ (Kakao OAuth) 로그인 시작
  const onKakaoStart = () => {
    clearMsgs();
    if (!API_BASE) {
      setErr("VITE_API_BASE가 설정되어 있지 않습니다. (예: http://localhost:3000)");
      return;
    }
    window.location.href = `${API_BASE}/auth/kakao/start`;
  };

  const goReset = () => {
    clearMsgs();
    setView("reset");
    setStep(1);
    setResetEmail(email || "");
    setResetNickname("");
    setNewPw("");
    setNewPw2("");
  };

  const goLogin = () => {
    clearMsgs();
    setView("login");
    setStep(1);
  };

  const onGoStep2 = (e) => {
    e.preventDefault();
    clearMsgs();

    if (!resetEmail.trim() || !resetNickname.trim()) {
      return setErr("이메일과 닉네임을 입력해주세요.");
    }
    setStep(2);
  };

  const onResetPassword = async (e) => {
    e.preventDefault();
    clearMsgs();

    if (!newPw.trim()) return setErr("새 비밀번호를 입력해주세요.");
    if (newPw !== newPw2) return setErr("새 비밀번호가 서로 일치하지 않습니다.");

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE}/auth/password/reset-simple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail,
          nickname: resetNickname,
          newPassword: newPw,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "재설정 실패");

      setInfo("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.");

      // 로그인 화면 복귀 + 이메일 자동 채우기
      setEmail(resetEmail);
      setPw("");
      setView("login");
      setStep(1);
    } catch (e2) {
      setErr(e2.message || "비밀번호 재설정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Header />

      <main className="auth-main">
        <div className="card">
          <div className="card-title">{view === "login" ? "로그인" : "비밀번호 재설정"}</div>
          <div className="card-subtitle">
            {view === "login"
              ? "달콤 인덱스 서비스를 이용하려면 로그인해주세요."
              : step === 1
              ? "이메일과 닉네임을 입력하면 새 비밀번호를 설정할 수 있습니다."
              : "새 비밀번호를 입력해주세요."}
          </div>

          {view === "login" ? (
            <form onSubmit={onSubmitLogin}>
              <div className="form-group">
                <label>이메일</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                />
              </div>

              <div className="form-group">
                <label>비밀번호</label>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="비밀번호"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  type="button"
                  onClick={goReset}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#666",
                    textDecoration: "underline",
                  }}
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>

              {err && <div className="helper" style={{ color: "#d33" }}>{err}</div>}
              {info && <div className="helper" style={{ color: "#2d7" }}>{info}</div>}

              <button className="auth-submit-btn" disabled={loading}>
                {loading ? "로그인 중..." : "로그인"}
              </button>
            </form>
          ) : (
            <>
              {step === 1 ? (
                <form onSubmit={onGoStep2}>
                  <div className="form-group">
                    <label>이메일</label>
                    <input
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="example@email.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>닉네임</label>
                    <input
                      value={resetNickname}
                      onChange={(e) => setResetNickname(e.target.value)}
                      placeholder="가입 시 닉네임"
                    />
                  </div>

                  {err && <div className="helper" style={{ color: "#d33" }}>{err}</div>}
                  {info && <div className="helper" style={{ color: "#2d7" }}>{info}</div>}

                  <button className="auth-submit-btn" disabled={loading}>
                    다음
                  </button>

                  <div className="bottom-text" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={goLogin}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#666" }}
                    >
                      로그인으로 돌아가기
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={onResetPassword}>
                  <div className="form-group">
                    <label>새 비밀번호</label>
                    <input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="새 비밀번호"
                    />
                  </div>

                  <div className="form-group">
                    <label>새 비밀번호 확인</label>
                    <input
                      type="password"
                      value={newPw2}
                      onChange={(e) => setNewPw2(e.target.value)}
                      placeholder="새 비밀번호 확인"
                    />
                  </div>

                  {err && <div className="helper" style={{ color: "#d33" }}>{err}</div>}
                  {info && <div className="helper" style={{ color: "#2d7" }}>{info}</div>}

                  <button className="auth-submit-btn" disabled={loading}>
                    {loading ? "변경 중..." : "비밀번호 변경"}
                  </button>

                  <div className="bottom-text" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        clearMsgs();
                        setStep(1);
                        setNewPw("");
                        setNewPw2("");
                      }}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#666", marginRight: 10 }}
                    >
                      이전
                    </button>

                    <button
                      type="button"
                      onClick={goLogin}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "#666" }}
                    >
                      로그인으로 돌아가기
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {view === "login" && (
            <div className="bottom-text">
              아직 회원이 아니신가요? <Link to="/join">회원가입</Link>
            </div>
          )}
          
          {/* ✅ Kakao 로그인 (MVP) */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                <div style={{ flex: 1, height: 1, background: "#eee" }} />
                <div style={{ fontSize: 12, color: "#999" }}>또는</div>
                <div style={{ flex: 1, height: 1, background: "#eee" }} />
              </div>

              <button
                type="button"
                onClick={onKakaoStart}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "#FEE500",
                  color: "#191919",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                카카오로 계속하기
              </button>
</div>
        </div>
      </main>
    </div>
  );
}
