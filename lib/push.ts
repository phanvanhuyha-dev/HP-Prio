import webpush from "web-push";

// QUAN TRỌNG: không cấu hình VAPID ở cấp module.
// Next.js nạp file này khi build (bước "Collecting page data"), nếu thiếu biến
// môi trường thì setVapidDetails sẽ ném lỗi và làm hỏng toàn bộ bản build.
let configured = false;

export function isPushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Thiếu NEXT_PUBLIC_VAPID_PUBLIC_KEY hoặc VAPID_PRIVATE_KEY");
  }
  webpush.setVapidDetails(
    `mailto:${process.env.OWNER_EMAIL || "owner@example.com"}`,
    publicKey,
    privateKey
  );
  configured = true;
}

export type PushSubscriptionData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// "expired": trình duyệt đã hủy đăng ký, cần xóa khỏi database để khỏi gửi lại mãi.
export type PushResult = "sent" | "expired" | "failed";

export async function sendPush(
  subscription: PushSubscriptionData,
  payload: { title: string; body: string; url?: string }
): Promise<PushResult> {
  try {
    ensureConfigured();
    await webpush.sendNotification(subscription as any, JSON.stringify(payload));
    return "sent";
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) return "expired";
    // 400/403: đăng ký không còn dùng được với khóa VAPID hiện tại (thường do xoay khóa,
    // hoặc token đã hỏng). Giữ lại chỉ khiến cron gửi lỗi mãi mỗi ngày, nên cũng dọn luôn.
    // Người dùng bấm "Bật nhắc deadline" lại là có đăng ký mới.
    if (err?.statusCode === 400 || err?.statusCode === 403) {
      console.warn(`Push subscription bị từ chối (HTTP ${err.statusCode}), sẽ xóa khỏi database.`);
      return "expired";
    }
    console.error("Push send error:", err);
    return "failed";
  }
}
