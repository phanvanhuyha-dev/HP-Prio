"use client";
import { useEffect, useRef, useState } from "react";
import { IcBell, IcBellOff } from "./icons";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "idle" | "enabled" | "denied" | "unsupported" | "error";

// Thu gọn thành MỘT nút chuông trên thanh đầu trang, không còn chiếm một băng
// riêng. Thông báo lỗi/diễn giải đẩy ra ngoài qua onThongBao để hiện ở băng
// thông báo chung của Dashboard.
export default function PushSetup({ onThongBao }: { onThongBao?: (msg: string) => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState(false);
  const regPromiseRef = useRef<Promise<ServiceWorkerRegistration> | null>(null);

  async function getActiveRegistration() {
    try {
      const regPromise = regPromiseRef.current ?? navigator.serviceWorker.register("/sw.js");
      regPromiseRef.current = regPromise;
      await regPromise;
    } catch (err) {
      regPromiseRef.current = null;
      throw err;
    }
    return navigator.serviceWorker.ready;
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    const regPromise = navigator.serviceWorker.register("/sw.js");
    regPromiseRef.current = regPromise;
    regPromise
      .then((reg) => reg.pushManager.getSubscription())
      .then((existing) => {
        if (!cancelled && existing && Notification.permission === "granted") {
          setStatus("enabled");
        }
      })
      .catch((err) => {
        console.error("Service worker error:", err);
        regPromiseRef.current = null;
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    setBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setStatus("error");
        onThongBao?.("Máy chủ chưa cấu hình khóa thông báo.");
        return;
      }

      // iOS chỉ cho xin quyền trong ngữ cảnh thao tác của người dùng,
      // phải gọi trước mọi bước await khác
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        onThongBao?.("Trình duyệt đã chặn thông báo. Anh vào Cài đặt của trang để bật lại.");
        return;
      }

      const reg = await getActiveRegistration();
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub)
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error("Không lưu được đăng ký thông báo");

      setStatus("enabled");
    } catch (err: any) {
      console.error("Enable push error:", err);
      setStatus("error");
      onThongBao?.(err?.message || "Không bật được thông báo, anh thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported") return null;

  const daBat = status === "enabled";
  const nhan = daBat
    ? "Đã bật nhắc deadline"
    : status === "denied"
      ? "Thông báo đang bị chặn, bấm để xem cách bật lại"
      : "Bật nhắc deadline";

  return (
    <button
      onClick={
        daBat
          ? () => onThongBao?.("Nhắc deadline đang bật cho thiết bị này.")
          : enablePush
      }
      disabled={busy}
      aria-label={nhan}
      title={nhan}
      className="tap"
      style={{
        background: "none",
        border: "none",
        fontSize: 17,
        color: daBat ? "var(--teal)" : status === "denied" || status === "error" ? "var(--coral)" : "var(--slate)",
        opacity: busy ? 0.5 : 1
      }}
    >
      {busy ? <span className="spinner" aria-hidden="true" /> : daBat ? <IcBell size={17} /> : <IcBellOff size={17} />}
    </button>
  );
}
