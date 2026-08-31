import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { layHoacTaoBrief } from "@/lib/brief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Điểm tin sáng của hôm nay. Chưa có thì tạo (một lượt AI, sau đó cache trong
// database cả ngày). Lỗi AI không được làm hỏng màn hình chính: trả brief null
// và app đơn giản là không hiện thẻ điểm tin.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const brief = await layHoacTaoBrief(session.user.email);
    return NextResponse.json({ brief });
  } catch (err) {
    console.error("Brief error:", err);
    return NextResponse.json({ brief: null });
  }
}
