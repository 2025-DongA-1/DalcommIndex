// src/components/KakaoMap.jsx
import { useEffect, useRef } from "react";
import { loadKakao } from "../lib/loadKakao.js";

const KakaoMap = ({ results = [], focusedIndex, setFocusedIndex }) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  // 1) 지도 초기화 (최초 1회) - ✅ SDK 로드 완료 후 실행
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const kakao = await loadKakao();
        if (!alive) return;
        if (!containerRef.current) return;

        const options = {
          center: new kakao.maps.LatLng(35.1595454, 126.8526012),
          level: 8,
        };

        const map = new kakao.maps.Map(containerRef.current, options);
        mapRef.current = map;
        infoWindowRef.current = new kakao.maps.InfoWindow({ removable: true });
      } catch (e) {
        console.error("[KakaoMap] SDK load/init failed:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 2) results 변경 시 마커 렌더링
  useEffect(() => {
    if (!mapRef.current) return;
    if (!window.kakao?.maps) return;

    // 기존 마커 제거
    markersRef.current.forEach((m) => m && m.setMap(null));
    markersRef.current = new Array(results.length).fill(null);

    if (!results || results.length === 0) return;

    const bounds = new window.kakao.maps.LatLngBounds();

    results.forEach((cafe, idx) => {
      if (!cafe?.y || !cafe?.x) return;

      const position = new window.kakao.maps.LatLng(cafe.y, cafe.x);
      const marker = new window.kakao.maps.Marker({
        map: mapRef.current,
        position,
      });

      window.kakao.maps.event.addListener(marker, "click", () => {
        setFocusedIndex?.(idx);

        const content = `
          <div style="padding:6px 8px;font-size:12px;line-height:1.35;">
            <div style="font-weight:700;margin-bottom:4px;">${cafe.name || ""}</div>
            <div style="margin-bottom:4px;">${cafe.address || ""}</div>
            ${
              cafe.url
                ? `<a href="${cafe.url}" target="_blank" style="color:#2f80ed;text-decoration:none;">카카오맵에서 보기</a>`
                : ""
            }
          </div>
        `;
        infoWindowRef.current?.setContent(content);
        infoWindowRef.current?.open(mapRef.current, marker);
      });

      markersRef.current[idx] = marker;
      bounds.extend(position);
    });

    if (!bounds.isEmpty()) {
      mapRef.current.setBounds(bounds);
    }
  }, [results, setFocusedIndex]);

  // 3) 리스트 클릭 → 지도 이동
  useEffect(() => {
    if (focusedIndex === null || focusedIndex === undefined) return;
    if (!window.kakao?.maps) return;

    const marker = markersRef.current?.[focusedIndex];
    const map = mapRef.current;
    if (!map || !marker) return;

    map.setLevel(4);
    map.panTo(marker.getPosition());
    window.kakao.maps.event.trigger(marker, "click");
  }, [focusedIndex]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

export default KakaoMap;
