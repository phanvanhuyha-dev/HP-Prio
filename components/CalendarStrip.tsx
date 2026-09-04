"use client";
import { useEffect, useState } from "react";
import { IcLich } from "./icons";

type SuKien = { tieuDe: string; batDau: string; ketThuc: string; caNgay: boolean };

function gioVN(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

async function docLoi(res: Response): Promise<string> {
  try {
    const d = await res.json();
    return [d?.error, d?.khacPhuc].filter(Boolean).join(". ") || "Không đọc được";
  } catch {
    return "Không đọc được";
  }
}

// Dải lịch họp hôm nay phía trên danh sách việc, kiểu SCHEDULE trong ảnh mẫu:
// chấm màu + giờ + tên cuộc họp.
//
// Ngoài lịch tự động (ICS, Microsoft), dải này còn nhận lịch người dùng tự dán
// từ Outlook. Cần thế vì có công ty chặn cả xuất bản lịch lẫn đăng ký ứng dụng,
// tức là mọi đường tự động đều tắc.
export default function CalendarStrip({ lamMoi = 0 }: { lamMoi?: number }) {
  const [suKien, setSuKien] = useState<SuKien[]>([]);
  const [moDan, setMoDan] = useState(false);
  const [vanBan, setVanBan] = useState("");
  const [dangDoc, setDangDoc] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [nhip, setNhip] = useState(0);

  // Việc cần làm mới là phần chính của màn hình, nên dải lịch mặc định thu
  // gọn thành một dòng. Lựa chọn của người dùng được nhớ lại giữa các lần mở.
  const [mo, setMo] = useState(false);
  useEffect(() => {
    try {
      setMo(localStorage.getItem("hpprio-lich-mo") === "1");
    } catch {}
  }, []);

  function doiMo(v: boolean) {
    setMo(v);
    try {
      localStorage.setItem("hpprio-lich-mo", v ? "1" : "0");
    } catch {}
  }

  // lamMoi tăng lên mỗi lần người dùng đổi cấu hình lịch, nhip tăng sau khi
  // dán lịch mới, cả hai đều buộc tải lại dải lịch.
  useEffect(() => {
    fetch("/api/calendar")
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        // Gỡ hết nguồn lịch thì phải dọn luôn lịch đang hiện, không giữ bản cũ
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
  }, [lamMoi, nhip]);

  // Khóa cuộn trang nền khi khu dán lịch đang mở, xem chú thích ở CaiDat
  useEffect(() => {
    if (!moDan) return;
    const cu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = cu;
    };
  }, [moDan]);

  async function docLich() {
    setDangDoc(true);
    setLoi(null);
    try {
      const res = await fetch("/api/calendar/tay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: vanBan })
      });
      if (!res.ok) throw new Error(await docLoi(res));
      setMoDan(false);
      setVanBan("");
      setNhip((n) => n + 1);
    } catch (e: any) {
      setLoi(e.message ?? "Không đọc được");
    } finally {
      setDangDoc(false);
    }
  }

  async function xoaLich() {
    if (!confirm("Xóa lịch đã dán của hôm nay?")) return;
    try {
      await fetch("/api/calendar/tay", { method: "DELETE" });
      setNhip((n) => n + 1);
    } catch {}
  }

  const bayGio = Date.now();
  // Cuộc họp kế tiếp còn chưa kết thúc. Hết lịch trong ngày thì trả undefined
  // và dòng thu gọn chuyển sang báo đã xong.
  const sapToi = suKien.find((s) => new Date(s.ketThuc).getTime() >= bayGio);

  return (
    <>
      {suKien.length > 0 ? (
        <section style={{ marginBottom: mo ? 18 : 14 }} aria-labelledby="tieu-de-lich">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: mo ? "0 0 8px" : 0 }}>
            {/* Hàng tiêu đề chính là nút thu gọn. Ở trạng thái gọn nó gánh
                luôn thông tin đáng giá nhất: cuộc họp kế tiếp trong ngày. */}
            <button
              onClick={() => doiMo(!mo)}
              aria-expanded={mo}
              aria-controls="danh-sach-lich"
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 9,
                flex: 1,
                minWidth: 0,
                background: "none",
                border: "none",
                padding: "4px 0",
                textAlign: "left"
              }}
            >
              <span
                id="tieu-de-lich"
                className="mono"
                style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--slate)", flexShrink: 0 }}
              >
                Lịch hôm nay
              </span>
              {!mo && (
                <span
                  className="viec-tieu-de"
                  style={{ fontSize: 12.5, color: sapToi ? "var(--cream)" : "var(--slate)", minWidth: 0 }}
                >
                  {sapToi ? (
                    <>
                      <span className="mono" style={{ color: "var(--amber)" }}>
                        {sapToi.caNgay ? "cả ngày" : gioVN(sapToi.batDau)}
                      </span>{" "}
                      {sapToi.tieuDe}
                    </>
                  ) : (
                    `xong ${suKien.length} mục`
                  )}
                </span>
              )}
              <span className="mono" style={{ fontSize: 11, color: "var(--slate)", flexShrink: 0 }} aria-hidden="true">
                {mo ? "▴" : `▾ ${suKien.length}`}
              </span>
            </button>
            <button
              onClick={() => setMoDan(true)}
              className="tap"
              aria-label="Dán lại lịch hôm nay"
              title="Dán lại lịch hôm nay"
              style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 11.5, margin: "-10px 0", flexShrink: 0 }}
            >
              Dán lại
            </button>
          </div>
          <div
            id="danh-sach-lich"
            hidden={!mo}
            style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "4px 14px" }}
          >
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
      ) : (
        // Trống lịch thì chỉ còn đúng một dòng mờ, vừa đủ để bấm vào dán
        <button
          onClick={() => setMoDan(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "none",
            border: "none",
            padding: "0 0 14px",
            color: "var(--slate)",
            fontSize: 12.5
          }}
        >
          <IcLich size={13} /> Dán lịch hôm nay
        </button>
      )}

      {moDan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dán lịch hôm nay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMoDan(false);
          }}
          className="modal-lop"
        >
          <div className="modal-hop">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span
                style={{ fontSize: 16, fontWeight: 600, color: "var(--cream)", display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <IcLich size={15} /> Dán lịch hôm nay
              </span>
              <button
                onClick={() => setMoDan(false)}
                className="tap"
                aria-label="Đóng"
                style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 15, margin: -10 }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--slate)", margin: "0 0 10px" }}>
              Mở Outlook, bôi đen lịch hôm nay rồi copy dán vào đây. Hoặc copy nội dung email Agenda mail
              buổi sáng. Mỗi dòng cần có giờ, ví dụ “8:30 - 9:30 Họp giao ban” hoặc “2:00 CH Phỏng vấn”.
            </p>

            <textarea
              value={vanBan}
              onChange={(e) => setVanBan(e.target.value)}
              autoFocus
              rows={7}
              placeholder={"8:30 - 9:30 Họp giao ban đầu tuần\n10:00 Phỏng vấn ứng viên\n2:00 CH Trình đề án định biên"}
              aria-label="Nội dung lịch"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "var(--field)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "var(--cream)",
                fontSize: 13,
                lineHeight: 1.6,
                resize: "vertical"
              }}
            />

            {loi && (
              <p role="alert" style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--coral)", margin: "8px 0 0" }}>
                {loi}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={docLich}
                disabled={dangDoc || !vanBan.trim()}
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
                  opacity: dangDoc || !vanBan.trim() ? 0.6 : 1
                }}
              >
                {dangDoc ? "Đang đọc..." : "Đọc lịch"}
              </button>
              {suKien.length > 0 && (
                <button
                  onClick={xoaLich}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "11px 16px",
                    fontSize: 13.5,
                    minHeight: 44,
                    color: "var(--coral)"
                  }}
                >
                  Xóa lịch
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
