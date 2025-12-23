// src/pages/Mypage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";

const TABS = [
  { key: "profile", label: "회원정보 수정" },
  { key: "favorites", label: "즐겨찾기" },
  { key: "reviews", label: "리뷰 내역" },
  { key: "settings", label: "설정" },
];

const API_BASE = import.meta.env.VITE_API_BASE || "";
const FAVORITES_EVENT = "dalcomm_favorites_changed"; // ✅ 수정: 이벤트명 통일

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

function normalizeTab(v) {
  const key = String(v || "");
  return TABS.some((t) => t.key === key) ? key : "profile";
}

export default function Mypage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromUrl = normalizeTab(searchParams.get("tab"));
  const [tab, setTab] = useState(tabFromUrl);

  useEffect(() => {
    const next = normalizeTab(searchParams.get("tab"));
    if (next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTabAndUrl = (nextKey) => {
    const next = normalizeTab(nextKey);
    setTab(next);

    const sp = new URLSearchParams(searchParams);
    if (next === "profile") sp.delete("tab");
    else sp.set("tab", next);

    setSearchParams(sp, { replace: true });
  };

  const [loading, setLoading] = useState(false);

  const [globalMsg, setGlobalMsg] = useState({ type: "", text: "" });
  const [user, setUser] = useState(null);

  const [profileForm, setProfileForm] = useState({
    nickname: "",
    region: "광주",
    newPassword: "",
    newPasswordConfirm: "",
  });
  const [profileMsg, setProfileMsg] = useState({ type: "", text: "" });

  const [favorites, setFavorites] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState({ marketing: false, profilePublic: true });

  const setInfo = (text) => setGlobalMsg({ type: "info", text });
  const setError = (text) => setGlobalMsg({ type: "error", text });
  const clearMsg = () => setGlobalMsg({ type: "", text: "" });

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      nav("/login");
      return;
    }
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    if (tab === "favorites") loadFavorites();
    if (tab === "reviews") loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  /**
   * ✅ 수정: 즐겨찾기 변경 이벤트를 받으면 DB에서 다시 로드
   * (PlacePopup/CafeDetail에서 즐겨찾기 추가/삭제 후 dispatch)
   */
  useEffect(() => {
    if (tab !== "favorites") return;

    const handler = () => loadFavorites();
    window.addEventListener(FAVORITES_EVENT, handler);
    return () => window.removeEventListener(FAVORITES_EVENT, handler);
  }, [tab, user]); // user 포함(로그인/세션 바뀔 때 안전)

  const loadMe = async () => {
    clearMsg();
    try {
      setLoading(true);
      const data = await apiFetch("/api/me");
      setUser(data.user);
      setSettings(data.settings);

      setProfileForm((p) => ({
        ...p,
        nickname: data.user?.nickname || "",
        region: data.user?.region || "광주",
      }));
    } catch (e) {
      if (e?.status === 401 || e?.status === 403) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        nav("/login");
        return;
      }
      setError(e?.message || "마이페이지 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ 수정: 즐겨찾기 로딩을 서버(/api/me/favorites) 기준으로 통일
   */
  const loadFavorites = async () => {
    clearMsg();
    try {
      setLoading(true);
      const data = await apiFetch("/api/me/favorites");

      const items =
        Array.isArray(data.items) ? data.items : Array.isArray(data.favorites) ? data.favorites : [];

      const normalized = items.map((x) => {
        const id = x.id ?? x.cafe_id ?? x.cafeId;
        return {
          ...x,
          id,
          cafe_id: id,
          tags: Array.isArray(x.tags) ? x.tags : [],
        };
      });

      setFavorites(normalized);
    } catch (e) {
      setError(e?.message || "즐겨찾기 불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    clearMsg();
    try {
      setLoading(true);
      const data = await apiFetch("/api/me/reviews");
      setReviews(data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onSaveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: "", text: "" });
    clearMsg();

    if (!profileForm.nickname.trim()) {
      return setProfileMsg({ type: "error", text: "닉네임을 입력해주세요." });
    }

    if (profileForm.newPassword || profileForm.newPasswordConfirm) {
      if (profileForm.newPassword.length < 8) {
        return setProfileMsg({ type: "error", text: "새 비밀번호는 8자 이상을 권장합니다." });
      }
      if (profileForm.newPassword !== profileForm.newPasswordConfirm) {
        return setProfileMsg({ type: "error", text: "새 비밀번호가 서로 일치하지 않습니다." });
      }
    }

    try {
      setLoading(true);
      const data = await apiFetch("/api/me", {
        method: "PUT",
        body: {
          nickname: profileForm.nickname,
          region: profileForm.region,
          newPassword: profileForm.newPassword || "",
        },
      });

      if (data.token) localStorage.setItem("accessToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setUser(data.user);
      setProfileForm((p) => ({ ...p, newPassword: "", newPasswordConfirm: "" }));
      setProfileMsg({ type: "info", text: "회원정보가 저장되었습니다." });
    } catch (e2) {
      setProfileMsg({ type: "error", text: e2.message || "저장 실패" });
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ 수정: 즐겨찾기 제거도 서버 기준으로 통일
   */
  const onRemoveFavorite = async (id) => {
    clearMsg();
    try {
      setLoading(true);
      await apiFetch(`/api/me/favorites/${encodeURIComponent(String(id))}`, { method: "DELETE" });
      await loadFavorites();

      // 다른 화면(팝업 버튼 상태 등)도 동기화
      window.dispatchEvent(new Event(FAVORITES_EVENT)); // ✅ 수정
      setInfo("즐겨찾기에서 제거했습니다.");
    } catch (e) {
      setError(e?.message || "즐겨찾기 제거 실패");
    } finally {
      setLoading(false);
    }
  };

  const openFavoriteCafeDetail = (cafe) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", "favorites");
    setSearchParams(sp, { replace: true });

    const rawId = cafe?.id ?? cafe?.cafe_id ?? cafe?.cafeId;
    if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
      setError("상세 페이지로 이동할 cafe id가 없습니다. (즐겨찾기 데이터를 다시 저장해 주세요)");
      return;
    }
    nav(`/cafe/${encodeURIComponent(String(rawId))}`, { state: { cafe } });
  };

  const onDeleteReview = async (id) => {
    clearMsg();
    if (!confirm("리뷰를 삭제할까요?")) return;

    try {
      setLoading(true);
      await apiFetch(`/api/me/reviews/${id}`, { method: "DELETE" });
      setReviews((prev) => prev.filter((x) => x.id !== id));
      setInfo("리뷰를 삭제했습니다.");
    } catch (e) {
      setError(e.message || "리뷰 삭제 실패");
    } finally {
      setLoading(false);
    }
  };

  const onEditReview = async (id) => {
    clearMsg();
    const target = reviews.find((r) => r.id === id);
    if (!target) return;

    const nextContent = prompt("리뷰 내용을 수정해주세요.", target.content);
    if (nextContent === null) return;

    const nextRatingStr = prompt("평점(1~5)을 입력해주세요.", String(target.rating));
    if (nextRatingStr === null) return;
    const nextRating = Number(nextRatingStr);

    if (!nextContent.trim()) return setError("리뷰 내용이 비어있습니다.");
    if (!Number.isFinite(nextRating) || nextRating < 1 || nextRating > 5)
      return setError("평점은 1~5 사이여야 합니다.");

    try {
      setLoading(true);
      await apiFetch(`/api/me/reviews/${id}`, {
        method: "PUT",
        body: { content: nextContent, rating: nextRating },
      });

      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, content: nextContent, rating: nextRating } : r)));
      setInfo("리뷰가 수정되었습니다.");
    } catch (e) {
      setError(e.message || "리뷰 수정 실패");
    } finally {
      setLoading(false);
    }
  };

  const onSaveSettings = async () => {
    clearMsg();
    try {
      setLoading(true);
      await apiFetch("/api/me/settings", {
        method: "PUT",
        body: { marketing: settings.marketing, profilePublic: settings.profilePublic },
      });
      setInfo("설정이 저장되었습니다.");
    } catch (e) {
      setError(e.message || "설정 저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const onDeleteAccount = async () => {
    clearMsg();
    const ok = confirm("정말로 회원 탈퇴하시겠어요?\n탈퇴 후 데이터는 복구가 어려울 수 있습니다.");
    if (!ok) return;

    try {
      setLoading(true);
      await apiFetch("/api/me", { method: "DELETE" });
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      nav("/login");
    } catch (e) {
      setError(e.message || "탈퇴 처리 실패");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="app-container">
        <Header />
        <div className="chat-container mypage-container">
          <div className="card mypage-card">불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header />
      <div className="chat-container mypage-container">
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>마이페이지</h1>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            {user.nickname}님 · {user.email} · 선호지역: {user.region || "-"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                clearMsg();
                setTabAndUrl(t.key);
              }}
              style={tabBtn(tab === t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {globalMsg.text && <div style={{ marginTop: 10, ...msgBox(globalMsg.type) }}>{globalMsg.text}</div>}

        <div className="card mypage-card" style={{ marginTop: 14 }}>
          {tab === "profile" && (
            <>
              <div className="card-title">회원정보 수정</div>
              <div className="card-subtitle">닉네임/선호지역, 비밀번호 변경을 관리합니다.</div>

              <form onSubmit={onSaveProfile}>
                <div className="form-group">
                  <label>이메일</label>
                  <input value={user.email} readOnly />
                </div>

                <div className="form-group">
                  <label>닉네임</label>
                  <input value={profileForm.nickname} onChange={(e) => setProfileForm((p) => ({ ...p, nickname: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label>선호 지역</label>
                  <select
                    value={profileForm.region}
                    onChange={(e) => setProfileForm((p) => ({ ...p, region: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="광주">광주</option>
                    <option value="나주">나주</option>
                    <option value="담양">담양</option>
                    <option value="장성">장성</option>
                    <option value="화순">화순</option>
                  </select>
                </div>

                <div style={{ height: 10 }} />

                <div className="form-group">
                  <label>새 비밀번호</label>
                  <input
                    type="password"
                    value={profileForm.newPassword}
                    onChange={(e) => setProfileForm((p) => ({ ...p, newPassword: e.target.value }))}
                    placeholder="변경 시에만 입력"
                  />
                </div>

                <div className="form-group">
                  <label>새 비밀번호 확인</label>
                  <input
                    type="password"
                    value={profileForm.newPasswordConfirm}
                    onChange={(e) => setProfileForm((p) => ({ ...p, newPasswordConfirm: e.target.value }))}
                    placeholder="변경 시에만 입력"
                  />
                </div>

                {profileMsg.text && <div style={{ marginTop: 8, ...msgBox(profileMsg.type) }}>{profileMsg.text}</div>}

                <button className="auth-submit-btn" disabled={loading}>
                  {loading ? "저장 중..." : "저장하기"}
                </button>
              </form>
            </>
          )}

          {tab === "favorites" && (
            <>
              <div className="card-title">즐겨찾기</div>
              <div className="card-subtitle">저장해둔 카페 목록을 확인하고 관리합니다.</div>

              {favorites.length === 0 ? (
                <div style={{ color: "#777", fontSize: 13 }}>즐겨찾기한 카페가 없습니다.</div>
              ) : (
                <div className="mypage-fav-list">
                  {favorites.map((cafe) => (
                    <div
                      key={String(cafe.id)}
                      className="mypage-fav-card is-clickable"
                      role="button"
                      tabIndex={0}
                      title="클릭하면 카페 상세로 이동합니다"
                      onClick={() => openFavoriteCafeDetail(cafe)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openFavoriteCafeDetail(cafe);
                        }
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{cafe.name}</div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{cafe.region || "-"}</div>
                          {cafe.address ? (
                            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{cafe.address}</div>
                          ) : null}
                        </div>

                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            type="button"
                            style={btnGhost}
                            disabled={loading}
                            onClick={(e) => {
                              e.stopPropagation();
                              openFavoriteCafeDetail(cafe);
                            }}
                          >
                            상세
                          </button>

                          <button
                            type="button"
                            style={btnDangerGhost}
                            disabled={loading}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveFavorite(cafe.id);
                            }}
                          >
                            제거
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {(cafe.tags || []).map((t) => (
                          <span key={t} className="chip">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "reviews" && (
            <>
              <div className="card-title">리뷰 내역</div>
              <div className="card-subtitle">작성한 리뷰를 확인하고 수정/삭제할 수 있습니다.</div>

              {reviews.length === 0 ? (
                <div style={{ color: "#777", fontSize: 13 }}>작성한 리뷰가 없습니다.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {reviews.map((r) => (
                    <div key={r.id} style={itemCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{r.cafeName}</div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                            평점: {renderStars(r.rating)} · {String(r.created_at || "").slice(0, 10)}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button type="button" style={btnGhost} disabled={loading} onClick={() => onEditReview(r.id)}>
                            수정
                          </button>
                          <button type="button" style={btnDangerGhost} disabled={loading} onClick={() => onDeleteReview(r.id)}>
                            삭제
                          </button>
                        </div>
                      </div>

                      <div style={{ marginTop: 8, fontSize: 13, color: "#333", lineHeight: 1.5 }}>{r.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "settings" && (
            <>
              <div className="card-title">설정</div>
              <div className="card-subtitle">알림/공개 범위/탈퇴 등을 관리합니다.</div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={itemCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>마케팅 수신</div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>이벤트/소식 알림을 받습니다.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.marketing}
                      onChange={(e) => setSettings((s) => ({ ...s, marketing: e.target.checked }))}
                    />
                  </div>
                </div>

                <div style={itemCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>프로필 공개</div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>리뷰에 닉네임 표시 여부</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.profilePublic}
                      onChange={(e) => setSettings((s) => ({ ...s, profilePublic: e.target.checked }))}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={btnPrimary} disabled={loading} onClick={onSaveSettings}>
                    {loading ? "저장 중..." : "설정 저장"}
                  </button>
                  <button type="button" style={btnDanger} disabled={loading} onClick={onDeleteAccount}>
                    회원 탈퇴
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function renderStars(n) {
  const full = "★".repeat(n);
  const empty = "☆".repeat(5 - n);
  return full + empty;
}

const tabBtn = (active) => ({
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid " + (active ? "#2f80ed" : "#ddd"),
  background: active ? "rgba(47,128,237,0.10)" : "#fff",
  color: "#333",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
});

const msgBox = (type) => ({
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid " + (type === "error" ? "rgba(220,60,60,0.35)" : "rgba(47,128,237,0.25)"),
  background: type === "error" ? "rgba(220,60,60,0.06)" : "rgba(47,128,237,0.06)",
  color: type === "error" ? "#b51d1d" : "#1f5fb6",
  fontSize: 13,
});

const itemCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const btnPrimary = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "none",
  background: "#2f80ed",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const btnDanger = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(220,60,60,0.35)",
  background: "rgba(220,60,60,0.10)",
  color: "#b51d1d",
  fontWeight: 700,
  cursor: "pointer",
};

const btnGhost = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#333",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const btnDangerGhost = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(220,60,60,0.35)",
  background: "rgba(220,60,60,0.06)",
  color: "#b51d1d",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const selectStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 13,
  background: "#fff",
};
