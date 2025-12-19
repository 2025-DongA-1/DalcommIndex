// src/components/KakaoMap.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { loadKakao } from "../lib/loadKakao.js";

function getPlaceKey(p) {
  return p?.id ?? p?.cafe_id ?? p?.cafeId ?? p?.cafeID ?? p?.name ?? null;
}

export default function KakaoMap({
  results = [],
  focusedIndex,
  setFocusedIndex,
  onSelectPlace,

  initialView, // {lat, lng, level}
  onViewChange, // (view) => void

  fitBoundsOnResults = false,
  onFitBoundsDone,

  relayoutKey,

  selectedId,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  const kakaoRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const appliedInitialViewRef = useRef(false);

  // 최신 콜백을 ref로 유지(초기화 deps 꼬임 방지)
  const onViewChangeRef = useRef(onViewChange);
  const onSelectPlaceRef = useRef(onSelectPlace);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);

  const getKakao = () => kakaoRef.current || window.kakao;

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m && m.setMap(null));
    markersRef.current = [];
  }, []);

  const renderMarkers = useCallback(
    (opts = {}) => {
      const kakao = getKakao();
      const map = mapRef.current;
      if (!map || !kakao?.maps) return;

      clearMarkers();

      const list = Array.isArray(results) ? results : [];
      if (!list.length) return;

      const bounds = new kakao.maps.LatLngBounds();

      list.forEach((cafe, idx) => {
        const lat = Number(cafe?.y);
        const lng = Number(cafe?.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const position = new kakao.maps.LatLng(lat, lng);
        const marker = new kakao.maps.Marker({ map, position });

        const key = getPlaceKey(cafe);
        if (selectedId != null && String(key) === String(selectedId)) {
          marker.setZIndex(999);
        }

        kakao.maps.event.addListener(marker, "click", () => {
          setFocusedIndex?.(idx);
          onSelectPlaceRef.current?.(cafe, idx);

          const content = `
            <div style="padding:6px 8px;font-size:12px;line-height:1.35;">
              <div style="font-weight:700;margin-bottom:4px;">${cafe?.name || ""}</div>
            </div>
          `;
          infoWindowRef.current?.setContent(content);
          infoWindowRef.current?.open(map, marker);
        });

        markersRef.current[idx] = marker;
        bounds.extend(position);
      });

      if (opts.fitBounds && !bounds.isEmpty()) {
        map.setBounds(bounds);
        onFitBoundsDone?.();
      }
    },
    [results, selectedId, setFocusedIndex, clearMarkers, onFitBoundsDone]
  );

  // 1) 지도 초기화 (1회)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const kakao = await loadKakao();
        if (!alive) return;
        if (!containerRef.current) return;

        kakaoRef.current = kakao;

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(35.1595454, 126.8526012),
          level: 8,
        });

        mapRef.current = map;
        infoWindowRef.current = new kakao.maps.InfoWindow({ removable: true });

        // ✅ idle 저장
        const onIdle = () => {
          const c = map.getCenter();
          onViewChangeRef.current?.({
            lat: c.getLat(),
            lng: c.getLng(),
            level: map.getLevel(),
          });
        };
        kakao.maps.event.addListener(map, "idle", onIdle);

        // ✅ 지도 클릭 시 인포윈도우 닫기
        kakao.maps.event.addListener(map, "click", () => {
          infoWindowRef.current?.close?.();
        });

        // 처음에도 뷰 저장 한 번
        onIdle();

        setMapReady(true);
      } catch (e) {
        console.error("[KakaoMap] SDK load/init failed:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 1-1) 초기 뷰 복구 (mapReady 이후 1회)
  useEffect(() => {
    if (!mapReady) return;
    if (appliedInitialViewRef.current) return;

    const kakao = getKakao();
    const map = mapRef.current;
    if (!map || !kakao?.maps) return;

    if (initialView && typeof initialView.lat === "number" && typeof initialView.lng === "number") {
      map.setLevel(Number(initialView.level ?? 8));
      map.setCenter(new kakao.maps.LatLng(initialView.lat, initialView.lng));
      appliedInitialViewRef.current = true;
    }
  }, [mapReady, initialView]);

  // 2) results/mapReady 변화 시 마커 렌더링
  useEffect(() => {
    if (!mapReady) return;
    renderMarkers({ fitBounds: fitBoundsOnResults });
  }, [mapReady, renderMarkers, fitBoundsOnResults]);

  // 3) 리스트 클릭(index) → 지도 이동/마커 클릭
  useEffect(() => {
    if (!mapReady) return;
    if (focusedIndex === null || focusedIndex === undefined) return;

    const kakao = getKakao();
    const map = mapRef.current;
    const marker = markersRef.current?.[focusedIndex];
    if (!map || !marker || !kakao?.maps) return;

    map.setLevel(4);
    map.panTo(marker.getPosition());
    kakao.maps.event.trigger(marker, "click");
  }, [mapReady, focusedIndex]);

  // 4) 팝업 열고/닫을 때 relayout (센터 유지)
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const center = map.getCenter();
    window.setTimeout(() => {
      map.relayout();
      if (center) map.setCenter(center);
    }, 0);
  }, [mapReady, relayoutKey]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
