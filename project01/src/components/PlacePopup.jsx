import { useEffect } from "react";

export default function PlacePopup({ open, place, onClose }) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !place) return null;

  const name = place?.name || "카페 이름";
  const address = place?.address || "주소 정보 없음";
  const region = place?.region || "";
  const score = place?.score ? Number(place.score).toFixed(1) : null;

  const atmos = place?.atmosphere || place?.atmosphere_norm || "";
  const purpose = place?.purpose || place?.purpose_norm || "";
  const taste = place?.taste || place?.taste_norm || "";
  const parking = place?.parking || "";
  const desc = place?.content || place?.summary || place?.desc || "";

  const cafeIdRaw = place?.id ?? place?.cafe_id ?? place?.cafeId ?? place?.cafeID ?? name;
  const cafeId = encodeURIComponent(String(cafeIdRaw));
  const cafeNameQ = encodeURIComponent(name);

  const goDetail = () => {
    // ✅ 상세로 이동 + 현재 카페 데이터를 state로 넘겨서 상세에서 바로 표시 가능
    navigate(`/cafe/${cafeId}?name=${cafeNameQ}`, { state: { cafe: place } });
    onClose?.();
  };

  return (
    <div className="place-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="place-modal" onClick={(e) => e.stopPropagation()}>
        <div className="place-modal-head">
          <div className="place-modal-title">
            {name} {score ? <span className="place-score">★ {score}</span> : null}
          </div>
          <button className="place-modal-close" type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="place-modal-body">
          <div className="place-meta">
            {region ? <span className="place-chip">{region}</span> : null}
            <span className="place-chip">{address}</span>
            {parking ? <span className="place-chip">주차: {parking}</span> : null}
          </div>

          <div className="place-tags">
            {atmos ? <span className="place-tag">분위기: {atmos}</span> : null}
            {purpose ? <span className="place-tag">목적: {purpose}</span> : null}
            {taste ? <span className="place-tag">맛: {taste}</span> : null}
          </div>

          {desc ? <div className="place-desc">{desc}</div> : null}

          <div className="place-modal-actions">
            {/* ✅ 기존 “지도 링크” 버튼 → “상세페이지” 버튼으로 변경 */}
            <button className="place-btn primary" type="button" onClick={goDetail}>
              상세페이지
            </button>
            
            <button className="place-btn primary" type="button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
