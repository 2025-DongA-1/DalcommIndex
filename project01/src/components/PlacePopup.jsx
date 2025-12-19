// src/components/PlacePopup.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function PlacePopup({ open, place, onClose }) {
  const navigate = useNavigate();

  const [tab, setTab] = useState("home"); // home | review | photo | info
  const [moreOpen, setMoreOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setTab("home");
      setMoreOpen(false);
    }
  }, [open]);

  // ✅ Hook 규칙 준수: useMemo를 return null 보다 위에서 항상 호출
  const photos = useMemo(() => {
    if (!place) return [];

    const raw =
      place?.imageUrls ||
      place?.images ||
      place?.image_url ||
      place?.img_url ||
      place?.img ||
      place?.photo ||
      place?.photos ||
      "";

    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === "string") {
      arr = raw
        .split(/[,\n|]/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const uniq = [];
    const set = new Set();
    for (const u of arr) {
      const key = String(u);
      if (set.has(key)) continue;
      set.add(key);
      uniq.push(key);
    }
    return uniq;
  }, [place]);

  if (!open || !place) return null;

  const name = place?.name || "카페 이름";
  const address = place?.address || "주소 정보 없음";
  const region = place?.region || "";
  const score = place?.score ? Number(place.score).toFixed(1) : null;

  const phone = place?.phone || place?.tel || place?.telephone || place?.contact || "";
  const homepage = place?.homepage || place?.site || place?.website || place?.url || "";
  const hours = place?.hours || place?.open_hours || place?.openTime || place?.time || "";

  const atmos = place?.atmosphere || place?.atmosphere_norm || "";
  const purpose = place?.purpose || place?.purpose_norm || "";
  const taste = place?.taste || place?.taste_norm || "";
  const parking = place?.parking || "";

  const desc = place?.content || place?.summary || place?.desc || "";

  const lat = place?.y;
  const lng = place?.x;

  const kakaoMapUrl =
    place?.url ||
    (lat && lng ? `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}` : "");

  const cafeIdRaw = place?.id ?? place?.cafe_id ?? place?.cafeId ?? place?.cafeID ?? name;
  const cafeId = encodeURIComponent(String(cafeIdRaw));
  const cafeNameQ = encodeURIComponent(name);

  const topPhotos = photos.slice(0, 3);
  const extraCount = Math.max(0, photos.length - topPhotos.length);

  const goDetail = () => {
    sessionStorage.setItem("dalcomm_keep_map_state_v1", "1");
    navigate(`/cafe/${cafeId}?name=${cafeNameQ}`, { state: { cafe: place } });
    onClose?.();
  };

  const onShare = async () => {
    const shareText = `${name}\n${address}\n${kakaoMapUrl || ""}`.trim();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        alert("링크가 복사되었습니다!");
        return;
      }
    } catch (e) {}
    window.prompt("복사해서 공유하세요:", shareText);
  };

  const InfoRow = ({ label, value, href }) => {
    if (!value) return null;
    return (
      <div className="pp-info-row">
        <div className="pp-info-label">{label}</div>
        <div className="pp-info-value">
          {href ? (
            <a className="pp-link" href={href} target="_blank" rel="noreferrer">
              {value}
            </a>
          ) : (
            value
          )}
        </div>
      </div>
    );
  };

  return (
    // ✅ 배경 클릭으로 닫기 제거(지도 조작 가능)
    <div className="place-modal-backdrop" role="dialog" aria-modal="true">
      <div className="place-modal pp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pp-handle" />

        {/* 사진 영역 */}
        <div className="pp-hero">
          <div className="pp-photoGrid">
            {topPhotos.length === 0 ? (
              <div className="pp-photo pp-photoMain pp-photoPh">사진 없음</div>
            ) : (
              <>
                <div className="pp-photo pp-photoMain">
                  <img className="pp-photoImg" src={topPhotos[0]} alt="대표 사진" />
                </div>

                <div className="pp-photoCol">
                  <div className="pp-photo">
                    {topPhotos[1] ? (
                      <img className="pp-photoImg" src={topPhotos[1]} alt="사진" />
                    ) : (
                      <div className="pp-photoPh">사진</div>
                    )}
                  </div>

                  <div className="pp-photo pp-photoLast">
                    {topPhotos[2] ? (
                      <img className="pp-photoImg" src={topPhotos[2]} alt="사진" />
                    ) : (
                      <div className="pp-photoPh">사진</div>
                    )}

                    {extraCount > 0 ? <div className="pp-moreBadge">+{extraCount}</div> : null}
                  </div>
                </div>
              </>
            )}
          </div>

          <button className="pp-close" type="button" onClick={onClose} aria-label="닫기" title="닫기">
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="pp-body">
          <div className="pp-titleArea">
            <div className="pp-title">
              {name}
              {score ? <span className="pp-score">★ {score}</span> : null}
            </div>
            <div className="pp-sub">
              {region ? <span className="pp-subItem">{region}</span> : null}
              <span className="pp-subItem">{address}</span>
            </div>
          </div>

          {/* ✅ 출발/도착 없음 */}

          <div className="pp-miniActions">
            <button
              className={`pp-miniBtn ${saved ? "is-on" : ""}`}
              type="button"
              onClick={() => setSaved((v) => !v)}
              title="저장"
            >
              ⭐ <span>저장</span>
            </button>

            <button className="pp-miniBtn" type="button" onClick={() => setTab("review")} title="리뷰">
              ✍️ <span>리뷰</span>
            </button>

            <button className="pp-miniBtn" type="button" onClick={onShare} title="공유">
              🔗 <span>공유</span>
            </button>
          </div>

          <div className="pp-tabs">
            <button type="button" className={`pp-tab ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
              홈
            </button>
            <button type="button" className={`pp-tab ${tab === "review" ? "active" : ""}`} onClick={() => setTab("review")}>
              리뷰
            </button>
            <button type="button" className={`pp-tab ${tab === "photo" ? "active" : ""}`} onClick={() => setTab("photo")}>
              사진
            </button>
            <button type="button" className={`pp-tab ${tab === "info" ? "active" : ""}`} onClick={() => setTab("info")}>
              정보
            </button>
          </div>

          {tab === "home" && (
            <>
              <div className="pp-chipRow">
                {atmos ? <span className="pp-chip">분위기: {atmos}</span> : null}
                {purpose ? <span className="pp-chip">목적: {purpose}</span> : null}
                {taste ? <span className="pp-chip">맛: {taste}</span> : null}
                {parking ? <span className="pp-chip">주차: {parking}</span> : null}
              </div>

              {desc ? <div className="pp-desc">{desc}</div> : null}

              <div className="pp-infoBox">
                <InfoRow label="주소" value={address} />
                <InfoRow label="전화" value={phone} href={phone ? `tel:${phone}` : ""} />
                <InfoRow label="영업" value={hours} />
                <InfoRow label="홈페이지" value={homepage} href={homepage} />
              </div>

              <button className="pp-moreBtn" type="button" onClick={() => setMoreOpen((v) => !v)}>
                {moreOpen ? "정보 접기" : "정보 더보기"}
              </button>

              {moreOpen && (
                <div className="pp-infoBox">
                  <InfoRow label="카카오맵" value={kakaoMapUrl ? "지도 열기" : ""} href={kakaoMapUrl} />
                  <InfoRow label="좌표" value={lat && lng ? `${lat}, ${lng}` : ""} />
                </div>
              )}

              <div className="pp-bottomActions">
                <button className="pp-mainBtn" type="button" onClick={goDetail}>
                  상세페이지
                </button>
              </div>
            </>
          )}

          {tab === "review" && (
            <div className="pp-tabBox">
              <div className="pp-tabTitle">리뷰</div>
              <div className="pp-tabText">(다음 단계) DB에 저장된 리뷰/블로그 요약을 여기에 붙이면 카드로 보여줄 수 있어요.</div>
              {kakaoMapUrl ? (
                <a className="pp-outlineBtn" href={kakaoMapUrl} target="_blank" rel="noreferrer">
                  카카오맵에서 보기
                </a>
              ) : null}
            </div>
          )}

          {tab === "photo" && (
            <div className="pp-tabBox">
              <div className="pp-tabTitle">사진</div>
              {photos.length === 0 ? (
                <div className="pp-tabText">등록된 사진이 없어요.</div>
              ) : (
                <div className="pp-photoAll">
                  {photos.map((p, i) => (
                    <div className="pp-photoThumb" key={`${p}-${i}`}>
                      <img className="pp-photoImg" src={p} alt="사진" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "info" && (
            <div className="pp-tabBox">
              <div className="pp-tabTitle">정보</div>
              <div className="pp-infoBox">
                <InfoRow label="주소" value={address} />
                <InfoRow label="전화" value={phone} href={phone ? `tel:${phone}` : ""} />
                <InfoRow label="영업" value={hours} />
                <InfoRow label="홈페이지" value={homepage} href={homepage} />
                <InfoRow label="주차" value={parking} />
              </div>

              <div className="pp-bottomActions">
                <button className="pp-mainBtn" type="button" onClick={goDetail}>
                  상세페이지
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
