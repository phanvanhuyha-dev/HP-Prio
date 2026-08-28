import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { savePushSubscription } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let sub: any;
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }

  // Các cột endpoint/p256dh/auth đều NOT NULL, thiếu trường nào là truy vấn ném lỗi.
  if (
    typeof sub?.endpoint !== "string" ||
    !sub.endpoint ||
    typeof sub?.keys?.p256dh !== "string" ||
    typeof sub?.keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "Thông tin đăng ký thông báo không hợp lệ" }, { status: 400 });
  }

  try {
    await savePushSubscription(session.user.email, {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Save push subscription error:", err);
    return NextResponse.json({ error: "Không lưu được đăng ký thông báo" }, { status: 500 });
  }
}
