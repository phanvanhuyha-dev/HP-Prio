"use client";
import { useEffect, useRef, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "idle" | "enabled" | "denied" | "unsupported" | "error";

export default function PushSetup() {
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Cache promise đăng ký service worker để enablePush dùng lại.
  const regPromiseRef = useRef<Promise<ServiceWorkerRegistration> | null>(null);

  // Lấy registration đã active để subscribe. Không await thẳng serviceWorker.ready ngay:
  // .ready không bao giờ resolve nếu bước đăng ký thất bại, làm nút kẹt "Đang bật…" mãi.
  async function getActiveRegistration() {
    try {
      const regPromise = regPromiseRef.current ?? navigator.serviceWorker.register("/sw.js");
      regPromiseRef.current = regPromise;
      await regPromise;
    } catch (err) {
      // Đăng ký thất bại thì bỏ cache, lần bấm sau thử đăng ký lại từ đầu thay vì
      // nhận lại mãi đúng promise đã rejected.
      regPromiseRef.current = null;
      throw err;
    }
    // Đăng ký thành công thì .ready chắc chắn resolve. Vẫn phải chờ worker active,
    // vì pushManager.subscribe() sẽ lỗi nếu service worker mới cài chưa kịp active.
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
        // Đã đăng ký từ lần trước thì hiện đúng trạng thái, không bắt bấm lại.
        if (!cancelled && existing && Notification.permission === "granted") {
          setStatus("enabled");
        }
      })
      .catch((err) => {
        console.error("Service worker error:", err);
        // Bỏ promise hỏng để lần bấm "Bật nhắc deadline" tự đăng ký lại.
        regPromiseRef.current = null;
        if (!cancelled) {
          setStatus("error");
          setMessage("Không đăng ký được service worker. Anh bấm thử lại hoặc tải lại trang.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    setBusy(true);
    setMessage(null);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setStatus("error");
        setMessage("Máy chủ chưa cấu hình khóa thông báo (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
        return;
      }

      // iOS Safari chỉ cho xin quyền thông báo trong ngữ cảnh thao tác của người dùng.
      // Phải gọi trước mọi bước await khác, nếu không có thể bị từ chối im lặng.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Không lưu được đăng ký thông báo");
      }

      setStatus("enabled");
    } catch (err: any) {
      console.error("Enable push error:", err);
      setStatus("error");
      setMessage(err?.message || "Không bật được thông báo, thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported") return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {status === "enabled" ? (
        <span className="mono" style={{ fontSize: 12, color: "var(--teal)" }}>
          🔔 Đã bật nhắc deadline
        </span>
      ) : (
        <button
          onClick={enablePush}
          disabled={busy}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            color: "var(--cream)",
            borderRadius: 8,
            padding: "11px 16px",
            fontSize: 13,
            minHeight: 44,
            opacity: busy ? 0.6 : 1
          }}
        >
          {busy ? "Đang bật…" : "Bật nhắc deadline"}
        </button>
      )}

      {status === "denied" && (
        <span className="mono" style={{ fontSize: 11, color: "var(--coral)" }}>
          Trình duyệt đã chặn thông báo, vào Cài đặt để bật lại
        </span>
      )}

      {status === "error" && message && (
        <span className="mono" style={{ fontSize: 11, color: "var(--coral)" }}>
          {message}
        </span>
      )}
    </div>
  );
}
