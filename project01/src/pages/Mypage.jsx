import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from '../components/Header';

const TABS = [
  { key: "profile", label: "회원정보 수정" },
  { key: "favorites", label: "즐겨찾기" },
  { key: "reviews", label: "리뷰 내역" },
  { key: "settings", label: "설정" },
];

export default function Mypage() {
  const nav = useNavigate();

  // ====== (임시) 로그인 사용자 정보 / 추후엔 서버에서 가져오세요 ======
  const [user, setUser] = useState({
    id: 1,
    name: "홍길동",
    email: "hong@example.com",
    phone: "",
    region: "광주",
  });

  // ====== 탭 ======
  const [tab, setTab] = useState("profile");

  // ====== 회원정보 수정 폼 ======
  const [profileForm, setProfileForm] = useState({
    name: user.name,
    phone: user.phone,
    region: user.region,
    newPassword: "",
    newPasswordConfirm: "",
  });
  const [profileMsg, setProfileMsg] = useState({ type: "", text: "" });

  // ====== 즐겨찾기 (임시 데이터) ======
  const [favorites, setFavorites] = useState([
    { id: "cafe_1", name: "카페하루", region: "나주", tags: ["조용한", "디저트", "주차"] },
    { id: "cafe_2", name: "인스틸커피", region: "나주", tags: ["감성", "케이크"] },
  ]);

  // ====== 리뷰 내역 (임시 데이터) ======
  const [reviews, setReviews] = useState([
    { id: "rv_1", cafeId: "cafe_1", cafeName: "카페하루", rating: 5, content: "케이크가 정말 맛있어요.", date: "2025-12-10" },
    { id: "rv_2", cafeId: "cafe_2", cafeName: "인스틸커피", rating: 4, content: "분위기 좋아서 오래 있었어요.", date: "2025-12-03" },
  ]);

  // ====== 설정 ======
  const [settings, setSettings] = useState({
    marketing: false,
    profilePublic: true,
  });

  // 공통 UI 상태
  const [loading, setLoading] = useState(false);
  const [globalMsg, setGlobalMsg] = useState({ type: "", text: "" });

//   const headerRight = useMemo(() => {
//     return (
//       <div style={{ display: "flex", gap: 8 }}>
//         <button
//           type="button"
//           onClick={() => nav("/map")}
//           style={btnGhost}
//         >
//           지도
//         </button>
//         <button
//           type="button"
//           onClick={() => {
//             // TODO: 로그아웃 API or 토큰 삭제
//             localStorage.removeItem("token");
//             nav("/login");
//           }}
//           style={btnDangerGhost}
//         >
//           로그아웃
//         </button>
//       </div>
//     );
//   }, [nav]);

  const setInfo = (text) => setGlobalMsg({ type: "info", text });
  const setError = (text) => setGlobalMsg({ type: "error", text });
  const clearMsg = () => setGlobalMsg({ type: "", text: "" });

  // ====== handlers ======
  const onSaveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: "", text: "" });
    clearMsg();

    if (!profileForm.name.trim()) return setProfileMsg({ type: "error", text: "이름(닉네임)을 입력해주세요." });

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

      // TODO: 서버 연동 예시
      // await api.put("/users/me", { name, phone, region, newPassword })
      // 성공하면 user state 갱신

      setUser((prev) => ({
        ...prev,
        name: profileForm.name,
        phone: profileForm.phone,
        region: profileForm.region,
      }));

      setProfileForm((prev) => ({
        ...prev,
        newPassword: "",
        newPasswordConfirm: "",
      }));

      setProfileMsg({ type: "info", text: "회원정보가 저장되었습니다." });
    } catch (err) {
      setProfileMsg({ type: "error", text: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." });
    } finally {
      setLoading(false);
    }
  };

  const onRemoveFavorite = async (id) => {
    clearMsg();
    try {
      setLoading(true);

      // TODO: await api.delete(`/favorites/${id}`)
      setFavorites((prev) => prev.filter((x) => x.id !== id));
      setInfo("즐겨찾기에서 제거했습니다.");
    } catch (e) {
      setError("즐겨찾기 제거에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onDeleteReview = async (id) => {
    clearMsg();
    if (!confirm("리뷰를 삭제할까요?")) return;

    try {
      setLoading(true);
      // TODO: await api.delete(`/reviews/${id}`)
      setReviews((prev) => prev.filter((x) => x.id !== id));
      setInfo("리뷰를 삭제했습니다.");
    } catch (e) {
      setError("리뷰 삭제에 실패했습니다.");
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
    if (!Number.isFinite(nextRating) || nextRating < 1 || nextRating > 5) return setError("평점은 1~5 사이여야 합니다.");

    try {
      setLoading(true);
      // TODO: await api.put(`/reviews/${id}`, { content: nextContent, rating: nextRating })
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, content: nextContent, rating: nextRating } : r))
      );
      setInfo("리뷰가 수정되었습니다.");
    } catch (e) {
      setError("리뷰 수정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const onSaveSettings = async () => {
    clearMsg();
    try {
      setLoading(true);
      // TODO: await api.put("/users/me/settings", settings)
      setInfo("설정이 저장되었습니다.");
    } catch (e) {
      setError("설정 저장에 실패했습니다.");
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
      // TODO: await api.delete("/users/me")
      localStorage.removeItem("token");
      nav("/login");
    } catch (e) {
      setError("탈퇴 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
     <div className="app-container">
      <Header />
    <div className="chat-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>마이페이지</h1>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            {user.name}님 · {user.email} · 선호지역: {user.region}
          </div>
        </div>
        
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              clearMsg();
              setTab(t.key);
            }}
            style={tabBtn(tab === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 전역 메시지 */}
      {globalMsg.text && (
        <div style={{ marginTop: 10, ...msgBox(globalMsg.type) }}>
          {globalMsg.text}
        </div>
      )}

      {/* 본문 카드 */}
      <div className="card" style={{ maxWidth: 900, marginTop: 14 }}>
        {/* 회원정보 수정 */}
        {tab === "profile" && (
          <>
            <div className="card-title">회원정보 수정</div>
            <div className="card-subtitle">닉네임/연락처/선호지역, 비밀번호 변경을 관리합니다.</div>

            <form onSubmit={onSaveProfile}>
              <div className="form-group">
                <label>이메일</label>
                <input value={user.email} readOnly />
                <div className="helper">이메일은 변경할 수 없도록 처리하는 것을 권장합니다.</div>
              </div>

              <div className="form-group">
                <label>이름/닉네임</label>
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="예: 광진"
                />
              </div>

              <div className="form-group">
                <label>연락처</label>
                <input
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="예: 010-1234-5678"
                />
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

              {profileMsg.text && (
                <div style={{ marginTop: 8, ...msgBox(profileMsg.type) }}>
                  {profileMsg.text}
                </div>
              )}

              <button className="auth-submit-btn" disabled={loading}>
                {loading ? "저장 중..." : "저장하기"}
              </button>
            </form>
          </>
        )}

        {/* 즐겨찾기 */}
        {tab === "favorites" && (
          <>
            <div className="card-title">즐겨찾기</div>
            <div className="card-subtitle">저장해둔 카페 목록을 확인하고 관리합니다.</div>

            {favorites.length === 0 ? (
              <div style={{ color: "#777", fontSize: 13 }}>즐겨찾기한 카페가 없습니다.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {favorites.map((cafe) => (
                  <div key={cafe.id} style={itemCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{cafe.name}</div>
                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{cafe.region}</div>
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          style={btnGhost}
                          onClick={() => {
                            // TODO: 카페 상세/지도 이동 로직에 맞게 수정
                            nav("/map");
                          }}
                        >
                          지도에서 보기
                        </button>
                        <button
                          type="button"
                          style={btnDangerGhost}
                          disabled={loading}
                          onClick={() => onRemoveFavorite(cafe.id)}
                        >
                          제거
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {cafe.tags.map((t) => (
                        <span key={t} className="chip">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 리뷰 내역 */}
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
                          평점: {renderStars(r.rating)} · {r.date}
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

                    <div style={{ marginTop: 8, fontSize: 13, color: "#333", lineHeight: 1.5 }}>
                      {r.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 설정 */}
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

              <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>
                * 실제 서비스에서는 “회원 탈퇴”는 보통 2차 확인(비밀번호 재확인/이메일 인증) 절차를 추가하는 것을 권장합니다.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </div>
  );
}

/** ====== UI helpers ====== */
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
