import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { layTenTroLyAnToan } from "@/lib/db";
import { breakdownTask } from "@/lib/gemini";
import { describeGeminiError, loiJson } from "@/lib/diagnostics";

export const maxDuration = 60;

// POST: nhờ AI chia việc thành các bước cho bản nháp chưa lưu.
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

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Thiếu tiêu đề công việc" }, { status: 400 });
  }

  try {
    const troLy = await layTenTroLyAnToan(session.user.email);
    const steps = await breakdownTask(
      {
        title,
        deadline: typeof body?.deadline === "string" ? body.deadline : null,
        notes: typeof body?.notes === "string" ? body.notes : null
      },
      troLy
    );
    if (steps.length === 0) {
      return NextResponse.json(
        { error: "AI không đề xuất được bước nào, anh thử lại hoặc tự thêm bước bằng tay." },
        { status: 502 }
      );
    }
    return NextResponse.json({ steps });
  } catch (err) {
    console.error("Breakdown draft error:", err);
    return loiJson(describeGeminiError(err), "breakdown");
  }
}
