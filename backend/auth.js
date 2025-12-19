// auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "./db.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

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


/** 토큰 확인용 */
router.get("/me", authRequired, (req, res) => res.json({ user: req.user }));

export default router;
export { authRequired, signToken };
