import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  updateTask,
  updateTaskStatus,
  deleteTask,
  hardDeleteTask,
  isValidCategory,
  isValidStatus,
  isValidUuid
} from "@/lib/db";
import { describeDbError, loiJson } from "@/lib/diagnostics";

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

    // Chỉ nhận đúng những tên trường này. Trước đây gửi sai tên (vd "urgent"
    // thay vì "userUrgent") vẫn trả 200 kèm bản ghi không đổi, client tưởng đã
    // lưu thành công. Body rỗng thì lại rơi xuống truy vấn rồi trả 404, che mất
    // nguyên nhân thật.
    const TRUONG_HOP_LE = ["title", "category", "deadline", "notes", "userUrgent", "userImportant"];
    const daGui = TRUONG_HOP_LE.filter((k) => k in body);
    if (daGui.length === 0) {
      const la = Object.keys(body).filter((k) => !TRUONG_HOP_LE.includes(k) && k !== "status");
      return NextResponse.json(
        {
          error: la.length
            ? `Không có trường nào hợp lệ để cập nhật. Trường không nhận ra: ${la.join(", ")}.`
            : "Không có trường nào để cập nhật."
        },
        { status: 400 }
      );
    }

    if (body?.category !== undefined && !isValidCategory(body.category)) {
      return NextResponse.json({ error: "Nhãn phân loại không hợp lệ" }, { status: 400 });
    }
    if (body?.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
      return NextResponse.json({ error: "Tiêu đề không hợp lệ" }, { status: 400 });
    }
    if (body?.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "Ghi chú không hợp lệ" }, { status: 400 });
    }
    if (typeof body?.notes === "string" && body.notes.length > 20000) {
      return NextResponse.json({ error: "Ghi chú quá dài (tối đa 20.000 ký tự)" }, { status: 400 });
    }

    const task = await updateTask(params.id, session.user.email, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      category: body.category,
      // Giữ nguyên sự khác biệt: không gửi trường = undefined (bỏ qua),
      // gửi null = xóa deadline.
      deadline: "deadline" in body ? body.deadline : undefined,
      notes: "notes" in body ? body.notes : undefined,
      userUrgent: typeof body.userUrgent === "boolean" ? body.userUrgent : undefined,
      userImportant: typeof body.userImportant === "boolean" ? body.userImportant : undefined
    });

    if (!task) return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (err) {
    console.error("Update task error:", err);
    return loiJson(describeDbError(err), "tasks");
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "Mã công việc không hợp lệ" }, { status: 400 });
  }

  // ?vinhVien=1 xóa hẳn khỏi database, chỉ dùng được từ màn Thùng rác.
  // Mặc định là xóa mềm để còn khôi phục được.
  const vinhVien = new URL(req.url).searchParams.get("vinhVien") === "1";

  try {
    const removed = vinhVien
      ? await hardDeleteTask(params.id, session.user.email)
      : await deleteTask(params.id, session.user.email);
    if (!removed) {
      return NextResponse.json(
        { error: vinhVien ? "Việc này không nằm trong thùng rác" : "Không tìm thấy công việc" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete task error:", err);
    return loiJson(describeDbError(err), "tasks");
  }
}
