// src/components/PhotoLightbox.jsx
import { useEffect, useMemo } from "react";

export default function PhotoLightbox({
  open,
  photos,
  index = 0,
  onIndexChange,
  onClose,
  ariaLabel = "사진 크게 보기",
}) {
  const list = useMemo(() => (Array.isArray(photos) ? photos.filter(Boolean) : []), [photos]);
  const n = list.length;

  const safeIndex = n ? ((Number(index) % n) + n) % n : 0;
  const src = n ? list[safeIndex] : "";

  const goPrev = () => {
    if (!n) return;
    onIndexChange?.((safeIndex - 1 + n) % n);
  };
  const goNext = () => {
    if (!n) return;
    onIndexChange?.((safeIndex + 1) % n);
  };

  // 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 키보드: ESC/좌우
  useEffect(() => {
    if (!open || n === 0) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, n, safeIndex]);

  if (!open || n === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={() => onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(1100px, 96vw)",
          height: "min(760px, 92vh)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={src}
          alt="확대 이미지"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: 12,
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            background: "rgba(255,255,255,0.04)",
          }}
        />

        {/* 닫기 */}
        <button
          type="button"
          onClick={() => onClose?.()}
          aria-label="닫기"
          title="닫기"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(0,0,0,0.35)",
            color: "#fff",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        {/* 좌/우 이동 */}
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="이전 사진"
              title="이전"
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(0,0,0,0.35)",
                color: "#fff",
                fontSize: 26,
                cursor: "pointer",
              }}
            >
              ‹
            </button>

            <button
              type="button"
              onClick={goNext}
              aria-label="다음 사진"
              title="다음"
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(0,0,0,0.35)",
                color: "#fff",
                fontSize: 26,
                cursor: "pointer",
              }}
            >
              ›
            </button>

            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.35)",
                color: "#fff",
                fontSize: 12,
              }}
            >
              {safeIndex + 1} / {n}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
