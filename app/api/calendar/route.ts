import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { suKienSapToi } from "@/lib/calendar";

export const dynamic = "force-dynamic";

// Lịch họp hôm nay + ngày mai, gộp từ các liên kết ICS của riêng người đang
// đăng nhập (user_settings.ics_urls).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await suKienSapToi(session.user.email));
  } catch (err) {
    console.error("Calendar error:", err);
    // Lịch là tiện ích phụ: lỗi thì coi như không có, không làm hỏng màn hình chính
    return NextResponse.json({ cauHinh: true, suKien: [] });
  }
}
