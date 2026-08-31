import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveTenGoi } from "@/lib/db";
import { describeDbError, loiJson } from "@/lib/diagnostics";

// Cập nhật tên gọi hiển thị trong lời chào. Lưu máy chủ để mọi thiết bị
// (web, iPhone) cùng thấy, thay vì localStorage theo từng máy như trước.
export async function PATCH(req: Request) {
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

  if (body?.tenGoi !== undefined && body.tenGoi !== null && typeof body.tenGoi !== "string") {
    return NextResponse.json({ error: "Tên gọi không hợp lệ" }, { status: 400 });
  }
  const ten = typeof body?.tenGoi === "string" ? body.tenGoi.trim().slice(0, 40) : "";

  try {
    await saveTenGoi(session.user.email, ten || null);
    return NextResponse.json({ ok: true, tenGoi: ten || null });
  } catch (err) {
    return loiJson(describeDbError(err), "settings");
  }
}
