"use client";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import PushSetup from "./PushSetup";
import { IcLich, IcPen, IcSpark } from "./icons";
import { DAI_TOI_DA_TEN_TRO_LY, TEN_TRO_LY_MAC_DINH } from "@/lib/branding";

// Một chỗ duy nhất cho mọi thứ thuộc về "cấu hình": tên gọi, tên trợ lý, lịch
// họp, nhắc deadline, đăng xuất. Trước đây chúng nằm rải trên thanh đầu trang
// dưới dạng ba, bốn icon rời, vừa chật vừa khó đoán cái nào làm gì.

async function docLoi(res: Response): Promise<string> {
  try {
    const d = await res.json();
    return [d?.error, d?.khacPhuc].filter(Boolean).join(". ") || "Không lưu được";
  } catch {
    return "Không lưu được";
  }
}

function NhanMuc({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 10.5,
        color: "var(--amber)",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        display: "flex",
        alignItems: "center",
        gap: 6,
        margin: "0 0 7px"
      }}
    >
      {icon}
      {children}
    </div>
  );
}

const oNhap: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--field)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "10px 12px",
  color: "var(--cream)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  minHeight: 44
};

export default function CaiDat({
  tenGoiHienTai,
  tenTroLyHienTai,
  onDong,
  onLuuXong,
  onThongBao
}: {
  tenGoiHienTai: string;
  tenTroLyHienTai: string;
  onDong: () => void;
  onLuuXong: (kq: { tenGoi: string; tenTroLy: string; lichDoi: boolean }) => void;
  onThongBao: (msg: string) => void;
}) {
  const [tenGoi, setTenGoi] = useState(tenGoiHienTai);
  const [tenTroLy, setTenTroLy] = useState(tenTroLyHienTai);
  const [lich, setLich] = useState("");
  const [lichGoc, setLichGoc] = useState("");
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const hopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error(await docLoi(r));
        const d = await r.json();
        const ds = (d.icsUrls ?? []).join("\n");
        setLich(ds);
        setLichGoc(ds);
        if (typeof d.tenGoi === "string") setTenGoi(d.tenGoi);
        if (typeof d.tenTroLy === "string" && d.tenTroLy) setTenTroLy(d.tenTroLy);
      })
      .catch((e) => setLoi(e.message))
      .finally(() => setDangTai(false));
  }, []);

  // Đóng bằng phím Esc, quen tay trên máy tính
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDong();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onDong]);

  async function luu() {
    setDangLuu(true);
    setLoi(null);
    try {
      const lichDoi = lich.trim() !== lichGoc.trim();
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Gửi cả cụm trong MỘT lượt: người dùng bấm Lưu một lần thì không nên
        // có chuyện tên lưu được còn lịch thì không.
        body: JSON.stringify({ tenGoi, tenTroLy, ...(lichDoi ? { icsUrls: lich } : {}) })
      });
      if (!res.ok) throw new Error(await docLoi(res));
      const d = await res.json();
      onLuuXong({
        tenGoi: typeof d.tenGoi === "string" ? d.tenGoi : "",
        tenTroLy: typeof d.tenTroLy === "string" && d.tenTroLy ? d.tenTroLy : TEN_TRO_LY_MAC_DINH,
        lichDoi
      });
      onDong();
    } catch (e: any) {
      setLoi(e.message ?? "Không lưu được");
    } finally {
      setDangLuu(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt"
      onMouseDown={(e) => {
        // Bấm ra nền thì đóng, nhưng chỉ khi bấm đúng vào nền: dùng mousedown
        // trên chính lớp phủ, tránh trường hợp kéo chuột từ trong ra ngoài
        if (e.target === e.currentTarget) onDong();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 0 env(safe-area-inset-bottom)"
      }}
    >
      <div
        ref={hopRef}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "88vh",
          overflowY: "auto",
          background: "var(--navy-2)",
          border: "1px solid var(--line)",
          borderRadius: "16px 16px 0 0",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--cream)", margin: 0 }}>Cài đặt</h2>
          <button
            onClick={onDong}
            aria-label="Đóng cài đặt"
            className="tap"
            style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 15, margin: -10 }}
          >
            ✕
          </button>
        </div>

        {/* --- Tên gọi --- */}
        <section style={{ marginBottom: 18 }}>
          <NhanMuc icon={<IcPen size={12} />}>Anh muốn được gọi là</NhanMuc>
          <input
            value={tenGoi}
            onChange={(e) => setTenGoi(e.target.value.slice(0, 40))}
            placeholder="vd: Hà đại ka"
            aria-label="Tên gọi của anh"
            style={oNhap}
          />
        </section>

        {/* --- Tên trợ lý --- */}
        <section style={{ marginBottom: 18 }}>
          <NhanMuc icon={<IcSpark size={12} />}>Tên trợ lý AI</NhanMuc>
          <input
            value={tenTroLy}
            onChange={(e) => setTenTroLy(e.target.value.slice(0, DAI_TOI_DA_TEN_TRO_LY))}
            placeholder={TEN_TRO_LY_MAC_DINH}
            aria-label="Tên trợ lý AI"
            style={oNhap}
          />
          <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--slate)", margin: "6px 0 0" }}>
            Tên này hiện trên nút gọi trợ lý và là cách trợ lý tự xưng khi trả lời. Để trống thì quay về{" "}
            {TEN_TRO_LY_MAC_DINH}.
          </p>
        </section>

        {/* --- Lịch họp --- */}
        <section style={{ marginBottom: 18 }}>
          <NhanMuc icon={<IcLich size={12} />}>Nối lịch họp</NhanMuc>
          <textarea
            value={lich}
            onChange={(e) => setLich(e.target.value)}
            disabled={dangTai}
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder={dangTai ? "Đang tải..." : "https://outlook.office365.com/owa/calendar/.../calendar.ics"}
            aria-label="Liên kết lịch iCal"
            style={{ ...oNhap, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.5, resize: "vertical" }}
          />
          <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--slate)", margin: "6px 0 0" }}>
            Dán liên kết iCal bí mật, mỗi lịch một dòng, tối đa 5 lịch. Outlook: Cài đặt, Lịch, Lịch dùng
            chung, Xuất bản lịch. Google: Cài đặt lịch, Tích hợp lịch, Địa chỉ bí mật ở định dạng iCal. Giữ
            kín liên kết như mật khẩu vì nó cho đọc toàn bộ lịch của anh.
          </p>
        </section>

        {/* --- Nhắc deadline --- */}
        <section style={{ marginBottom: 18 }}>
          <NhanMuc>Nhắc deadline</NhanMuc>
          <PushSetup kieu="hang" onThongBao={onThongBao} />
        </section>

        {loi && (
          <p role="alert" style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--coral)", margin: "0 0 12px" }}>
            {loi}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            onClick={luu}
            disabled={dangTai || dangLuu}
            style={{
              flex: 1,
              background: "var(--amber)",
              border: "none",
              borderRadius: 10,
              padding: "11px 16px",
              fontSize: 14,
              fontWeight: 600,
              minHeight: 44,
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
              borderRadius: 10,
              padding: "11px 18px",
              fontSize: 14,
              minHeight: 44,
              color: "var(--slate)"
            }}
          >
            Đóng
          </button>
        </div>

        {/* Đăng xuất tách hẳn xuống dưới, sau một đường kẻ, để không bấm nhầm */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13.5,
              minHeight: 44,
              width: "100%",
              color: "var(--coral)"
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
