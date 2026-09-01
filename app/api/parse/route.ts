import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseTaskInput } from "@/lib/gemini";
import { layTenTroLyAnToan } from "@/lib/db";
import { describeGeminiError, loiJson } from "@/lib/diagnostics";

// Gemini có lúc mất 30-50s. Mặc định của Vercel là 10s, không đặt thì request
// bị cắt giữa chừng và người dùng nhận lỗi khó hiểu.
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }

  const text = body?.text;
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Thiếu nội dung công việc" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Nội dung quá dài, anh rút gọn lại giúp" }, { status: 400 });
  }

  try {
    const parsed = await parseTaskInput(text.trim(), await layTenTroLyAnToan(session.user.email));
    return NextResponse.json({ parsed });
  } catch (err: any) {
    console.error("Gemini parse error:", err);
    return loiJson(describeGeminiError(err), "parse");
  }
}
