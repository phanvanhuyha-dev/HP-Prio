import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { xoaMsToken } from "@/lib/db";
import { cauHinhMs, daNoiMicrosoft } from "@/lib/ms-lich";
import { xoaDemLich } from "@/lib/calendar";
import { describeDbError, loiJson } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

// Trạng thái nối lịch Microsoft, để màn hình Cài đặt biết hiện nút "Nối" hay
// dòng "Đã nối ... / Ngắt".
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tt = await daNoiMicrosoft(session.user.email);
  return NextResponse.json({ ...tt, cauHinh: Boolean(cauHinhMs()) });
}

// Ngắt kết nối: xóa token phía mình. Người dùng nên vào
// https://myapps.microsoft.com để thu hồi hẳn quyền phía Microsoft.
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await xoaMsToken(session.user.email);
    xoaDemLich(session.user.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return loiJson(describeDbError(err), "ms");
  }
}
