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

const tableCache = new Map();
async function tableExists(tableName) {
  if (tableCache.has(tableName)) return tableCache.get(tableName);
  const [rows] = await pool.query("SHOW TABLES LIKE ?", [tableName]);
  const ok = rows.length > 0;
  tableCache.set(tableName, ok);
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

/** ====== (fallback) bookmarks_json 기반 ====== */
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

/** ====== (main) user_favorites 기반 ====== */
async function favoritesMode() {
  // user_favorites가 존재하면 테이블 기반, 없으면 bookmarks_json fallback
  return (await tableExists("user_favorites")) ? "table" : "json";
}

async function cafeExists(cafeId) {
  const [rows] = await pool.query(
    "SELECT cafe_id FROM cafes WHERE cafe_id = ? LIMIT 1",
    [cafeId]
  );
  return rows.length > 0;
}

async function getFavoritesFromTable(userId) {
  // cafes 테이블 컬럼 중 최소 UI에 필요한 것만 사용
  const [rows] = await pool.query(
    `SELECT
        c.cafe_id AS id,
        c.name,
        c.region,
        c.address
     FROM user_favorites f
     JOIN cafes c ON c.cafe_id = f.cafe_id
     WHERE f.user_id = ?
     ORDER BY f.created_at DESC`,
    [userId]
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "카페",
    region: r.region ?? "",
    tags: [], // 현재 cafes 테이블에 tags가 없으므로 빈 배열
    address: r.address ?? "",
  }));
}

async function addFavoriteToTable(userId, cafeId) {
  // FK 전에 존재 여부를 확인하면 에러 메시지를 404로 깔끔하게 처리 가능
  if (!(await cafeExists(cafeId))) {
    const err = new Error("카페를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  await pool.query(
    `INSERT INTO user_favorites (user_id, cafe_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE created_at = created_at`,
    [userId, cafeId]
  );
}

async function removeFavoriteFromTable(userId, cafeId) {
  await pool.query(
    "DELETE FROM user_favorites WHERE user_id = ? AND cafe_id = ?",
    [userId, cafeId]
  );
}

/** ====== user row ====== */
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

export function createMeRouter() {
  const router = express.Router();

  /** ✅ 내 정보 + 설정 */
  router.get("/me", authRequired, async (req, res) => {
    try {
      const userId = String(req.user.sub);
      const u = await getUserRow(userId);
      if (!u) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

      const settings =
        (u.settings_json && safeJsonParse(u.settings_json, DEFAULT_SETTINGS)) || DEFAULT_SETTINGS;

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

  /** ✅ 회원정보 수정(닉네임/지역/비밀번호) */
  router.put("/me", authRequired, async (req, res) => {
    try {
      const userId = String(req.user.sub);
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
      const settings =
        (u.settings_json && safeJsonParse(u.settings_json, DEFAULT_SETTINGS)) || DEFAULT_SETTINGS;

      const token = signToken(u); // nickname 반영용 재발급

      return res.json({
        user: {
          user_id: u.user_id,
          email: u.email,
          nickname: u.nickname,
          region: u.region || "광주",
        },
        settings,
        token,
      });
    } catch (e) {
      console.error("[me/put]", e);
      return res.status(500).json({ message: "회원정보 수정 실패" });
    }
  });

  /** ✅ 즐겨찾기 목록 (user_favorites 우선, 없으면 bookmarks_json fallback) */
  router.get("/me/favorites", authRequired, async (req, res) => {
    try {
      const userId = String(req.user.sub);
      const mode = await favoritesMode();

      if (mode === "table") {
        const items = await getFavoritesFromTable(userId);
        return res.json({ items });
      }

      // fallback: bookmarks_json
      const arr = await getBookmarks(userId);
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

  /** ✅ 즐겨찾기 추가 (POST) */
  router.post("/me/favorites", authRequired, async (req, res) => {
    try {
      const userId = String(req.user.sub);
      const mode = await favoritesMode();

      // 프론트에서 cafe_id(권장) 또는 id로 보내도 받도록 처리
      const raw = req.body?.cafe_id ?? req.body?.id;
      const cafeId = Number(raw);

      if (!Number.isFinite(cafeId)) {
        return res.status(400).json({ message: "cafe_id(숫자)가 필요합니다." });
      }

      if (mode === "table") {
        await addFavoriteToTable(userId, cafeId);
        return res.json({ ok: true, added: true });
      }

      // fallback: bookmarks_json에 객체로 저장
      const arr = await getBookmarks(userId);
      const exists = arr.some((x) => {
        if (x && typeof x === "object") return String(x.id ?? x.cafe_id ?? x.name) === String(raw);
        return String(x) === String(raw);
      });
      if (!exists) {
        arr.push({
          id: String(raw),
          name: String(req.body?.name ?? "카페"),
          region: String(req.body?.region ?? ""),
          tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
        });
        await setBookmarks(userId, arr);
      }
      return res.json({ ok: true, added: !exists });
    } catch (e) {
      const status = e?.status || 500;
      console.error("[me/favorites/post]", e);
      return res.status(status).json({ message: e.message || "즐겨찾기 추가 실패" });
    }
  });

  /** ✅ 즐겨찾기 삭제 */
  router.delete("/me/favorites/:id", authRequired, async (req, res) => {
    try {
      const userId = String(req.user.sub);
      const mode = await favoritesMode();

      const targetRaw = String(req.params.id);
      const targetNum = Number(targetRaw);

      if (mode === "table") {
        if (!Number.isFinite(targetNum)) {
          return res.status(400).json({ message: "즐겨찾기 삭제는 cafe_id(숫자) 기준입니다." });
        }
        await removeFavoriteFromTable(userId, targetNum);
        return res.json({ ok: true });
      }

      // fallback: bookmarks_json
      const arr = await getBookmarks(userId);
      const next = arr.filter((x) => {
        if (x && typeof x === "object") return String(x.id ?? x.cafe_id ?? x.name) !== targetRaw;
        return String(x) !== targetRaw;
      });
      await setBookmarks(userId, next);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[me/favorites/del]", e);
      return res.status(500).json({ message: "즐겨찾기 삭제 실패" });
    }
  });

  /** ✅ 리뷰(임시) */
  router.get("/me/reviews", authRequired, async (req, res) => res.json({ items: [] }));
  router.put("/me/reviews/:id", authRequired, async (req, res) => res.json({ ok: true }));
  router.delete("/me/reviews/:id", authRequired, async (req, res) => res.json({ ok: true }));

  /** ✅ 설정 저장 */
  router.put("/me/settings", authRequired, async (req, res) => {
    try {
      const userId = String(req.user.sub);
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

  /** ✅ 회원 탈퇴 */
  router.delete("/me", authRequired, async (req, res) => {
    try {
      const userId = String(req.user.sub);
      await pool.query("DELETE FROM users WHERE user_id = ?", [userId]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[me/delete]", e);
      return res.status(500).json({ message: "회원 탈퇴 실패" });
    }
  });

  return router;
}
