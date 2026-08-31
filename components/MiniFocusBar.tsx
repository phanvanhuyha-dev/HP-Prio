"use client";
import { useEffect, useState } from "react";
import { docPhienDangDo } from "./FocusMode";

// Thanh mini hiện khi phiên tập trung được thu nhỏ: đồng hồ vẫn chạy trong
// FocusMode (được mount ẩn), thanh này chỉ ĐỌC mốc thời gian từ localStorage
// để hiển thị, bấm vào là mở lại màn hình tập trung.
export default function MiniFocusBar({ tieuDe, onMo }: { tieuDe: string; onMo: () => void }) {
  const [conLai, setConLai] = useState(0);

  useEffect(() => {
    const tick = () => {
      const p = docPhienDangDo();
      setConLai(p ? Math.max(0, Math.round((p.ketThucLuc - Date.now()) / 1000)) : 0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const mm = `${Math.floor(conLai / 60)}:${String(conLai % 60).padStart(2, "0")}`;

  return (
    <button className="mini-focus" onClick={onMo} aria-label={`Mở lại phiên tập trung: ${tieuDe}`}>
      <span aria-hidden="true" style={{ color: "var(--amber)" }}>▶</span>
      <span className="mono" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{mm}</span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          color: "var(--slate)"
        }}
      >
        {tieuDe}
      </span>
    </button>
  );
}
