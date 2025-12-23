// auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "./db.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || "";
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || ""; // ON이면 필요
const KAKAO_REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || "";
const FRONTEND_BASE = process.env.FRONTEND_BASE || "http://localhost:5173";

// ✅ state(CSRF 방지)용 쿠키 유틸(외부 미들웨어 없이 가볍게 처리)
function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    const k = decodeURIComponent(p.slice(0, i));
    if (k === name) return decodeURIComponent(p.slice(i + 1));
  }
  return null;
}

function setCookie(res, name, value, { maxAgeSec = 300 } = {}) {
  const secure = process.env.NODE_ENV === "production";
  const cookie = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
}

function clearCookie(res, name) {
  const secure = process.env.NODE_ENV === "production";
  const cookie = [
    `${encodeURIComponent(name)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.user_id), email: user.email, nickname: user.nickname },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "토큰이 없습니다." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "토큰이 유효하지 않습니다." });
  }
}

/** ✅ 회원가입 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, nickname } = req.body || {};
    if (!email?.trim() || !password?.trim() || !nickname?.trim()) {
      return res.status(400).json({ message: "email/password/nickname은 필수입니다." });
    }
    const key = email.trim().toLowerCase();

    const [exists] = await pool.query("SELECT user_id FROM users WHERE email = ? LIMIT 1", [key]);
    if (exists.length) return res.status(409).json({ message: "이미 가입된 이메일입니다." });

    const passwordHash = await bcrypt.hash(password, 10);

    // bookmarks_json 기본값
    const bookmarksJson = "[]";

    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, nickname, bookmarks_json, created_at, last_login_at)
       VALUES (?, ?, ?, ?, NOW(), NULL)`,
      [key, passwordHash, nickname.trim(), bookmarksJson]
    );

    const user = { user_id: result.insertId, email: key, nickname: nickname.trim() };
    const token = signToken(user);

    return res.json({ user, token });
  } catch (e) {
    console.error("[auth/register]", e);
    return res.status(500).json({ message: "회원가입 실패 (DB/테이블/컬럼을 확인해주세요)" });
  }
});

/** ✅ 로그인 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "이메일/비밀번호를 입력해주세요." });
    }
    const key = email.trim().toLowerCase();

    const [rows] = await pool.query(
      `SELECT user_id, email, password_hash, nickname
       FROM users WHERE email = ? LIMIT 1`,
      [key]
    );
    if (!rows.length) return res.status(401).json({ message: "로그인 정보가 올바르지 않습니다." });

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ message: "로그인 정보가 올바르지 않습니다." });

    await pool.query("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [u.user_id]);

    const user = { user_id: u.user_id, email: u.email, nickname: u.nickname };
    const token = signToken(user);

    return res.json({ user, token });
  } catch (e) {
    console.error("[auth/login]", e);
    return res.status(500).json({ message: "로그인 실패" });
  }
});

/** ✅ (간단버전) 이메일 + 닉네임으로 비밀번호 재설정 */
router.post("/password/reset-simple", async (req, res) => {
  try {
    const { email, nickname, newPassword } = req.body || {};

    if (!email?.trim() || !nickname?.trim() || !newPassword?.trim()) {
      return res.status(400).json({ message: "email/nickname/newPassword는 필수입니다." });
    }

    const key = email.trim().toLowerCase();
    const nick = nickname.trim();

    const [rows] = await pool.query(
      `SELECT user_id FROM users WHERE email = ? AND nickname = ? LIMIT 1`,
      [key, nick]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "이메일/닉네임 정보가 일치하지 않습니다." });
    }

    if (newPassword.trim().length < 4) {
      return res.status(400).json({ message: "비밀번호는 4자 이상으로 입력해주세요." });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);

    await pool.query(
      `UPDATE users SET password_hash = ? WHERE user_id = ?`,
      [passwordHash, rows[0].user_id]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("[auth/password/reset-simple]", e);
    return res.status(500).json({ message: "비밀번호 재설정 실패" });
  }
});

/**
 * ✅ (1차/MVP) 카카오 로그인 시작
 * - state 쿠키를 발급한 뒤 카카오 authorize로 302 이동
 * - scope를 지정하지 않아 추가 동의(개인정보)를 최소화합니다.
 */
router.get("/kakao/start", (req, res) => {
  try {
    if (!KAKAO_CLIENT_ID || !KAKAO_REDIRECT_URI) {
      return res
        .status(500)
        .send("Kakao env 설정이 필요합니다. (KAKAO_CLIENT_ID/KAKAO_REDIRECT_URI)");
    }

    const state = crypto.randomBytes(16).toString("hex");
    setCookie(res, "kakao_oauth_state", state, { maxAgeSec: 300 });

    const qs = new URLSearchParams({
      response_type: "code",
      client_id: KAKAO_CLIENT_ID,
      redirect_uri: KAKAO_REDIRECT_URI,
      state,
    });

    return res.redirect(302, `https://kauth.kakao.com/oauth/authorize?${qs.toString()}`);
  } catch (e) {
    console.error("[auth/kakao/start]", e);
    return res.status(500).send("Kakao start failed");
  }
});

/**
 * ✅ (1차/MVP) 카카오 콜백
 * - code -> access_token -> /v2/user/me -> 우리 서비스 JWT 발급
 * - 카카오에서 받은 사용자 식별자(id)만을 기준으로 users에 매핑합니다.
 */
router.get("/kakao/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      const msg = encodeURIComponent(String(error_description || error));
      return res.redirect(302, `${FRONTEND_BASE}/login#oauth_error=${msg}`);
    }

    const savedState = getCookie(req, "kakao_oauth_state");
    if (!savedState || String(savedState) !== String(state || "")) {
      return res.status(400).send("Invalid state (CSRF 의심)");
    }
    clearCookie(res, "kakao_oauth_state");

    if (!code) return res.status(400).send("No code");
    if (!KAKAO_CLIENT_ID || !KAKAO_REDIRECT_URI) {
      return res
        .status(500)
        .send("Kakao env 설정이 필요합니다. (KAKAO_CLIENT_ID/KAKAO_REDIRECT_URI)");
    }

    // 1) code -> token
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: KAKAO_CLIENT_ID,
      redirect_uri: KAKAO_REDIRECT_URI,
      code: String(code),
    });

    // ✅ Client Secret이 ON인 경우 필수
    if (KAKAO_CLIENT_SECRET) body.set("client_secret", KAKAO_CLIENT_SECRET);

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("[kakao/token]", tokenJson);
      return res.redirect(302, `${FRONTEND_BASE}/login#oauth_error=token_failed`);
    }

    const accessToken = tokenJson?.access_token;
    if (!accessToken) {
      return res.redirect(302, `${FRONTEND_BASE}/login#oauth_error=no_access_token`);
    }

    // 2) token -> user info
    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meJson = await meRes.json();
    if (!meRes.ok) {
      console.error("[kakao/me]", meJson);
      return res.redirect(302, `${FRONTEND_BASE}/login#oauth_error=me_failed`);
    }

    const kakaoId = String(meJson?.id || "");
    if (!kakaoId) {
      return res.redirect(302, `${FRONTEND_BASE}/login#oauth_error=no_kakao_id`);
    }

    // ✅ 3) MVP: DB 스키마 변경 없이 users.email을 "가짜 이메일"로 매핑
    // - 실제 이메일 동의/심사를 피하기 위한 전략입니다.
    const emailKey = `kakao_${kakaoId}@kakao.local`;

    // 닉네임은 프로필 동의가 없으면 비어 있을 수 있으므로 fallback
    const nickFromKakao =
      meJson?.kakao_account?.profile?.nickname || `카카오_${kakaoId.slice(-6)}`;

    const [rows] = await pool.query(
      `SELECT user_id, email, nickname
       FROM users WHERE email = ? LIMIT 1`,
      [emailKey]
    );

    let user;
    if (rows.length) {
      user = rows[0];
      await pool.query("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);
    } else {
      // ✅ password_hash NOT NULL 스키마를 대비하여 랜덤 비밀번호를 해시로 저장
      const randomPw = crypto.randomBytes(24).toString("hex");
      const passwordHash = await bcrypt.hash(randomPw, 10);
      const bookmarksJson = "[]";

      const [ins] = await pool.query(
        `INSERT INTO users (email, password_hash, nickname, bookmarks_json, created_at, last_login_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [emailKey, passwordHash, String(nickFromKakao), bookmarksJson]
      );

      user = { user_id: ins.insertId, email: emailKey, nickname: String(nickFromKakao) };
    }

    // 4) 우리 서비스 JWT 발급(기존 방식 그대로)
    const token = signToken(user);

    // ✅ 프론트로 토큰 전달 (hash 사용: 서버 로그/리퍼러 노출 최소화)
    return res.redirect(
      302,
      `${FRONTEND_BASE}/login#token=${encodeURIComponent(token)}&provider=kakao`
    );
  } catch (e) {
    console.error("[auth/kakao/callback]", e);
    return res.redirect(302, `${FRONTEND_BASE}/login#oauth_error=server_error`);
  }
});

/** 토큰 확인용 */
router.get("/me", authRequired, (req, res) => res.json({ user: req.user }));

export default router;
export { authRequired, signToken };
