// src/lib/loadKakao.js
let kakaoPromise = null;

export function loadKakao() {
  if (window.kakao?.maps?.load) return Promise.resolve(window.kakao);
  if (kakaoPromise) return kakaoPromise;

  const key = import.meta.env.VITE_KAKAO_MAP_APPKEY;
  if (!key) return Promise.reject(new Error("VITE_KAKAO_MAP_APPKEY가 없습니다. (.env 확인)"));

  kakaoPromise = new Promise((resolve, reject) => {
    // 중복 삽입 방지
    const existing = document.querySelector('script[data-kakao-sdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => {
        window.kakao.maps.load(() => resolve(window.kakao));
      });
      existing.addEventListener("error", () => reject(new Error("Kakao SDK 로드 실패")));
      return;
    }

    const script = document.createElement("script");
    script.dataset.kakaoSdk = "true";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services`;

    script.onload = () => {
      if (!window.kakao?.maps?.load) return reject(new Error("Kakao SDK는 로드됐지만 maps.load가 없습니다."));
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => reject(new Error("Kakao SDK 로드 실패(네트워크/키/도메인 등록 확인)"));

    document.head.appendChild(script);
  });

  return kakaoPromise;
}
