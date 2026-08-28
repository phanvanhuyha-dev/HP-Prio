import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listTasks, createTask, isValidCategory, isValidStatus, normalizeDeadline } from "@/lib/db";
import { describeDbError, loiJson } from "@/lib/diagnostics";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("status") || "open";
  if (!isValidStatus(requested)) {
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
  }

  try {
    const tasks = await listTasks(session.user.email, requested);
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("List tasks error:", err);
    return loiJson(describeDbError(err), "tasks");
  }
}

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
  if (title.length > 500) {
    return NextResponse.json({ error: "Tiêu đề quá dài" }, { status: 400 });
  }

  // Cột category có ràng buộc CHECK trong Postgres. Không lọc ở đây thì
  // giá trị lạ sẽ làm truy vấn ném lỗi và trả về 500 thô cho người dùng.
  if (!isValidCategory(body?.category)) {
    return NextResponse.json({ error: "Nhãn phân loại không hợp lệ" }, { status: 400 });
  }

  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 20000) {
    return NextResponse.json({ error: "Ghi chú quá dài (tối đa 20.000 ký tự)" }, { status: 400 });
  }

  try {
    const task = await createTask({
      userEmail: session.user.email,
      rawInput: typeof body.rawInput === "string" && body.rawInput.trim() ? body.rawInput : title,
      title,
      category: body.category,
      deadline: normalizeDeadline(body.deadline),
      notes: notes || null,
      aiUrgent: typeof body.aiUrgent === "boolean" ? body.aiUrgent : null,
      aiImportant: typeof body.aiImportant === "boolean" ? body.aiImportant : null,
      aiCategory: isValidCategory(body.aiCategory) ? body.aiCategory : null,
      aiDeadline: normalizeDeadline(body.aiDeadline),
      aiReasoning: typeof body.aiReasoning === "string" ? body.aiReasoning : null,
      userUrgent: Boolean(body.userUrgent),
      userImportant: Boolean(body.userImportant)
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error("Create task error:", err);
    return loiJson(describeDbError(err), "tasks");
  }
}
