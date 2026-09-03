import { NextResponse } from "next/server";
import { saveLichTay, ngayVNHomNay } from "@/lib/db";
import { xoaDemLich, type SuKien } from "@/lib/calendar";
import { docLichTay } from "@/lib/doc-lich-tay";

export const dynamic = "force-dynamic";

function ngayVN(isoString: string): string {
  try {
    const d = new Date(new Date(isoString).getTime() + 7 * 3600e3);
    return d.toISOString().slice(0, 10);
  } catch {
    return ngayVNHomNay();
  }
}

// Nhận dữ liệu lịch từ máy tính cá nhân qua kịch bản tự động hoặc MCP server.
// Xác thực bằng khóa bí mật CALENDAR_SYNC_TOKEN đặt trong biến môi trường.
export async function POST(req: Request) {
  const secret = process.env.CALENDAR_SYNC_TOKEN?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CALENDAR_SYNC_TOKEN chưa được cấu hình trên máy chủ" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token || token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!ownerEmail) {
    return NextResponse.json(
      { error: "OWNER_EMAIL chưa được cấu hình trên máy chủ" },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu JSON gửi lên không hợp lệ" }, { status: 400 });
  }

  let tongSo = 0;
  const cacNgay = new Set<string>();

  // Trường hợp 1: Nhận danh sách sự kiện đã có cấu trúc (từ Outlook COM script)
  if (Array.isArray(body?.suKien)) {
    const grouped = new Map<string, SuKien[]>();

    for (const ev of body.suKien) {
      if (!ev || typeof ev.tieuDe !== "string" || !ev.batDau || !ev.ketThuc) continue;
      const ngay = ngayVN(ev.batDau);
      if (!grouped.has(ngay)) grouped.set(ngay, []);
      grouped.get(ngay)!.push({
        tieuDe: String(ev.tieuDe).slice(0, 200),
        batDau: ev.batDau,
        ketThuc: ev.ketThuc,
        caNgay: Boolean(ev.caNgay)
      });
    }

    for (const [ngay, ds] of grouped.entries()) {
      ds.sort((a, b) => a.batDau.localeCompare(b.batDau));
      await saveLichTay(ownerEmail, ngay, ds);
      cacNgay.add(ngay);
      tongSo += ds.length;
    }
  } else if (typeof body?.text === "string" && body.text.trim()) {
    // Trường hợp 2: Nhận văn bản thô dán từ clipboard / web
    const ngay = typeof body.ngay === "string" && body.ngay ? body.ngay : ngayVNHomNay();
    const ds = docLichTay(body.text, ngay);
    await saveLichTay(ownerEmail, ngay, ds);
    cacNgay.add(ngay);
    tongSo = ds.length;
  } else {
    return NextResponse.json(
      { error: "Thiếu dữ liệu: cần cung cấp mảng 'suKien' hoặc chuỗi 'text'" },
      { status: 400 }
    );
  }

  // Làm mới bộ nhớ đệm lịch tức thì để người dùng mở app thấy ngay
  xoaDemLich(ownerEmail);

  return NextResponse.json({
    ok: true,
    soLuong: tongSo,
    cacNgay: Array.from(cacNgay)
  });
}
