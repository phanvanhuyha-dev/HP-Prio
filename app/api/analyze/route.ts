import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listTasks } from "@/lib/db";
import { analyzeTasks } from "@/lib/gemini";
import { describeDbError, describeGeminiError, loiJson } from "@/lib/diagnostics";

// Xem chú thích ở /api/parse: Gemini có lúc mất 30-50s.
export const maxDuration = 60;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tasks;
  try {
    tasks = await listTasks(session.user.email, "open");
  } catch (err) {
    console.error("Analyze: list tasks error:", err);
    return loiJson(describeDbError(err), "analyze");
  }

  if (tasks.length === 0) {
    return NextResponse.json({
      summary: "Không có việc nào đang mở, anh đang trống lịch.",
      recommendations: [],
      risks: []
    });
  }

  // Chỉ gửi đúng những trường AI cần. Không gửi raw_input, notes, ai_reasoning:
  // chúng không giúp gì cho việc xếp thứ tự ưu tiên mà lại phình token đầu vào.
  // Cắt deadline về phút, phần giây và mili giây là token thừa.
  //
  // Chặn trên 60 việc: độ trễ analyze tăng theo số việc (1 việc ~2.4s, 20 việc
  // ~6.4s). Danh sách đã sắp theo ưu tiên nên 60 việc đầu là phần đáng phân tích
  // nhất, và người dùng không phải chờ vô hạn khi tồn đọng quá nhiều.
  const GIOI_HAN = 60;
  const compact = tasks.slice(0, GIOI_HAN).map((t) => ({
    title: t.title,
    category: t.category,
    deadline: t.deadline ? String(t.deadline).slice(0, 16) : null,
    urgent: t.user_urgent,
    important: t.user_important
  }));

  try {
    const analysis = await analyzeTasks(compact);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("Gemini analyze error:", err);
    return loiJson(describeGeminiError(err), "analyze");
  }
}
