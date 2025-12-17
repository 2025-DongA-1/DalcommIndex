import { useEffect, useRef } from 'react';

const KakaoMap = ({ results, focusedIndex, setFocusedIndex }) => {
  const mapRef = useRef(null);      // 지도 객체 저장
  const containerRef = useRef(null); // 지도 DOM 저장
  const markersRef = useRef([]);    // 마커 배열 저장
  const infoWindowRef = useRef(null); // 인포윈도우 객체 저장

  // 1. 지도 초기화 (최초 1회)
  useEffect(() => {
    if (!window.kakao) return;

    const options = {
      center: new window.kakao.maps.LatLng(35.1595454, 126.8526012),
      level: 8,
    };

    const map = new window.kakao.maps.Map(containerRef.current, options);
    mapRef.current = map;
    infoWindowRef.current = new window.kakao.maps.InfoWindow({ removable: true });
  }, []);

  // 2. 검색 결과(results)가 변경될 때 마커 렌더링
  useEffect(() => {
    if (!mapRef.current) return;

    // 기존 마커 제거
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    if (results.length === 0) return;

    const bounds = new window.kakao.maps.LatLngBounds();

    results.forEach((cafe, idx) => {
      if (!cafe.y || !cafe.x) return;

      const position = new window.kakao.maps.LatLng(cafe.y, cafe.x);
      const marker = new window.kakao.maps.Marker({
        map: mapRef.current,
        position: position
      });

      // 마커 클릭 이벤트
      window.kakao.maps.event.addListener(marker, "click", () => {
        const content = `
          <div style="padding:5px;font-size:12px;">
            <div style="font-weight:600;margin-bottom:4px;">${cafe.name}</div>
            <div style="margin-bottom:2px;">${cafe.address || ""}</div>
            ${cafe.url ? `<a href="${cafe.url}" target="_blank" style="color:#2f80ed;">카카오맵에서 보기</a>` : ""}
          </div>
        `;
        infoWindowRef.current.setContent(content);
        infoWindowRef.current.open(mapRef.current, marker);
      });

      markersRef.current.push(marker);
      bounds.extend(position);
    });

    // 모든 마커가 보이도록 지도 범위 재설정
    if (!bounds.isEmpty()) {
      mapRef.current.setBounds(bounds);
    }
  }, [results]);

  // 3. 리스트에서 항목 클릭 시 해당 마커로 이동 및 인포윈도우 열기
  useEffect(() => {
    if (focusedIndex === null || !markersRef.current[focusedIndex]) return;

    const marker = markersRef.current[focusedIndex];
    const map = mapRef.current;

    map.setLevel(4);
    map.panTo(marker.getPosition());
    
    // 마커 클릭 이벤트 트리거 (인포윈도우 열기 위함)
    window.kakao.maps.event.trigger(marker, 'click');
  }, [focusedIndex]);

  return <div id="map" ref={containerRef} style={{ width: '100%', height: '100%' }}></div>;
};

export default KakaoMap;