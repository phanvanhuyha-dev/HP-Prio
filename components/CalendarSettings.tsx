"use client";
import { useEffect, useState } from "react";
import { IcLich } from "./icons";

// Khu nối lịch họp. Trước đây liên kết ICS nằm trong biến môi trường trên
// Vercel, nghĩa là muốn đổi lịch phải vào bảng điều khiển rồi deploy lại, và
// mọi tài khoản dùng chung một lịch. Nay mỗi người tự dán liên kết của mình.

async function docLoi(res: Response): Promise<string> {
  try {
    const d = await res.json();
    return [d?.error, d?.khacPhuc].filter(Boolean).join(". ") || "Không lưu được";
  } catch {
    return "Không lưu được";
  }
}

export default function CalendarSettings({
  onDong,
  onLuuXong
}: {
  onDong: () => void;
  onLuuXong: (thongBao: string) => void;
}) {
  const [noiDung, setNoiDung] = useState("");
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error(await docLoi(r));
        const d = await r.json();
        setNoiDung((d.icsUrls ?? []).join("\n"));
      })
      .catch((e) => setLoi(e.message))
      .finally(() => setDangTai(false));
  }, []);

  async function luu() {
    setDangLuu(true);
    setLoi(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icsUrls: noiDung })
      });
      if (!res.ok) throw new Error(await docLoi(res));
      const d = await res.json();
      const n = (d.icsUrls ?? []).length;
      onLuuXong(n === 0 ? "Đã gỡ lịch họp" : `Đã nối ${n} lịch họp`);
      onDong();
    } catch (e: any) {
      setLoi(e.message ?? "Không lưu được");
    } finally {
      setDangLuu(false);
    }
  }

  return (
    <section
      aria-label="Nối lịch họp"
      style={{
        background: "var(--navy-2)",
        border: "1px solid var(--line)",
        borderLeft: "3px solid var(--amber)",
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 16
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--amber)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            display: "inline-flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <IcLich size={12} /> Nối lịch họp
        </span>
        <button
          onClick={onDong}
          aria-label="Đóng khu nối lịch"
          className="tap"
          style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 13, margin: -10 }}
        >
          ✕
        </button>
      </div>

      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--slate)", margin: "0 0 8px" }}>
        Dán liên kết iCal bí mật, mỗi lịch một dòng, tối đa 5 lịch. Outlook: Cài đặt, Lịch, Lịch dùng
        chung, Xuất bản lịch. Google: Cài đặt lịch, Tích hợp lịch, Địa chỉ bí mật ở định dạng iCal.
        Giữ kín liên kết này như mật khẩu vì nó cho đọc toàn bộ lịch của anh.
      </p>

      <textarea
        value={noiDung}
        onChange={(e) => setNoiDung(e.target.value)}
        disabled={dangTai || dangLuu}
        rows={3}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={dangTai ? "Đang tải..." : "https://outlook.office365.com/owa/calendar/.../calendar.ics"}
        aria-label="Liên kết lịch iCal"
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "var(--field)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "9px 11px",
          color: "var(--cream)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: 1.5,
          resize: "vertical"
        }}
      />

      {loi && (
        <p role="alert" style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--coral)", margin: "8px 0 0" }}>
          {loi}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={luu}
          disabled={dangTai || dangLuu}
          style={{
            background: "var(--amber)",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            minHeight: 40,
            color: "var(--navy)",
            opacity: dangTai || dangLuu ? 0.6 : 1
          }}
        >
          {dangLuu ? "Đang lưu..." : "Lưu"}
        </button>
        <button
          onClick={onDong}
          disabled={dangLuu}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            minHeight: 40,
            color: "var(--slate)"
          }}
        >
          Bỏ qua
        </button>
      </div>
    </section>
  );
}
