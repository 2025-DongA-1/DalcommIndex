import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signToken(user) {
  return jwt.sign(
    { sub: user.user_id, email: user.email, nickname: user.nickname },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
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

// ✅ 회원가입
router.post("/register", async (req, res) => {
  try {
    const { email, password, nickname } = req.body || {};
    if (!email?.trim() || !password?.trim() || !nickname?.trim()) {
      return res.status(400).json({ message: "email/password/nickname은 필수입니다." });
    }

    const key = email.trim().toLowerCase();

    // 이메일 중복 체크
    const [exists] = await pool.query(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [key]
    );
    if (exists.length) {
      return res.status(409).json({ message: "이미 가입된 이메일입니다." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // bookmarks_json 기본값: 빈 배열 JSON
    const bookmarksJson = "[]";

    // created_at/last_login_at: 테이블에서 DEFAULT가 있으면 NOW() 생략 가능
    const [result] = await pool.query(
      `
      INSERT INTO users (email, password_hash, nickname, bookmarks_json, created_at, last_login_at)
      VALUES (?, ?, ?, ?, NOW(), NULL)
      `,
      [key, passwordHash, nickname.trim(), bookmarksJson]
    );

    const user = {
      user_id: result.insertId,
      email: key,
      nickname: nickname.trim(),
      bookmarks_json: bookmarksJson,
    };

    const token = signToken(user);
    return res.json({ user, token });
  } catch (e) {
    console.error("[auth/register]", e);
    return res.status(500).json({ message: "회원가입 실패" });
  }
});

// ✅ 로그인
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "이메일/비밀번호를 입력해주세요." });
    }

    const key = email.trim().toLowerCase();

    const [rows] = await pool.query(
      `
      SELECT user_id, email, password_hash, nickname, bookmarks_json
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [key]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "로그인 정보가 올바르지 않습니다." });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "로그인 정보가 올바르지 않습니다." });
    }

    // 마지막 로그인 시간 업데이트
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [
      u.user_id,
    ]);

    const user = {
      user_id: u.user_id,
      email: u.email,
      nickname: u.nickname,
      bookmarks_json: u.bookmarks_json,
    };

    const token = signToken(user);
    return res.json({ user, token });
  } catch (e) {
    console.error("[auth/login]", e);
    return res.status(500).json({ message: "로그인 실패" });
  }
});

// ✅ 내 정보(토큰 확인용)
router.get("/me", authRequired, async (req, res) => {
  return res.json({ user: req.user });
});

export default router;
export { authRequired, signToken };
