"use client";
import { useEffect, useRef, useState } from "react";
import { docLoi, loiThanThien } from "@/lib/client-api";
import { TEN_TRO_LY } from "@/lib/branding";
import ReflectionLog from "./ReflectionLog";
import { IcSpark } from "./icons";

type ThongKe = {
  focusNgay: { ngay: string; giay: number; phien: number }[];
  xong7: number;
  tao7: number;
  quaHan: number;
  dangMo: number;
  vuaXong: string[];
};

const THU_NGAN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Bảy ngày gần nhất theo giờ Việt Nam, cũ nhất trước
function baNgayGanDay(): { ngay: string; nhan: string }[] {
  const kq: { ngay: string; nhan: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() + 7 * 3600e3 - i * 86400000);
    kq.push({ ngay: d.toISOString().slice(0, 10), nhan: THU_NGAN[d.getUTCDay()] });
  }
  return kq;
}

// Tab "Nhìn lại": thống kê tuần và nhật ký cuối ngày, tách khỏi màn hình chính
// để không ảnh hưởng tính năng hàng ngày. (Đổi tên gọi nay nằm ngay cạnh lời
// chào ở đầu trang, không cần khu hồ sơ riêng nữa.)
export default function NhinLai({ email }: { email: string }) {
  const [tk, setTk] = useState<ThongKe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tomTat, setTomTat] = useState<string | null>(null);
  const [dangTomTat, setDangTomTat] = useState(false);
  const dangGoiRef = useRef(false);

  useEffect(() => {
    fetch("/api/stats")
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!r.ok) throw new Error(await docLoi(r));
        setTk(await r.json());
      })
      .catch((e) => setError(loiThanThien(e)));
  }, []);

  async function taoTomTat() {
    if (dangGoiRef.current) return;
    dangGoiRef.current = true;
    setDangTomTat(true);
    setError(null);
    try {
      const r = await fetch("/api/stats", { method: "POST" });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error(await docLoi(r));
      setTomTat((await r.json()).tomTat);
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      dangGoiRef.current = false;
      setDangTomTat(false);
    }
  }

  const ngays = baNgayGanDay();
  const giayTheoNgay = new Map((tk?.focusNgay ?? []).map((n) => [n.ngay, n.giay]));
  const maxGiay = Math.max(1, ...ngays.map((n) => giayTheoNgay.get(n.ngay) ?? 0));
  const tongPhut = Math.round((tk?.focusNgay ?? []).reduce((s, n) => s + n.giay, 0) / 60);
  const tongPhien = (tk?.focusNgay ?? []).reduce((s, n) => s + n.phien, 0);

  return (
    <div>
      <h2 className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--slate)", margin: "0 0 12px" }}>
        7 ngày qua
      </h2>

      {error && (
        <p role="alert" style={{ color: "var(--coral)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {/* Bốn con số chính */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          [`${tongPhut}`, "phút tập trung", "var(--amber)"],
          [`${tongPhien}`, "phiên", "var(--cream)"],
          [`${tk?.xong7 ?? "–"}`, "việc đã xong", "var(--teal)"],
          [`${tk?.quaHan ?? "–"}`, "đang quá hạn", (tk?.quaHan ?? 0) > 0 ? "var(--coral)" : "var(--cream)"]
        ].map(([so, nhan, mau], i) => (
          <div key={i} style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: mau as string, lineHeight: 1 }}>{so}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6 }}>
              {nhan}
            </div>
          </div>
        ))}
      </div>

      {/* Biểu đồ cột giờ tập trung theo ngày, vẽ bằng div, không cần thư viện */}
      <div style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Tập trung theo ngày
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 90 }}>
          {ngays.map((n) => {
            const giay = giayTheoNgay.get(n.ngay) ?? 0;
            const cao = giay > 0 ? Math.max(6, (giay / maxGiay) * 78) : 3;
            return (
              <div key={n.ngay} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div
                  title={`${n.nhan}: ${Math.round(giay / 60)} phút`}
                  style={{
                    width: "100%",
                    maxWidth: 30,
                    height: cao,
                    borderRadius: 4,
                    background: giay > 0 ? "var(--amber)" : "var(--field)"
                  }}
                />
                <span className="mono" style={{ fontSize: 10, color: "var(--slate)" }}>{n.nhan}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tóm tắt tuần: gọi AI theo yêu cầu, không chạy nền */}
      <div style={{ marginBottom: 14 }}>
        {tomTat ? (
          <div style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderLeft: "3px solid var(--amber)", borderRadius: 12, padding: "12px 14px" }}>
            <div
              className="mono"
              style={{ fontSize: 10.5, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}
            >
              <IcSpark size={11} /> {TEN_TRO_LY} nhận định
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--cream)", margin: 0, whiteSpace: "pre-wrap" }}>{tomTat}</p>
          </div>
        ) : (
          <button
            onClick={taoTomTat}
            disabled={dangTomTat || !tk}
            style={{
              background: "transparent",
              border: "1px solid var(--amber)",
              color: "var(--amber)",
              borderRadius: 10,
              padding: "11px 18px",
              fontSize: 13.5,
              fontWeight: 600,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              opacity: dangTomTat ? 0.6 : 1
            }}
          >
            {dangTomTat ? <span className="spinner" aria-hidden="true" /> : <IcSpark size={13} />}
            {dangTomTat ? "Đang viết…" : `${TEN_TRO_LY} tóm tắt tuần`}
          </button>
        )}
      </div>

      {tk && tk.vuaXong.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Vừa hoàn thành
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {tk.vuaXong.map((t, i) => (
              <li key={i} style={{ fontSize: 13, color: "var(--slate)", marginBottom: 4 }}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <ReflectionLog />

      <p className="mono" style={{ fontSize: 11, color: "var(--slate)", textAlign: "center", marginTop: 28 }}>
        Đăng nhập bằng {email}
      </p>
    </div>
  );
}
