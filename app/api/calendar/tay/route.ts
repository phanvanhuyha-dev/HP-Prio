import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveLichTay, xoaLichTay, ngayVNHomNay } from "@/lib/db";
import { docLichTay } from "@/lib/doc-lich-tay";
import { describeDbError, loiJson } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

// Nhận lịch họp người dùng dán từ Outlook hoặc từ email Agenda mail, đọc bằng
// luật rồi lưu cho ngày hôm nay. Không gọi AI: đọc tức thì và không tốn hạn mức.
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

  const text = body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Anh chưa dán nội dung lịch" }, { status: 400 });
  }
  if (text.length > 20000) {
    return NextResponse.json({ error: "Nội dung quá dài, anh dán riêng lịch hôm nay giúp em" }, { status: 400 });
  }

  const ngay = ngayVNHomNay();
  const suKien = docLichTay(text, ngay);

  if (suKien.length === 0) {
    return NextResponse.json(
      {
        error: "Em không nhận ra cuộc họp nào trong đoạn này",
        khacPhuc:
          "Mỗi dòng cần có giờ, ví dụ “8:30 - 9:30 Họp giao ban” hoặc “2:00 CH Phỏng vấn”. Anh thử copy lại phần danh sách lịch trong Outlook."
      },
      { status: 400 }
    );
  }

  try {
    await saveLichTay(session.user.email, ngay, suKien);
    return NextResponse.json({ ok: true, suKien, soLuong: suKien.length });
  } catch (err) {
    return loiJson(describeDbError(err), "lich-tay");
  }
}

// Xóa lịch đã dán của hôm nay
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await xoaLichTay(session.user.email, ngayVNHomNay());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return loiJson(describeDbError(err), "lich-tay");
  }
}
