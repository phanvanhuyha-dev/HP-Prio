"use client";
import { useEffect, useState } from "react";

type SuKien = { tieuDe: string; batDau: string; ketThuc: string; caNgay: boolean };

function gioVN(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Dải lịch họp hôm nay phía trên danh sách việc, kiểu SCHEDULE trong ảnh mẫu:
// chấm màu + giờ + tên cuộc họp. Chưa cấu hình ICS_URLS hoặc hôm nay trống
// lịch thì không chiếm một pixel nào.
export default function CalendarStrip({ lamMoi = 0 }: { lamMoi?: number }) {
  const [suKien, setSuKien] = useState<SuKien[]>([]);

  // lamMoi tăng lên mỗi lần người dùng lưu liên kết lịch mới, để dải lịch
  // hiện ngay thay vì đợi lần mở app sau.
  useEffect(() => {
    fetch("/api/calendar")
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        // Gỡ hết liên kết thì phải dọn luôn lịch đang hiện, không giữ bản cũ
        if (!d.cauHinh) {
          setSuKien([]);
          return;
        }
        // Chỉ hiện lịch HÔM NAY theo giờ Việt Nam
        const t7 = Date.now() + 7 * 3600e3;
        const cuoiNgay = Math.floor(t7 / 86400000) * 86400000 + 86400000 - 7 * 3600e3;
        setSuKien((d.suKien ?? []).filter((s: SuKien) => new Date(s.batDau).getTime() < cuoiNgay));
      })
      .catch(() => {});
  }, [lamMoi]);

  if (suKien.length === 0) return null;

  const bayGio = Date.now();

  return (
    <section style={{ marginBottom: 18 }} aria-labelledby="tieu-de-lich">
      <h2
        id="tieu-de-lich"
        className="mono"
        style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--slate)", margin: "0 0 8px" }}
      >
        Lịch hôm nay
      </h2>
      <div style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "4px 14px" }}>
        {suKien.map((s, i) => {
          const daQua = new Date(s.ketThuc).getTime() < bayGio;
          const dangDienRa = !daQua && new Date(s.batDau).getTime() <= bayGio;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "9px 0",
                borderBottom: i < suKien.length - 1 ? "1px solid var(--line)" : "none",
                opacity: daQua ? 0.45 : 1
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: dangDienRa ? "var(--teal)" : "var(--amber)",
                  flexShrink: 0,
                  alignSelf: "center"
                }}
              />
              <span className="mono" style={{ fontSize: 12, color: "var(--slate)", flexShrink: 0, minWidth: 42 }}>
                {s.caNgay ? "cả ngày" : gioVN(s.batDau)}
              </span>
              <span
                className="viec-tieu-de"
                style={{
                  fontSize: 13.5,
                  color: "var(--cream)",
                  textDecoration: daQua ? "line-through" : "none",
                  minWidth: 0
                }}
              >
                {s.tieuDe}
                {dangDienRa && (
                  <span className="mono" style={{ fontSize: 10, color: "var(--teal)", marginLeft: 8 }}>
                    đang diễn ra
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
