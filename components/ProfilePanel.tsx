"use client";
import { useEffect, useState } from "react";

// Khu hồ sơ ở cuối trang: đổi tên gọi hiển thị trong lời chào.
// Tên lưu trong localStorage của từng thiết bị (app một người dùng, không
// đáng dựng thêm bảng cấu hình chỉ cho một chuỗi ngắn).
export default function ProfilePanel({
  email,
  ten,
  onDoiTen
}: {
  email: string;
  ten: string;
  onDoiTen: (ten: string) => void;
}) {
  const [mo, setMo] = useState(false);
  const [nhap, setNhap] = useState(ten);

  useEffect(() => {
    setNhap(ten);
  }, [ten]);

  return (
    <section style={{ marginTop: 26 }} aria-labelledby="tieu-de-ho-so">
      <button
        onClick={() => setMo((v) => !v)}
        aria-expanded={mo}
        style={{
          background: "none",
          border: "none",
          padding: "8px 0",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--slate)",
          fontSize: 13.5
        }}
      >
        <span id="tieu-de-ho-so" style={{ fontSize: 16, fontWeight: 600, color: "var(--cream)" }}>
          Hồ sơ
        </span>
        <span className="mono" style={{ fontSize: 11.5 }}>{mo ? "thu gọn" : "xem"}</span>
      </button>

      {mo && (
        <div
          style={{
            background: "var(--navy-2)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}
        >
          <div>
            <label
              htmlFor="ho-so-ten"
              className="mono"
              style={{ display: "block", fontSize: 11, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}
            >
              Tên gọi
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="ho-so-ten"
                value={nhap}
                onChange={(e) => setNhap(e.target.value.slice(0, 40))}
                placeholder="vd: anh Hà"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onDoiTen(nhap.trim());
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "var(--field)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: "var(--cream)",
                  fontSize: 14,
                  minHeight: 44,
                  fontFamily: "var(--font-body)"
                }}
              />
              <button
                onClick={() => onDoiTen(nhap.trim())}
                disabled={nhap.trim() === ten}
                style={{
                  background: nhap.trim() !== ten ? "var(--amber)" : "var(--field)",
                  color: nhap.trim() !== ten ? "var(--navy)" : "var(--slate)",
                  border: "none",
                  borderRadius: 8,
                  padding: "0 18px",
                  fontSize: 13.5,
                  fontWeight: 700,
                  minHeight: 44,
                  flexShrink: 0
                }}
              >
                Lưu
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--slate)", margin: "6px 0 0" }}>
              Dùng trong lời chào, đồng bộ trên mọi thiết bị của anh. Để trống sẽ lấy tên từ tài khoản Google.
            </p>
          </div>

          <div className="mono" style={{ fontSize: 11.5, color: "var(--slate)" }}>
            Đăng nhập bằng {email}
          </div>
        </div>
      )}
    </section>
  );
}
