// me.js 마이페이지 수정
import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { authRequired, signToken } from "./auth.js";

function safeJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cafeToFavItem(cafe) {
  if (!cafe) return null;

  const tags = []
    .concat((cafe.atmosphere_norm || "").split("|"))
    .concat((cafe.taste_norm || "").split("|"))
    .concat((cafe.purpose_norm || "").split("|"))
    .map((t) => (t || "").trim())
    .filter(Boolean);

  const uniqTags = Array.from(new Set(tags)).slice(0, 6);

  return {
    id: String(cafe.id),
    name: cafe.name,
    region: cafe.region,
    tags: uniqTags,
  };
}

export function createMeRouter({ cafes = [] }) {
  const router = express.Router();
  const cafeMap = new Map(cafes.map((c) => [String(c.id), c]));

  // ✅ 내 정보(항상 DB에서 최신으로)
  router.get("/me", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const [rows] = await pool.query(
        `
        SELECT u.user_id, u.email, u.nickname, u.region, u.bookmarks_json,
               s.marketing, s.profile_public
        FROM users u
        LEFT JOIN user_settings s ON s.user_id = u.user_id
        WHERE u.user_id = ?
        LIMIT 1
        `,
        [userId]
      );

      if (!rows.length) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

      const u = rows[0];
      const bookmarks = safeJsonArray(u.bookmarks_json);

      return res.json({
        ok: true,
        user: {
          user_id: u.user_id,
          email: u.email,
          nickname: u.nickname,
          region: u.region ?? "",
        },
        favoritesCount: bookmarks.length,
        settings: {
          marketing: !!u.marketing,
          profilePublic: u.profile_public === null ? true : !!u.profile_public,
        },
      });
    } catch (e) {
      console.error("[GET /api/me]", e);
      return res.status(500).json({ message: "내 정보 조회 실패" });
    }
  });

  // ✅ 회원정보 수정(닉네임/선호지역/비밀번호)
  router.put("/me", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const { nickname, region, newPassword } = req.body || {};

      if (!nickname?.trim()) {
        return res.status(400).json({ message: "nickname은 필수입니다." });
      }

      // 비밀번호 변경이 있으면 해시
      let passwordSql = "";
      const params = [nickname.trim(), (region ?? "").trim() || null];

      if (newPassword && String(newPassword).trim()) {
        const pw = String(newPassword);
        if (pw.length < 8) {
          return res.status(400).json({ message: "비밀번호는 8자 이상을 권장합니다." });
        }
        const hash = await bcrypt.hash(pw, 10);
        passwordSql = `, password_hash = ?`;
        params.push(hash);
      }

      params.push(userId);

      await pool.query(
        `
        UPDATE users
        SET nickname = ?, region = ? ${passwordSql}
        WHERE user_id = ?
        `,
        params
      );

      // 최신 유저 재조회 + (선택) 토큰도 최신 닉네임 반영
      const [rows] = await pool.query(
        `SELECT user_id, email, nickname, region, bookmarks_json FROM users WHERE user_id=? LIMIT 1`,
        [userId]
      );
      const u = rows[0];
      const token = signToken(u);

      return res.json({
        ok: true,
        user: { user_id: u.user_id, email: u.email, nickname: u.nickname, region: u.region ?? "" },
        token,
      });
    } catch (e) {
      console.error("[PUT /api/me]", e);
      return res.status(500).json({ message: "회원정보 수정 실패" });
    }
  });

  // ✅ 즐겨찾기 목록(bookmarks_json 기반)
  router.get("/me/favorites", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const [rows] = await pool.query(
        `SELECT bookmarks_json FROM users WHERE user_id=? LIMIT 1`,
        [userId]
      );
      if (!rows.length) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

      const ids = safeJsonArray(rows[0].bookmarks_json).map(String);
      const items = ids
        .map((id) => cafeToFavItem(cafeMap.get(id)))
        .filter(Boolean);

      return res.json({ ok: true, ids, items });
    } catch (e) {
      console.error("[GET /api/me/favorites]", e);
      return res.status(500).json({ message: "즐겨찾기 조회 실패" });
    }
  });

  // ✅ 즐겨찾기 추가
  router.post("/me/favorites", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const { cafeId } = req.body || {};
      const id = String(cafeId || "").trim();
      if (!id) return res.status(400).json({ message: "cafeId가 필요합니다." });

      const [rows] = await pool.query(
        `SELECT bookmarks_json FROM users WHERE user_id=? LIMIT 1`,
        [userId]
      );
      if (!rows.length) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

      const arr = safeJsonArray(rows[0].bookmarks_json).map(String);
      if (!arr.includes(id)) arr.unshift(id);

      await pool.query(`UPDATE users SET bookmarks_json=? WHERE user_id=?`, [
        JSON.stringify(arr),
        userId,
      ]);

      return res.json({ ok: true });
    } catch (e) {
      console.error("[POST /api/me/favorites]", e);
      return res.status(500).json({ message: "즐겨찾기 추가 실패" });
    }
  });

  // ✅ 즐겨찾기 삭제
  router.delete("/me/favorites/:cafeId", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const id = String(req.params.cafeId || "").trim();
      if (!id) return res.status(400).json({ message: "cafeId가 필요합니다." });

      const [rows] = await pool.query(
        `SELECT bookmarks_json FROM users WHERE user_id=? LIMIT 1`,
        [userId]
      );
      if (!rows.length) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });

      const arr = safeJsonArray(rows[0].bookmarks_json).map(String).filter((x) => x !== id);

      await pool.query(`UPDATE users SET bookmarks_json=? WHERE user_id=?`, [
        JSON.stringify(arr),
        userId,
      ]);

      return res.json({ ok: true });
    } catch (e) {
      console.error("[DELETE /api/me/favorites/:cafeId]", e);
      return res.status(500).json({ message: "즐겨찾기 삭제 실패" });
    }
  });

  // ✅ 내 리뷰 목록
  router.get("/me/reviews", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const [rows] = await pool.query(
        `
        SELECT review_id, cafe_id, rating, content, created_at, updated_at
        FROM reviews
        WHERE user_id=?
        ORDER BY created_at DESC
        LIMIT 200
        `,
        [userId]
      );

      const items = rows.map((r) => {
        const cafe = cafeMap.get(String(r.cafe_id));
        return {
          id: r.review_id,
          cafeId: String(r.cafe_id),
          cafeName: cafe?.name || "(카페 정보 없음)",
          rating: r.rating,
          content: r.content,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      });

      return res.json({ ok: true, items });
    } catch (e) {
      console.error("[GET /api/me/reviews]", e);
      return res.status(500).json({ message: "리뷰 조회 실패" });
    }
  });

  // ✅ 리뷰 작성
  router.post("/me/reviews", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const { cafeId, rating, content } = req.body || {};
      const id = String(cafeId || "").trim();

      const r = Number(rating);
      if (!id) return res.status(400).json({ message: "cafeId가 필요합니다." });
      if (!Number.isFinite(r) || r < 1 || r > 5) return res.status(400).json({ message: "rating은 1~5 입니다." });
      if (!String(content || "").trim()) return res.status(400).json({ message: "content가 필요합니다." });

      await pool.query(
        `
        INSERT INTO reviews (user_id, cafe_id, rating, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NULL)
        `,
        [userId, id, r, String(content).trim()]
      );

      return res.json({ ok: true });
    } catch (e) {
      console.error("[POST /api/me/reviews]", e);
      return res.status(500).json({ message: "리뷰 작성 실패" });
    }
  });

  // ✅ 리뷰 수정(본인 것만)
  router.put("/me/reviews/:reviewId", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const reviewId = Number(req.params.reviewId);
      const { rating, content } = req.body || {};

      const r = Number(rating);
      if (!Number.isFinite(reviewId)) return res.status(400).json({ message: "reviewId가 올바르지 않습니다." });
      if (!Number.isFinite(r) || r < 1 || r > 5) return res.status(400).json({ message: "rating은 1~5 입니다." });
      if (!String(content || "").trim()) return res.status(400).json({ message: "content가 필요합니다." });

      const [result] = await pool.query(
        `
        UPDATE reviews
        SET rating=?, content=?, updated_at=NOW()
        WHERE review_id=? AND user_id=?
        `,
        [r, String(content).trim(), reviewId, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "리뷰를 찾을 수 없습니다." });
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[PUT /api/me/reviews/:reviewId]", e);
      return res.status(500).json({ message: "리뷰 수정 실패" });
    }
  });

  // ✅ 리뷰 삭제(본인 것만)
  router.delete("/me/reviews/:reviewId", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const reviewId = Number(req.params.reviewId);

      const [result] = await pool.query(
        `DELETE FROM reviews WHERE review_id=? AND user_id=?`,
        [reviewId, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "리뷰를 찾을 수 없습니다." });
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[DELETE /api/me/reviews/:reviewId]", e);
      return res.status(500).json({ message: "리뷰 삭제 실패" });
    }
  });

  // ✅ 설정 저장(upsert)
  router.put("/me/settings", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);
      const { marketing, profilePublic } = req.body || {};

      await pool.query(
        `
        INSERT INTO user_settings (user_id, marketing, profile_public)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          marketing=VALUES(marketing),
          profile_public=VALUES(profile_public)
        `,
        [userId, marketing ? 1 : 0, profilePublic ? 1 : 0]
      );

      return res.json({ ok: true });
    } catch (e) {
      console.error("[PUT /api/me/settings]", e);
      return res.status(500).json({ message: "설정 저장 실패" });
    }
  });

  // ✅ 회원 탈퇴
  router.delete("/me", authRequired, async (req, res) => {
    try {
      const userId = Number(req.user.sub);

      // FK cascade가 없을 수도 있으니 안전하게 먼저 삭제
      await pool.query(`DELETE FROM user_settings WHERE user_id=?`, [userId]);
      await pool.query(`DELETE FROM reviews WHERE user_id=?`, [userId]);
      await pool.query(`DELETE FROM users WHERE user_id=?`, [userId]);

      return res.json({ ok: true });
    } catch (e) {
      console.error("[DELETE /api/me]", e);
      return res.status(500).json({ message: "회원 탈퇴 실패" });
    }
  });

  return router;
}
