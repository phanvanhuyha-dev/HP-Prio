import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { endFocusSession, isValidUuid } from "@/lib/db";
import { describeDbError, loiJson } from "@/lib/diagnostics";

// PATCH: kết thúc một phiên tập trung, ghi lại thời lượng thực tế
// (chặn trên bằng số phút dự kiến, xem endFocusSession).
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isValidUuid(params.id)) {
    return NextResponse.json({ error: "Mã phiên không hợp lệ" }, { status: 400 });
  }

  try {
    const phien = await endFocusSession(params.id, session.user.email);
    // Phiên đã được tự đóng trước đó (vd bắt đầu phiên mới trong lúc phiên cũ
    // còn treo) thì không phải lỗi, client cứ đi tiếp bình thường.
    if (!phien) return NextResponse.json({ ok: true, daDongTruoc: true });
    return NextResponse.json({ session: phien });
  } catch (err) {
    return loiJson(describeDbError(err), "focus");
  }
}
