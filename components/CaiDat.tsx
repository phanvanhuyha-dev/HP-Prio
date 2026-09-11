"use client";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import PushSetup from "./PushSetup";
import { IcLich, IcPen, IcSpark, IcList } from "./icons";
import { DAI_TOI_DA_TEN_TRO_LY, TEN_TRO_LY_MAC_DINH } from "@/lib/branding";
import { type DanhMuc, DANH_MUC_MAC_DINH } from "@/lib/db";

// Một chỗ duy nhất cho mọi thứ thuộc về "cấu hình": tên gọi, tên trợ lý, danh mục,
// lịch họp, nhắc deadline, đăng xuất.

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
  danhMucHienTai,
  onDong,
  onLuuXong,
  onThongBao
}: {
  tenGoiHienTai: string;
  tenTroLyHienTai: string;
  danhMucHienTai?: DanhMuc[];
  onDong: () => void;
  onLuuXong: (kq: { tenGoi: string; tenTroLy: string; lichDoi: boolean; danhMucMoi?: DanhMuc[] }) => void;
  onThongBao: (msg: string) => void;
}) {
  const [tenGoi, setTenGoi] = useState(tenGoiHienTai);
  const [tenTroLy, setTenTroLy] = useState(tenTroLyHienTai);
  const [danhMuc, setDanhMuc] = useState<DanhMuc[]>(danhMucHienTai && danhMucHienTai.length > 0 ? danhMucHienTai : DANH_MUC_MAC_DINH);
  const [danhMucGoc, setDanhMucGoc] = useState<DanhMuc[]>(danhMucHienTai && danhMucHienTai.length > 0 ? danhMucHienTai : DANH_MUC_MAC_DINH);
  const [tenDanhMucMoi, setTenDanhMucMoi] = useState("");
  const [idBiXoa, setIdBiXoa] = useState<string | null>(null);

  const [lich, setLich] = useState("");
  const [lichGoc, setLichGoc] = useState("");
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [ms, setMs] = useState<{ noi: boolean; msEmail: string | null; cauHinh: boolean } | null>(null);
  const hopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ms")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMs(d))
      .catch(() => {});
  }, []);

  async function ngatMicrosoft() {
    if (!confirm("Ngắt kết nối lịch Microsoft?")) return;
    try {
      const res = await fetch("/api/ms", { method: "DELETE" });
      if (!res.ok) throw new Error(await docLoi(res));
      setMs((m) => (m ? { ...m, noi: false, msEmail: null } : m));
      onThongBao("Đã ngắt lịch Microsoft");
    } catch (e: any) {
      setLoi(e.message ?? "Không ngắt được");
    }
  }

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
        if (Array.isArray(d.danhMuc) && d.danhMuc.length > 0) {
          setDanhMuc(d.danhMuc);
          setDanhMucGoc(d.danhMuc);
        }
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

  // Khóa cuộn trang nền khi hộp thoại đang mở.
  useEffect(() => {
    const cu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = cu;
    };
  }, []);

  async function luu() {
    setDangLuu(true);
    setLoi(null);
    try {
      const lichDoi = lich.trim() !== lichGoc.trim();
      const danhMucDoi = JSON.stringify(danhMuc) !== JSON.stringify(danhMucGoc);

      const bodyData: Record<string, unknown> = {
        tenGoi,
        tenTroLy,
        ...(lichDoi ? { icsUrls: lich } : {}),
        ...(danhMucDoi ? { danhMuc, ...(idBiXoa ? { idBiXoa } : {}) } : {})
      };

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });
      if (!res.ok) throw new Error(await docLoi(res));
      const d = await res.json();
      onLuuXong({
        tenGoi: typeof d.tenGoi === "string" ? d.tenGoi : "",
        tenTroLy: typeof d.tenTroLy === "string" && d.tenTroLy ? d.tenTroLy : TEN_TRO_LY_MAC_DINH,
        lichDoi,
        danhMucMoi: Array.isArray(d.danhMuc) ? d.danhMuc : danhMuc
      });
      if (typeof d.canhBao === "string" && d.canhBao) {
        setLoi(`Đã lưu, nhưng chưa tải được lịch. ${d.canhBao}`);
        return;
      }
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
      className="modal-lop"
    >
      <div ref={hopRef} className="modal-hop">
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

        {/* --- Danh mục công việc --- */}
        <section style={{ marginBottom: 18 }}>
          <NhanMuc icon={<IcList size={12} />}>Danh mục công việc</NhanMuc>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {danhMuc.map((m, idx) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--field)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "6px 10px"
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: "var(--amber)", minWidth: 16 }}>
                  {idx + 1}.
                </span>
                <input
                  value={m.ten}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 30);
                    setDanhMuc((ds) => ds.map((d) => (d.id === m.id ? { ...d, ten: val } : d)));
                  }}
                  placeholder="Tên danh mục..."
                  aria-label={`Tên danh mục ${m.ten}`}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "var(--cream)",
                    fontSize: 13.5,
                    fontFamily: "var(--font-body)",
                    outline: "none"
                  }}
                />
                {danhMuc.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Xóa danh mục "${m.ten}"? Các việc thuộc danh mục này sẽ chuyển về "${danhMuc.find((d) => d.id !== m.id)?.ten}".`)) {
                        return;
                      }
                      setIdBiXoa(m.id);
                      setDanhMuc((ds) => ds.filter((d) => d.id !== m.id));
                    }}
                    title="Xóa danh mục"
                    aria-label={`Xóa danh mục ${m.ten}`}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--slate)",
                      fontSize: 14,
                      cursor: "pointer",
                      padding: "4px 6px"
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Thêm danh mục mới */}
          {danhMuc.length < 10 && (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={tenDanhMucMoi}
                onChange={(e) => setTenDanhMucMoi(e.target.value.slice(0, 30))}
                placeholder="Thêm danh mục mới (vd: Học tập)..."
                aria-label="Tên danh mục mới"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const t = tenDanhMucMoi.trim();
                    if (!t) return;
                    if (danhMuc.some((d) => d.ten.toLowerCase() === t.toLowerCase())) {
                      alert("Đã có danh mục mang tên này");
                      return;
                    }
                    const idMoi = `cat_${Date.now().toString(36)}`;
                    setDanhMuc((ds) => [...ds, { id: idMoi, ten: t }]);
                    setTenDanhMucMoi("");
                  }
                }}
                style={{ ...oNhap, flex: 1, minHeight: 38, padding: "7px 10px", fontSize: 13 }}
              />
              <button
                type="button"
                onClick={() => {
                  const t = tenDanhMucMoi.trim();
                  if (!t) return;
                  if (danhMuc.some((d) => d.ten.toLowerCase() === t.toLowerCase())) {
                    alert("Đã có danh mục mang tên này");
                    return;
                  }
                  const idMoi = `cat_${Date.now().toString(36)}`;
                  setDanhMuc((ds) => [...ds, { id: idMoi, ten: t }]);
                  setTenDanhMucMoi("");
                }}
                style={{
                  background: "var(--field)",
                  border: "1px solid var(--amber)",
                  borderRadius: 8,
                  color: "var(--amber)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "0 12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                + Thêm
              </button>
            </div>
          )}
          <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--slate)", margin: "6px 0 0" }}>
            Bấm vào tên để sửa trực tiếp. Bấm ✕ để xóa (việc cũ sẽ tự dời về danh mục đầu tiên).
          </p>
        </section>

        {/* --- Lịch Outlook công ty qua Microsoft --- */}
        {ms?.cauHinh && (
          <section style={{ marginBottom: 18 }}>
            <NhanMuc icon={<IcLich size={12} />}>Lịch Outlook công ty</NhanMuc>
            {ms.noi ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "var(--field)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "11px 12px",
                  minHeight: 44
                }}
              >
                <span style={{ flex: 1, fontSize: 13.5, color: "var(--teal)", minWidth: 0, overflowWrap: "anywhere" }}>
                  Đã nối {ms.msEmail ?? "tài khoản Microsoft"}
                </span>
                <button
                  onClick={ngatMicrosoft}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12.5,
                    minHeight: 38,
                    color: "var(--coral)",
                    flexShrink: 0
                  }}
                >
                  Ngắt
                </button>
              </div>
            ) : (
              <>
                <a
                  href="/api/ms/connect"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--field)",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "11px 12px",
                    minHeight: 44,
                    fontSize: 13.5,
                    color: "var(--cream)",
                    textDecoration: "none"
                  }}
                >
                  Nối tài khoản Microsoft
                </a>
                <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--slate)", margin: "6px 0 0" }}>
                  Dùng khi công ty tắt tính năng xuất bản lịch nên không lấy được liên kết ICS. App chỉ xin
                  quyền đọc lịch, không xin quyền đọc thư hay ghi gì vào lịch.
                </p>
              </>
            )}
          </section>
        )}

        {/* --- Lịch họp qua liên kết ICS --- */}
        <section style={{ marginBottom: 18 }}>
          <NhanMuc icon={<IcLich size={12} />}>Nối lịch bằng liên kết</NhanMuc>
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
