import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTaskById, isValidUuid, layTenTroLyAnToan } from "@/lib/db";
import { breakdownTask } from "@/lib/gemini";
import { describeDbError, describeGeminiError, loiJson } from "@/lib/diagnostics";

// Gemini có lúc chậm, xem chú thích ở /api/parse.
export const maxDuration = 60;

// POST: nhờ AI chia việc thành các bước. Chỉ TRẢ VỀ danh sách bước, không tự
// ghi vào ghi chú: người dùng duyệt và sửa trong ô ghi chú rồi mới lưu, đúng
// nguyên tắc "AI đề xuất, anh duyệt" của toàn app.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "Mã công việc không hợp lệ" }, { status: 400 });
  }

  let task;
  try {
    task = await getTaskById(params.id, session.user.email);
  } catch (err) {
    return loiJson(describeDbError(err), "breakdown");
  }
  if (!task) {
    return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
  }

  try {
    const steps = await breakdownTask(
      {
        title: task.title,
        deadline: task.deadline,
        notes: task.notes
      },
      await layTenTroLyAnToan(session.user.email)
    );
    if (steps.length === 0) {
      return NextResponse.json(
        { error: "AI không đề xuất được bước nào, anh thử lại hoặc tự ghi vào ghi chú." },
        { status: 502 }
      );
    }
    return NextResponse.json({ steps });
  } catch (err) {
    console.error("Breakdown error:", err);
    return loiJson(describeGeminiError(err), "breakdown");
  }
}
