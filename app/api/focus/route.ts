import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTaskById, startFocusSession, focusHomNay, isValidUuid } from "@/lib/db";
import { describeDbError, loiJson } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

// GET: tổng thời gian tập trung hôm nay (giờ Việt Nam), hiện trong màn tập trung.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const homNay = await focusHomNay(session.user.email);
    return NextResponse.json({ homNay });
  } catch (err) {
    return loiJson(describeDbError(err), "focus");
  }
}

// POST: bắt đầu một phiên tập trung cho một việc đang mở.
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

  if (!isValidUuid(body?.taskId)) {
    return NextResponse.json({ error: "Mã công việc không hợp lệ" }, { status: 400 });
  }
  const phut = Number(body?.phut);
  if (!Number.isInteger(phut) || phut < 5 || phut > 180) {
    return NextResponse.json({ error: "Thời lượng phải từ 5 đến 180 phút" }, { status: 400 });
  }

  try {
    const task = await getTaskById(body.taskId, session.user.email);
    if (!task || task.status !== "open") {
      return NextResponse.json(
        { error: "Không tìm thấy việc này trong danh sách đang mở" },
        { status: 404 }
      );
    }
    const phien = await startFocusSession(session.user.email, task.id, task.title, phut);
    return NextResponse.json({ session: phien });
  } catch (err) {
    return loiJson(describeDbError(err), "focus");
  }
}
