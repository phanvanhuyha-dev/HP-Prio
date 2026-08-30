"use client";
import { useEffect, useRef, useState } from "react";
import { docLoi, loiThanThien } from "@/lib/client-api";
import NotesView from "./NotesView";
import type { Task } from "./QuadrantBoard";

// Phiên đang chạy, lưu vào localStorage để iOS có "giết" app giữa chừng
// (chuyện thường với PWA) thì mở lại vẫn tiếp tục đúng chỗ. Đồng hồ tính theo
// MỐC THỜI GIAN chứ không cộng dồn từng giây, nên nền hay không nền vẫn đúng.
export type PhienTapTrung = {
  sessionId: string;
  taskId: string;
  batDau: number; // Date.now()
  ketThucLuc: number; // Date.now() + phút * 60000
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

const PRESET_PHUT = [15, 25, 50];

export default function FocusMode({
  task,
  phienCu,
  onClose,
  onXongViec,
  onDoiGhiChu
}: {
  task: Task;
  // Phiên khôi phục sau khi app bị đóng giữa chừng, null nếu bắt đầu mới
  phienCu: PhienTapTrung | null;
  onClose: () => void;
  onXongViec: (id: string) => void;
  onDoiGhiChu: (id: string, notes: string) => void;
}) {
  const [phien, setPhien] = useState<PhienTapTrung | null>(phienCu);
  const [conLai, setConLai] = useState(() =>
    phienCu ? Math.round((phienCu.ketThucLuc - Date.now()) / 1000) : 0
  );
  const [hetGio, setHetGio] = useState(false);
  const [phutVuaXong, setPhutVuaXong] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [homNay, setHomNay] = useState<{ giay: number; phien: number } | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);
  const daBaoRef = useRef(false);
  const dangChayRef = useRef(false);

  // Tổng đã tập trung hôm nay, tải lại sau mỗi phiên hoàn thành
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
    // Thông báo hệ thống nếu đã cấp quyền (tận dụng quyền push sẵn có).
    // Chỉ chạy khi app còn thức; máy đang khóa thì JS không chạy, đã ghi rõ
    // giới hạn này trên giao diện.
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        navigator.serviceWorker?.ready
          .then((r) => r.showNotification("⏰ Hết giờ tập trung", { body: task.title, icon: "/icons/icon-192.png" }))
          .catch(() => {});
      }
    } catch {}
  }

  async function batDau(phut: number) {
    if (dangChayRef.current) return;
    dangChayRef.current = true;
    setError(null);
    // Tạo AudioContext ngay trong thao tác bấm để iOS cho phép phát chuông sau này
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
      dangChayRef.current = false;
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
    }
    try {
      await fetch(`/api/focus/${p.sessionId}`, { method: "PATCH" });
    } catch {
      // Mất mạng thì thôi: phiên sẽ được tự đóng (có chặn trên thời lượng)
      // ở lần bắt đầu phiên sau, không mất dữ liệu đáng kể.
    }
    if (!dungGio) onClose();
  }

  const dangChay = phien !== null;
  const phanTram = phien ? Math.min(100, ((phien.phut * 60 - conLai) / (phien.phut * 60)) * 100) : 0;

  return (
    <div className="focus-lop" role="dialog" aria-modal="true" aria-label="Chế độ tập trung">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--teal)", letterSpacing: "0.12em" }}>
            CHẾ ĐỘ TẬP TRUNG
          </span>
          <button
            onClick={() => (dangChay ? ketThuc(false) : onClose())}
            className="tap"
            aria-label={dangChay ? "Kết thúc sớm và đóng" : "Đóng"}
            style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 18, margin: -10 }}
          >
            ✕
          </button>
        </div>

        <h2
          className="viec-tieu-de"
          style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.3, color: "var(--cream)", margin: "0 0 6px" }}
        >
          {task.title}
        </h2>
        {task.deadline && (
          <p className="mono" style={{ fontSize: 12, color: "var(--slate)", margin: "0 0 16px" }}>
            Hạn: {new Date(task.deadline).toLocaleDateString("vi-VN")}
          </p>
        )}

        {/* ----- Trạng thái: chọn thời lượng ----- */}
        {!dangChay && !hetGio && (
          <>
            <p style={{ fontSize: 14, color: "var(--slate)", margin: "18px 0 10px" }}>
              Anh định tập trung bao lâu?
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {PRESET_PHUT.map((p) => (
                <button
                  key={p}
                  onClick={() => batDau(p)}
                  style={{
                    background: p === 25 ? "var(--amber)" : "transparent",
                    color: p === 25 ? "var(--navy)" : "var(--cream)",
                    border: `1px solid ${p === 25 ? "var(--amber)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "14px 22px",
                    fontSize: 16,
                    fontWeight: 700,
                    minHeight: 52
                  }}
                >
                  {p} phút
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 14, lineHeight: 1.5 }}>
              Màn hình sẽ được giữ sáng trong phiên. Nếu anh khóa máy, đồng hồ vẫn
              tính đúng nhưng sẽ không có chuông khi hết giờ.
            </p>
          </>
        )}

        {/* ----- Trạng thái: đang chạy ----- */}
        {dangChay && (
          <>
            <div style={{ textAlign: "center", margin: "34px 0 10px" }}>
              <div
                className="mono"
                aria-live="off"
                style={{ fontSize: 72, fontWeight: 500, color: "var(--cream)", lineHeight: 1 }}
              >
                {mmss(conLai)}
              </div>
              <div style={{ height: 4, background: "var(--field)", borderRadius: 2, margin: "22px 0 8px" }}>
                <div
                  style={{ height: "100%", width: `${phanTram}%`, background: "var(--teal)", borderRadius: 2 }}
                />
              </div>
              <p className="mono" style={{ fontSize: 11.5, color: "var(--slate)" }}>
                phiên {phien!.phut} phút
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
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
          </>
        )}

        {/* ----- Trạng thái: hết giờ ----- */}
        {hetGio && !dangChay && (
          <div style={{ textAlign: "center", margin: "30px 0" }}>
            <p style={{ fontSize: 40, margin: 0 }}>🎉</p>
            <p style={{ fontSize: 17, color: "var(--cream)", fontWeight: 600, margin: "8px 0 22px" }}>
              Xong phiên {phutVuaXong} phút
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
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
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--slate)",
                  fontSize: 13,
                  minHeight: 48,
                  padding: "0 10px"
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" style={{ color: "var(--coral)", fontSize: 13, marginTop: 14 }}>
            {error}
          </p>
        )}

        {/* Ghi chú và các bước: đánh dấu được ngay trong lúc tập trung,
            đây chính là cặp bài trùng với nút "Chia bước". */}
        {task.notes && (
          <div
            style={{
              marginTop: 22,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--cream)",
              background: "var(--navy-2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "12px 14px"
            }}
          >
            <NotesView text={task.notes} onDoi={(moi) => onDoiGhiChu(task.id, moi)} />
          </div>
        )}

        {homNay && homNay.giay > 0 && (
          <p className="mono" style={{ fontSize: 11.5, color: "var(--slate)", textAlign: "center", marginTop: 24 }}>
            Hôm nay đã tập trung {Math.round(homNay.giay / 60)} phút · {homNay.phien} phiên
          </p>
        )}
      </div>
    </div>
  );
}
