// me.js
import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { authRequired, signToken } from "./auth.js";

const DEFAULT_SETTINGS = { marketing: false, profilePublic: true };

const colCache = new Map();
async function usersHasColumn(col) {
  if (colCache.has(col)) return colCache.get(col);
  const [rows] = await pool.query("SHOW COLUMNS FROM users LIKE ?", [col]);
  const ok = rows.length > 0;
  colCache.set(col, ok);
  return ok;
}

function safeJsonParse(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

async function getUserRow(userId) {
  const cols = ["user_id", "email", "nickname", "bookmarks_json"];
  if (await usersHasColumn("region")) cols.push("region");
  if (await usersHasColumn("settings_json")) cols.push("settings_json");

  const [rows] = await pool.query(
    `SELECT ${cols.join(", ")} FROM users WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getBookmarks(userId) {
  const [rows] = await pool.query(
    "SELECT bookmarks_json FROM users WHERE user_id = ? LIMIT 1",
    [userId]
  );
  const raw = rows?.[0]?.bookmarks_json ?? "[]";
  const arr = safeJsonParse(raw, []);
  return Array.isArray(arr) ? arr : [];
}

async function setBookmarks(userId, arr) {
  await pool.query("UPDATE users SET bookmarks_json = ? WHERE user_id = ?", [
    JSON.stringify(arr ?? []),
    userId,
  ]);
}

export function createMeRouter() {
  const router = express.Router();

  // ✅ 내 정보 + 설정
  router.get("/me", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const u = await getUserRow(userId);
      if (!u) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

      const settings = (u.settings_json && safeJsonParse(u.settings_json, DEFAULT_SETTINGS)) || DEFAULT_SETTINGS;

      return res.json({
        user: {
          user_id: u.user_id,
          email: u.email,
          nickname: u.nickname,
          region: u.region || "광주",
        },
        settings,
      });
    } catch (e) {
      console.error("[me/get]", e);
      return res.status(500).json({ message: "내 정보 조회 실패" });
    }
  });

  // ✅ 회원정보 수정(닉네임/지역/비밀번호)
  router.put("/me", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const { nickname, region, newPassword } = req.body || {};

      const sets = [];
      const params = [];

      if (typeof nickname === "string" && nickname.trim()) {
        sets.push("nickname = ?");
        params.push(nickname.trim());
      }

      if (await usersHasColumn("region")) {
        if (typeof region === "string" && region.trim()) {
          sets.push("region = ?");
          params.push(region.trim());
        }
      }

      if (typeof newPassword === "string" && newPassword.trim()) {
        const hash = await bcrypt.hash(newPassword.trim(), 10);
        sets.push("password_hash = ?");
        params.push(hash);
      }

      if (!sets.length) {
        return res.status(400).json({ message: "변경할 값이 없습니다." });
      }

      params.push(userId);
      await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE user_id = ?`, params);

      const u = await getUserRow(userId);
      const settings = (u.settings_json && safeJsonParse(u.settings_json, DEFAULT_SETTINGS)) || DEFAULT_SETTINGS;

      const token = signToken(u); // nickname 반영용 재발급

      return res.json({
        user: { user_id: u.user_id, email: u.email, nickname: u.nickname, region: u.region || "광주" },
        settings,
        token,
      });
    } catch (e) {
      console.error("[me/put]", e);
      return res.status(500).json({ message: "회원정보 수정 실패" });
    }
  });

  // ✅ 즐겨찾기 목록(bookmarks_json 기반)
  router.get("/me/favorites", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const arr = await getBookmarks(userId);

      // bookmarks_json에 객체/문자열/숫자 섞여 있어도 UI에서 쓰기 쉽게 normalize
      const items = arr.map((x) => {
        if (x && typeof x === "object") {
          return {
            id: x.id ?? x.cafe_id ?? x.name ?? String(Math.random()),
            name: x.name ?? x.title ?? "카페",
            region: x.region ?? "",
            tags: Array.isArray(x.tags) ? x.tags : [],
          };
        }
        return { id: String(x), name: String(x), region: "", tags: [] };
      });

      return res.json({ items });
    } catch (e) {
      console.error("[me/favorites/get]", e);
      return res.status(500).json({ message: "즐겨찾기 조회 실패" });
    }
  });

  router.delete("/me/favorites/:id", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const target = String(req.params.id);

      const arr = await getBookmarks(userId);
      const next = arr.filter((x) => {
        if (x && typeof x === "object") return String(x.id ?? x.cafe_id ?? x.name) !== target;
        return String(x) !== target;
      });

      await setBookmarks(userId, next);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[me/favorites/del]", e);
      return res.status(500).json({ message: "즐겨찾기 삭제 실패" });
    }
  });

  // ✅ 리뷰: 테이블 붙이기 전까지는 “빈 배열”로라도 200 응답(마이페이지가 깨지지 않게)
  router.get("/me/reviews", authRequired, async (req, res) => res.json({ items: [] }));
  router.put("/me/reviews/:id", authRequired, async (req, res) => res.json({ ok: true }));
  router.delete("/me/reviews/:id", authRequired, async (req, res) => res.json({ ok: true }));

  // ✅ 설정 저장: settings_json 컬럼 있으면 저장, 없으면 그냥 OK
  router.put("/me/settings", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const body = req.body || {};
      const next = {
        marketing: !!body.marketing,
        profilePublic: body.profilePublic !== false,
      };

      if (await usersHasColumn("settings_json")) {
        await pool.query("UPDATE users SET settings_json = ? WHERE user_id = ?", [
          JSON.stringify(next),
          userId,
        ]);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("[me/settings/put]", e);
      return res.status(500).json({ message: "설정 저장 실패" });
    }
  });

  // ✅ 회원 탈퇴
  router.delete("/me", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[me/delete]", e);
      return res.status(500).json({ message: "회원 탈퇴 실패" });
    }
  });

  return router;
}
