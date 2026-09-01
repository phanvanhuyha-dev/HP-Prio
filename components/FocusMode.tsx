"use client";
import { useEffect, useRef, useState } from "react";
import { docLoi, loiThanThien } from "@/lib/client-api";
import { demBuoc, themBuocVaoGhiChu } from "@/lib/checklist";
import { useTenTroLy } from "./TroLy";
import NotesView from "./NotesView";
import type { Task } from "./TaskList";
import { IcSpark, IcCheckTron, IcPlay } from "./icons";

// Phiên đang chạy, lưu vào localStorage để iOS có "giết" app giữa chừng
// (chuyện thường với PWA) thì mở lại vẫn tiếp tục đúng chỗ. Đồng hồ tính theo
// MỐC THỜI GIAN chứ không cộng dồn từng giây, nên nền hay không nền vẫn đúng.
export type PhienTapTrung = {
  sessionId: string;
  taskId: string;
  batDau: number;
  ketThucLuc: number;
  phut: number;
};

const KHOA_LUU = "hpprio-focus";

export function docPhienDangDo(): PhienTapTrung | null {
  try {
    const raw = localStorage.getItem(KHOA_LUU);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.sessionId !== "string" || typeof p?.ketThucLuc !== "number" || typeof p?.taskId !== "string") {
      return null;
    }
    return p as PhienTapTrung;
  } catch {
    return null;
  }
}

export function xoaPhienDangDo() {
  try {
    localStorage.removeItem(KHOA_LUU);
  } catch {}
}

function luuPhien(p: PhienTapTrung) {
  try {
    localStorage.setItem(KHOA_LUU, JSON.stringify(p));
  } catch {}
}

function mmss(giay: number) {
  const g = Math.max(0, giay);
  return `${Math.floor(g / 60)}:${String(g % 60).padStart(2, "0")}`;
}

// Ba mốc gợi ý cho nhanh; ô "khác" nhận 5-180 phút (đúng giới hạn API).
const PRESET_PHUT = [15, 25, 50];
const KHOA_PHUT = "hpprio-phut";

function docPhutQuen(): number {
  try {
    const n = Number(localStorage.getItem(KHOA_PHUT));
    return Number.isInteger(n) && n >= 5 && n <= 180 ? n : 25;
  } catch {
    return 25;
  }
}

export default function FocusMode({
  task,
  phienCu,
  thuNho,
  onDoiThuNho,
  onClose,
  onXongViec,
  onDoiGhiChu
}: {
  task: Task;
  phienCu: PhienTapTrung | null;
  // Thu nhỏ: component VẪN được mount để đồng hồ, chuông và wake lock chạy
  // tiếp, chỉ phần giao diện ẩn đi (Dashboard hiện thanh mini thay thế).
  thuNho: boolean;
  onDoiThuNho: (v: boolean) => void;
  onClose: () => void;
  onXongViec: (id: string) => void;
  onDoiGhiChu: (id: string, notes: string) => void;
}) {
  const TEN_TRO_LY = useTenTroLy();
  const [phien, setPhien] = useState<PhienTapTrung | null>(phienCu);
  const [conLai, setConLai] = useState(() =>
    phienCu ? Math.round((phienCu.ketThucLuc - Date.now()) / 1000) : 0
  );
  const [hetGio, setHetGio] = useState(false);
  const [phutVuaXong, setPhutVuaXong] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [homNay, setHomNay] = useState<{ giay: number; phien: number } | null>(null);
  // Chia bước ngay trong màn tập trung, cho việc chưa có bước nào
  const [dangChia, setDangChia] = useState(false);
  const [buocDeXuat, setBuocDeXuat] = useState<string[] | null>(null);
  // Chip thời lượng chỉ để CHỌN, nút "Bắt đầu" riêng mới khởi động phiên.
  // Trước đây bấm chip là chạy luôn, người dùng tưởng phải chọn rồi mới chạy
  // nên hay khởi động nhầm phiên.
  const [phutChon, setPhutChon] = useState<number | "khac">(25);
  const [phutKhac, setPhutKhac] = useState("");
  useEffect(() => {
    const n = docPhutQuen();
    if (PRESET_PHUT.includes(n)) {
      setPhutChon(n);
    } else {
      // Lần trước dùng một mốc ngoài preset thì chọn sẵn ô "khác" với đúng số đó
      setPhutChon("khac");
      setPhutKhac(String(n));
    }
  }, []);
  const phutHieuLuc = phutChon === "khac" ? Number(phutKhac || 0) : phutChon;
  const phutHopLe = Number.isInteger(phutHieuLuc) && phutHieuLuc >= 5 && phutHieuLuc <= 180;
  const audioRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);
  const daBaoRef = useRef(false);
  const dangGoiRef = useRef(false);

  const buoc = demBuoc(task.notes);

  useEffect(() => {
    fetch("/api/focus")
      .then(async (r) => (r.ok ? setHomNay((await r.json()).homNay) : null))
      .catch(() => {});
  }, [hetGio]);

  // Đồng hồ: tính từ mốc kết thúc, không cộng dồn, nên máy có tạm dừng JS
  // (khóa màn hình, chuyển app) thì mở lại vẫn ra số đúng.
  useEffect(() => {
    if (!phien) return;
    const tick = () => {
      const con = Math.round((phien.ketThucLuc - Date.now()) / 1000);
      setConLai(con);
      if (con <= 0) ketThuc(true);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phien]);

  // Giữ màn hình sáng trong phiên (Wake Lock, Safari hỗ trợ từ iOS 16.4).
  // Wake lock tự nhả khi chuyển app nên phải xin lại lúc quay về.
  useEffect(() => {
    if (!phien) return;
    let huy = false;
    async function xin() {
      try {
        if (!huy) wakeLockRef.current = await (navigator as any).wakeLock?.request?.("screen");
      } catch {}
    }
    function khiHienLai() {
      if (document.visibilityState === "visible") xin();
    }
    xin();
    document.addEventListener("visibilitychange", khiHienLai);
    return () => {
      huy = true;
      document.removeEventListener("visibilitychange", khiHienLai);
      try {
        wakeLockRef.current?.release?.();
      } catch {}
    };
  }, [phien]);

  function bao() {
    if (daBaoRef.current) return;
    daBaoRef.current = true;
    try {
      (navigator as any).vibrate?.([200, 100, 200, 100, 400]);
    } catch {}
    // Chuông chỉ kêu được nếu AudioContext đã được tạo trong một thao tác bấm
    // (iOS bắt buộc), nên context được tạo sẵn ở batDau().
    try {
      const ctx = audioRef.current;
      if (ctx) {
        const t0 = ctx.currentTime;
        for (const d of [0, 0.35, 0.7]) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880;
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.001, t0 + d);
          g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + d + 0.28);
          o.start(t0 + d);
          o.stop(t0 + d + 0.3);
        }
      }
    } catch {}
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        navigator.serviceWorker?.ready
          .then((r) => r.showNotification("⏰ Hết giờ tập trung", { body: task.title, icon: "/icons/icon-192.png" }))
          .catch(() => {});
      }
    } catch {}
  }

  async function batDau(phut: number) {
    if (dangGoiRef.current) return;
    if (!Number.isInteger(phut) || phut < 5 || phut > 180) {
      setError("Thời lượng phải từ 5 đến 180 phút.");
      return;
    }
    dangGoiRef.current = true;
    setError(null);
    try {
      localStorage.setItem(KHOA_PHUT, String(phut));
    } catch {}
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC && !audioRef.current) audioRef.current = new AC();
      audioRef.current?.resume?.();
    } catch {}

    try {
      const res = await fetch("/api/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, phut })
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const data = await res.json();
      const p: PhienTapTrung = {
        sessionId: data.session.id,
        taskId: task.id,
        batDau: Date.now(),
        ketThucLuc: Date.now() + phut * 60000,
        phut
      };
      daBaoRef.current = false;
      setHetGio(false);
      setPhien(p);
      setConLai(phut * 60);
      luuPhien(p);
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      dangGoiRef.current = false;
    }
  }

  async function ketThuc(dungGio: boolean) {
    const p = phien;
    if (!p) return;
    setPhien(null);
    xoaPhienDangDo();
    if (dungGio) {
      setPhutVuaXong(p.phut);
      setHetGio(true);
      bao();
      // Đang thu nhỏ mà hết giờ thì mở lại màn hình để thấy phần chúc mừng
      onDoiThuNho(false);
    }
    try {
      await fetch(`/api/focus/${p.sessionId}`, { method: "PATCH" });
    } catch {
      // Mất mạng thì thôi: phiên sẽ được tự đóng (có chặn trên thời lượng)
      // ở lần bắt đầu phiên sau.
    }
    if (!dungGio) onClose();
  }

  async function chiaBuoc() {
    if (dangChia) return;
    setDangChia(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/breakdown`, { method: "POST" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const data = await res.json();
      // Đề xuất hiện ra để duyệt trước, không lưu thẳng
      setBuocDeXuat(data.steps ?? []);
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      setDangChia(false);
    }
  }

  const dangChay = phien !== null;
  const phanTram = phien ? Math.min(100, ((phien.phut * 60 - conLai) / (phien.phut * 60)) * 100) : 0;

  // Sau khi mọi hook đã chạy: thu nhỏ thì không vẽ gì, nhưng đồng hồ và chuông
  // vẫn sống vì component còn mount.
  if (thuNho) return null;

  return (
    <div className="focus-lop" role="dialog" aria-modal="true" aria-label="Chế độ tập trung">
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--slate)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Tập trung sâu
          </span>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* Thu nhỏ: xem danh sách việc mà KHÔNG phải kết thúc phiên.
                Trước đây nút ✕ là đường ra duy nhất và nó chấm dứt luôn phiên. */}
            {dangChay && (
              <button
                onClick={() => onDoiThuNho(true)}
                className="tap"
                aria-label="Thu nhỏ, phiên vẫn chạy"
                title="Thu nhỏ, phiên vẫn chạy"
                style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 17, margin: "-10px 0" }}
              >
                ⌄
              </button>
            )}
            <button
              onClick={() => (dangChay ? ketThuc(false) : onClose())}
              className="tap"
              aria-label={dangChay ? "Kết thúc sớm và đóng" : "Đóng"}
              style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 18, margin: "-10px -10px -10px 0" }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ----- Đồng hồ ----- */}
        {dangChay && (
          <div style={{ textAlign: "center", margin: "10px 0 26px" }}>
            <div className="mono" style={{ fontSize: 76, fontWeight: 500, color: "var(--cream)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {mmss(conLai)}
            </div>
            <div style={{ height: 3, background: "var(--field)", borderRadius: 2, margin: "20px auto 8px", maxWidth: 320 }}>
              <div style={{ height: "100%", width: `${phanTram}%`, background: "var(--amber)", borderRadius: 2 }} />
            </div>
            <p className="mono" style={{ fontSize: 11, color: "var(--slate)", margin: 0 }}>
              phiên {phien!.phut} phút
            </p>
          </div>
        )}

        {hetGio && !dangChay && (
          <div style={{ textAlign: "center", margin: "10px 0 26px" }}>
            <p style={{ margin: 0, color: "var(--teal)" }}>
              <IcCheckTron size={44} />
            </p>
            <p style={{ fontSize: 17, color: "var(--cream)", fontWeight: 600, margin: "6px 0 0" }}>
              Xong phiên {phutVuaXong} phút
            </p>
          </div>
        )}

        {/* ----- Thẻ việc đang làm: tiêu đề + CÁC BƯỚC là nội dung chính ----- */}
        <div
          style={{
            background: "var(--navy-2)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: "16px 16px 14px"
          }}
        >
          <div className="mono" style={{ fontSize: 10.5, color: "var(--slate)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            {dangChay ? "Đang làm" : "Việc được chọn"}
          </div>
          <h2 className="viec-tieu-de" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35, color: "var(--cream)", margin: "0 0 4px" }}>
            {task.title}
          </h2>
          {task.deadline && (
            <p className="mono" style={{ fontSize: 11.5, color: "var(--slate)", margin: "0 0 6px" }}>
              Hạn: {new Date(task.deadline).toLocaleDateString("vi-VN")}
            </p>
          )}

          {/* Các bước: tick được ngay trong lúc tập trung */}
          {task.notes ? (
            <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "var(--cream)" }}>
              {buoc.tong > 0 && (
                <div className="mono" style={{ fontSize: 11, color: buoc.xong === buoc.tong ? "var(--teal)" : "var(--slate)", marginBottom: 6 }}>
                  {buoc.xong}/{buoc.tong} bước
                </div>
              )}
              <NotesView text={task.notes} onDoi={(moi) => onDoiGhiChu(task.id, moi)} choSua />
            </div>
          ) : buocDeXuat === null ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: "var(--slate)", margin: "0 0 10px" }}>
                Việc này chưa có bước nào. Chia nhỏ ra sẽ dễ bắt đầu hơn.
              </p>
              <button
                onClick={chiaBuoc}
                disabled={dangChia}
                style={{
                  background: "transparent",
                  border: "1px solid var(--amber)",
                  color: "var(--amber)",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: dangChia ? 0.6 : 1
                }}
              >
                {dangChia ? <span className="spinner" aria-hidden="true" /> : <IcSpark size={13} />}
                {dangChia ? "Đang chia bước…" : `Chia bước với ${TEN_TRO_LY}`}
              </button>
            </div>
          ) : null}

          {/* Đề xuất bước từ AI: duyệt rồi mới lưu */}
          {buocDeXuat !== null && (
            <div style={{ marginTop: 12 }}>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                {TEN_TRO_LY} đề xuất, anh duyệt
              </div>
              <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
                {buocDeXuat.map((b, i) => (
                  <li key={i} style={{ fontSize: 13.5, color: "var(--cream)", marginBottom: 5, lineHeight: 1.4 }}>
                    {b}
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    onDoiGhiChu(task.id, themBuocVaoGhiChu(task.notes, buocDeXuat));
                    setBuocDeXuat(null);
                  }}
                  style={{
                    background: "var(--amber)",
                    color: "var(--navy)",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 700,
                    minHeight: 44
                  }}
                >
                  Dùng các bước này
                </button>
                <button
                  onClick={() => setBuocDeXuat(null)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--line)",
                    color: "var(--slate)",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontSize: 13,
                    minHeight: 44
                  }}
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" style={{ color: "var(--coral)", fontSize: 13, marginTop: 14 }}>
            {error}
          </p>
        )}

        {/* ----- Điều khiển ----- */}
        {!dangChay && !hetGio && (
          <div style={{ marginTop: 20 }}>
            <p className="mono" style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 10px" }}>
              Thời lượng
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
              {/* Chip chỉ để CHỌN thời lượng; mốc dùng lần trước được chọn sẵn */}
              {PRESET_PHUT.map((p) => (
                <button
                  key={p}
                  onClick={() => setPhutChon(p)}
                  aria-pressed={phutChon === p}
                  style={{
                    background: phutChon === p ? "var(--field)" : "transparent",
                    color: "var(--cream)",
                    border: `1px solid ${phutChon === p ? "var(--amber)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "14px 20px",
                    fontSize: 16,
                    fontWeight: phutChon === p ? 700 : 500,
                    minHeight: 52
                  }}
                >
                  {p} phút
                </button>
              ))}

              {/* Số phút tùy chọn, 5-180 theo đúng giới hạn API */}
              <div
                onClick={() => setPhutChon("khac")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: phutChon === "khac" ? "var(--field)" : "transparent",
                  border: `1px solid ${phutChon === "khac" ? "var(--amber)" : "var(--line)"}`,
                  borderRadius: 12,
                  padding: "0 14px",
                  minHeight: 52,
                  cursor: "text"
                }}
              >
                <input
                  value={phutKhac}
                  onFocus={() => setPhutChon("khac")}
                  onChange={(e) => setPhutKhac(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && phutHopLe) batDau(phutHieuLuc);
                  }}
                  inputMode="numeric"
                  placeholder="Khác"
                  aria-label="Số phút tùy chọn, từ 5 đến 180"
                  style={{
                    width: 52,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--cream)",
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: "var(--font-body)",
                    textAlign: "center"
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--slate)" }}>phút</span>
              </div>
            </div>

            {/* Nút bắt đầu riêng, nói rõ sẽ chạy bao nhiêu phút */}
            <button
              onClick={() => batDau(phutHieuLuc)}
              disabled={!phutHopLe}
              style={{
                width: "100%",
                marginTop: 14,
                background: phutHopLe ? "var(--amber)" : "var(--field)",
                color: phutHopLe ? "var(--navy)" : "var(--slate)",
                border: "none",
                borderRadius: 12,
                padding: "15px 0",
                fontSize: 16,
                fontWeight: 700,
                minHeight: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9
              }}
            >
              <IcPlay size={15} />
              Bắt đầu{phutHopLe ? ` · ${phutHieuLuc} phút` : ""}
            </button>
            {phutChon === "khac" && !phutHopLe && phutKhac !== "" && (
              <p role="alert" style={{ fontSize: 12, color: "var(--coral)", margin: "8px 0 0" }}>
                Thời lượng phải từ 5 đến 180 phút.
              </p>
            )}
            <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 14, lineHeight: 1.5 }}>
              Màn hình được giữ sáng trong phiên. Nếu anh khóa máy, đồng hồ vẫn tính
              đúng nhưng sẽ không có chuông khi hết giờ.
            </p>
          </div>
        )}

        {dangChay && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
            <button
              onClick={() => ketThuc(false)}
              style={{
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--slate)",
                borderRadius: 10,
                padding: "11px 20px",
                fontSize: 13,
                minHeight: 44
              }}
            >
              Kết thúc sớm
            </button>
          </div>
        )}

        {hetGio && !dangChay && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
            <button
              onClick={() => {
                onXongViec(task.id);
                onClose();
              }}
              style={{
                background: "var(--teal)",
                color: "var(--navy)",
                border: "none",
                borderRadius: 10,
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 700,
                minHeight: 48
              }}
            >
              ✓ Việc này xong luôn
            </button>
            <button
              onClick={() => setHetGio(false)}
              style={{
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--cream)",
                borderRadius: 10,
                padding: "12px 20px",
                fontSize: 14,
                minHeight: 48
              }}
            >
              Tập trung tiếp
            </button>
            <button
              onClick={onClose}
              style={{ background: "transparent", border: "none", color: "var(--slate)", fontSize: 13, minHeight: 48, padding: "0 10px" }}
            >
              Đóng
            </button>
          </div>
        )}

        {homNay && homNay.giay > 0 && (
          <p className="mono" style={{ fontSize: 11.5, color: "var(--slate)", textAlign: "center", marginTop: 26 }}>
            Hôm nay đã tập trung {Math.round(homNay.giay / 60)} phút · {homNay.phien} phiên
          </p>
        )}
      </div>
    </div>
  );
}
