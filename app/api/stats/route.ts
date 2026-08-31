import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { thongKeTuan } from "@/lib/db";
import { tomTatTuan } from "@/lib/gemini";
import { describeDbError, describeGeminiError, loiJson } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET: số liệu 7 ngày cho tab Nhìn lại. Không gọi AI.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const tk = await thongKeTuan(session.user.email);
    return NextResponse.json(tk);
  } catch (err) {
    return loiJson(describeDbError(err), "stats");
  }
}

// POST: Bé iu viết tóm tắt tuần. Chỉ chạy khi người dùng bấm nút, không chạy nền.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tk;
  try {
    tk = await thongKeTuan(session.user.email);
  } catch (err) {
    return loiJson(describeDbError(err), "stats");
  }

  const tongGiay = tk.focusNgay.reduce((s, n) => s + n.giay, 0);
  const tongPhien = tk.focusNgay.reduce((s, n) => s + n.phien, 0);

  try {
    const tomTat = await tomTatTuan({
      phut: Math.round(tongGiay / 60),
      phien: tongPhien,
      xong: tk.xong7,
      dsXong: tk.vuaXong,
      tao: tk.tao7,
      quaHan: tk.quaHan,
      dangMo: tk.dangMo
    });
    return NextResponse.json({ tomTat });
  } catch (err) {
    console.error("Weekly summary error:", err);
    return loiJson(describeGeminiError(err), "stats");
  }
}
