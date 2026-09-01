"use client";
import { useEffect, useRef, useState } from "react";
import { docLoi, loiThanThien } from "@/lib/client-api";
import { TEN_TRO_LY } from "@/lib/branding";
import { IcSpark } from "./icons";

type Entry = { ngay: string; thanh_tuu: string | null; cai_thien: string | null };

const KHOANG = [
  { ma: "tuan", nhan: "Tuần", ngay: 7 },
  { ma: "thang", nhan: "Tháng", ngay: 30 },
  { ma: "quy", nhan: "Quý", ngay: 90 },
  { ma: "nam", nhan: "Năm", ngay: 365 }
] as const;

function ngayVN(lech = 0) {
  return new Date(Date.now() + 7 * 3600e3 - lech * 86400000).toISOString().slice(0, 10);
}

function hienNgay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Nhật ký nhìn lại cuối ngày: ghi thành tựu và điều cần cải thiện, thành một
// log xem lại được và nhờ Bé iu tổng hợp theo tuần/tháng/quý/năm.
export default function ReflectionLog() {
  const homNay = ngayVN();
  const [thanhTuu, setThanhTuu] = useState("");
  const [caiThien, setCaiThien] = useState("");
  const [daLuuLuc, setDaLuuLuc] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [khoang, setKhoang] = useState<(typeof KHOANG)[number]["ma"]>("tuan");
  const [tomTat, setTomTat] = useState<string | null>(null);
  const [dangTongHop, setDangTongHop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dangGoiRef = useRef(false);

  const cauHinhKhoang = KHOANG.find((k) => k.ma === khoang)!;
  const tuNgay = ngayVN(cauHinhKhoang.ngay - 1);

  // Tải log của khoảng đang chọn; dòng hôm nay đổ luôn vào form để sửa tiếp
  useEffect(() => {
    fetch(`/api/reflections?tu=${tuNgay}&den=${homNay}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!r.ok) throw new Error(await docLoi(r));
        const ds: Entry[] = (await r.json()).entries ?? [];
        setEntries(ds);
        const hn = ds.find((e) => String(e.ngay).slice(0, 10) === homNay);
        if (hn) {
          setThanhTuu(hn.thanh_tuu ?? "");
          setCaiThien(hn.cai_thien ?? "");
        }
      })
      .catch((e) => setError(loiThanThien(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoang]);

  async function luu() {
    if (dangGoiRef.current) return;
    dangGoiRef.current = true;
    setError(null);
    try {
      const r = await fetch("/api/reflections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngay: homNay, thanhTuu, caiThien })
      });
      if (!r.ok) throw new Error(await docLoi(r));
      setDaLuuLuc(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
      // Cập nhật log tại chỗ, không tải lại
      setEntries((prev) => {
        const khac = prev.filter((e) => String(e.ngay).slice(0, 10) !== homNay);
        if (!thanhTuu.trim() && !caiThien.trim()) return khac;
        return [{ ngay: homNay, thanh_tuu: thanhTuu.trim() || null, cai_thien: caiThien.trim() || null }, ...khac];
      });
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      dangGoiRef.current = false;
    }
  }

  async function tongHop() {
    if (dangGoiRef.current) return;
    dangGoiRef.current = true;
    setDangTongHop(true);
    setError(null);
    try {
      const r = await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tu: tuNgay, den: homNay, nhan: cauHinhKhoang.nhan.toLowerCase() + " qua" })
      });
      if (!r.ok) throw new Error(await docLoi(r));
      setTomTat((await r.json()).tomTat);
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      dangGoiRef.current = false;
      setDangTongHop(false);
    }
  }

  return (
    <section style={{ marginTop: 26 }} aria-labelledby="tieu-de-nhat-ky">
      <h2
        id="tieu-de-nhat-ky"
        className="mono"
        style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--slate)", margin: "0 0 10px" }}
      >
        Nhật ký nhìn lại
      </h2>

      {/* Ghi cho hôm nay */}
      <div style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Hôm nay · {hienNgay(homNay)}
        </div>

        <label htmlFor="nk-thanh-tuu" style={{ display: "block", fontSize: 12.5, color: "var(--teal)", fontWeight: 600, marginBottom: 4 }}>
          Thành tựu nổi bật
        </label>
        <textarea
          id="nk-thanh-tuu"
          value={thanhTuu}
          onChange={(e) => setThanhTuu(e.target.value.slice(0, 4000))}
          rows={2}
          placeholder="Hôm nay điều gì đáng tự hào?"
          style={oNhap}
        />

        <label htmlFor="nk-cai-thien" style={{ display: "block", fontSize: 12.5, color: "var(--coral)", fontWeight: 600, margin: "10px 0 4px" }}>
          Điều cần cải thiện
        </label>
        <textarea
          id="nk-cai-thien"
          value={caiThien}
          onChange={(e) => setCaiThien(e.target.value.slice(0, 4000))}
          rows={2}
          placeholder="Nếu làm lại, anh sẽ làm khác đi chỗ nào?"
          style={oNhap}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button
            onClick={luu}
            style={{
              background: "var(--amber)",
              color: "var(--navy)",
              border: "none",
              borderRadius: 9,
              padding: "0 18px",
              fontSize: 13.5,
              fontWeight: 700,
              minHeight: 42
            }}
          >
            Lưu
          </button>
          {daLuuLuc && (
            <span role="status" className="mono" style={{ fontSize: 11.5, color: "var(--teal)" }}>
              Đã lưu lúc {daLuuLuc}
            </span>
          )}
        </div>
      </div>

      {/* Khoảng thời gian + tổng hợp */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {KHOANG.map((k) => (
          <button
            key={k.ma}
            onClick={() => {
              setKhoang(k.ma);
              setTomTat(null);
            }}
            aria-pressed={khoang === k.ma}
            style={{
              background: khoang === k.ma ? "var(--field)" : "transparent",
              border: `1px solid ${khoang === k.ma ? "var(--amber)" : "var(--line)"}`,
              color: khoang === k.ma ? "var(--cream)" : "var(--slate)",
              borderRadius: 9,
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: khoang === k.ma ? 600 : 400,
              minHeight: 40
            }}
          >
            {k.nhan}
          </button>
        ))}
        {entries.length > 0 && (
          <button
            onClick={tongHop}
            disabled={dangTongHop}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid var(--amber)",
              color: "var(--amber)",
              borderRadius: 9,
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              minHeight: 40,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              opacity: dangTongHop ? 0.6 : 1
            }}
          >
            {dangTongHop ? <span className="spinner" aria-hidden="true" /> : <IcSpark size={12} />}
            {dangTongHop ? "Đang tổng hợp…" : "Tổng hợp"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--coral)", fontSize: 13, margin: "0 0 10px" }}>
          {error}
        </p>
      )}

      {tomTat && (
        <div style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderLeft: "3px solid var(--amber)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}
          >
            <IcSpark size={11} /> {TEN_TRO_LY} tổng hợp {cauHinhKhoang.nhan.toLowerCase()} qua
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--cream)", margin: 0, whiteSpace: "pre-wrap" }}>{tomTat}</p>
        </div>
      )}

      {/* Log các ngày trước */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries
          .filter((e) => String(e.ngay).slice(0, 10) !== homNay)
          .slice(0, 60)
          .map((e) => (
            <div
              key={String(e.ngay)}
              style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}
            >
              <div className="mono" style={{ fontSize: 10.5, color: "var(--slate)", marginBottom: 5 }}>
                {hienNgay(String(e.ngay))}
              </div>
              {e.thanh_tuu && (
                <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--cream)", margin: "0 0 4px", whiteSpace: "pre-wrap" }}>
                  <span style={{ color: "var(--teal)", fontWeight: 600 }}>+ </span>
                  {e.thanh_tuu}
                </p>
              )}
              {e.cai_thien && (
                <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--slate)", margin: 0, whiteSpace: "pre-wrap" }}>
                  <span style={{ color: "var(--coral)", fontWeight: 600 }}>△ </span>
                  {e.cai_thien}
                </p>
              )}
            </div>
          ))}
        {entries.filter((e) => String(e.ngay).slice(0, 10) !== homNay).length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--slate)", margin: 0 }}>
            Chưa có dòng nhật ký nào trong {cauHinhKhoang.nhan.toLowerCase()} qua. Ghi đều mỗi cuối ngày, phần Tổng hợp sẽ càng có giá trị.
          </p>
        )}
      </div>
    </section>
  );
}

const oNhap: React.CSSProperties = {
  width: "100%",
  background: "var(--field)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "9px 11px",
  color: "var(--cream)",
  fontSize: 13.5,
  lineHeight: 1.5,
  fontFamily: "var(--font-body)",
  resize: "vertical"
};
