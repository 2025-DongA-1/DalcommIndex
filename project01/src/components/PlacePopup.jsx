// src/components/PlacePopup.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function PlacePopup({ open, pos, place, onClose }) {
    const navigate = useNavigate();

    if (!open) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        transform: "translate(-50%, -110%)",
        zIndex: 9999,
      }}
      onClick={(e) => e.stopPropagation()} // 팝업 클릭시 바깥 클릭으로 닫히지 않게
    >
      <div
        style={{
          width: 320,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {place?.name ?? "장소"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
            }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
          {place?.address ?? "주소 정보 없음"}
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
          {place?.content ?? " 없ㅇㅁ"}
        </div>

        {place?.phone && (
          <div style={{ marginTop: 6, fontSize: 13, color: "#111827" }}>
            📞 {place.phone}
          </div>
        )}

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button
            type="button"

            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}

             onClick={() => {
               if (!place) return;
           
               // id 있으면 /cafe/아이디 로 이동
               if (place.id) {
                 navigate(`/cafe/${place.id}`);
                 return;
               }
           
               // id 없으면 이름으로라도 넘김(임시)
               navigate(`/cafe?name=${encodeURIComponent(place.name || "")}`);
             }}
          >
            상세보기
          </button>

         
        </div>
      </div>
    </div>
  );
}
