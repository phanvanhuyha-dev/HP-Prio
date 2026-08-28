import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  getUpcomingForReminders,
  markReminderSent,
  getPushSubscriptions,
  deletePushSubscription,
  type StoredPushSubscription
} from "@/lib/db";
import { sendPush, isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function formatDeadlineVN(deadline: string) {
  // Máy chủ Vercel chạy giờ UTC. Không chỉ định timeZone thì thông báo
  // sẽ hiện sai 7 tiếng so với giờ Việt Nam.
  return new Date(deadline).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// So sánh chuỗi trong thời gian cố định, không lộ thông tin secret qua thời gian phản hồi.
function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Được Vercel Cron gọi định kỳ (xem vercel.json). Bảo vệ bằng CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("Chưa cấu hình CRON_SECRET, từ chối chạy cron.");
    return NextResponse.json({ error: "cron chưa được cấu hình" }, { status: 500 });
  }

  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    console.error("Thiếu khóa VAPID — không gửi được thông báo.");
    return NextResponse.json({ error: "push chưa được cấu hình" }, { status: 500 });
  }

  try {
    const dueTasks = await getUpcomingForReminders();
    let notified = 0;
    let pruned = 0;

    // Các task đến hạn thường cùng một người dùng: chỉ truy vấn danh sách đăng ký
    // một lần cho mỗi email thay vì lặp lại cho từng task.
    const subsByUser = new Map<string, StoredPushSubscription[]>();
    // Đăng ký đã xác định là chết trong lần chạy này, bỏ qua ở các task sau.
    const deadEndpoints = new Set<string>();

    for (const task of dueTasks) {
      let subs = subsByUser.get(task.user_email);
      if (!subs) {
        subs = await getPushSubscriptions(task.user_email);
        subsByUser.set(task.user_email, subs);
      }
      if (subs.length === 0) continue; // chưa bật thông báo, để dành lần chạy sau

      let delivered = 0;
      for (const sub of subs) {
        if (deadEndpoints.has(sub.endpoint)) continue;
        const result = await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          {
            title: "⏰ Sắp đến hạn: " + task.title,
            body: task.deadline ? `Deadline: ${formatDeadlineVN(task.deadline)}` : "",
            url: "/"
          }
        );

        if (result === "sent") {
          delivered++;
        } else if (result === "expired") {
          // Trình duyệt đã hủy đăng ký. Xóa đi để lần sau không gửi lại vô ích.
          await deletePushSubscription(sub.endpoint);
          deadEndpoints.add(sub.endpoint);
          pruned++;
        }
      }

      // Chỉ đánh dấu đã nhắc khi thật sự gửi được, tránh nuốt mất lời nhắc
      // khi dịch vụ push đang lỗi tạm thời.
      if (delivered > 0) {
        await markReminderSent(task.id);
        notified++;
      }
    }

    return NextResponse.json({
      ok: true,
      tasksDue: dueTasks.length,
      remindersSent: notified,
      expiredSubscriptionsRemoved: pruned
    });
  } catch (err) {
    console.error("Cron reminders error:", err);
    return NextResponse.json({ error: "Lỗi khi gửi nhắc deadline" }, { status: 500 });
  }
}
