import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  updateTask,
  updateTaskStatus,
  deleteTask,
  isValidCategory,
  isValidStatus,
  isValidUuid
} from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Không kiểm tra thì Postgres ném "invalid input syntax for type uuid" -> 500.
  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "Mã công việc không hợp lệ" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }

  // req.json() có thể trả về chuỗi hoặc mảng. Toán tử "in" bên dưới sẽ ném
  // TypeError nếu body không phải object thuần.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }

  try {
    if (body?.status !== undefined) {
      if (!isValidStatus(body.status)) {
        return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
      }
      const task = await updateTaskStatus(params.id, session.user.email, body.status);
      if (!task) return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
      return NextResponse.json({ task });
    }

    if (body?.category !== undefined && !isValidCategory(body.category)) {
      return NextResponse.json({ error: "Nhãn phân loại không hợp lệ" }, { status: 400 });
    }
    if (body?.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
      return NextResponse.json({ error: "Tiêu đề không hợp lệ" }, { status: 400 });
    }

    const task = await updateTask(params.id, session.user.email, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      category: body.category,
      // Giữ nguyên sự khác biệt: không gửi trường = undefined (bỏ qua),
      // gửi null = xóa deadline.
      deadline: "deadline" in body ? body.deadline : undefined,
      userUrgent: typeof body.userUrgent === "boolean" ? body.userUrgent : undefined,
      userImportant: typeof body.userImportant === "boolean" ? body.userImportant : undefined
    });

    if (!task) return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (err) {
    console.error("Update task error:", err);
    return NextResponse.json({ error: "Không cập nhật được công việc" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "Mã công việc không hợp lệ" }, { status: 400 });
  }

  try {
    const removed = await deleteTask(params.id, session.user.email);
    if (!removed) return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete task error:", err);
    return NextResponse.json({ error: "Không xóa được công việc" }, { status: 500 });
  }
}
