import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveReflection, listReflections, ngayVNHomNay, layTenTroLyAnToan } from "@/lib/db";
import { tongHopNhatKy } from "@/lib/gemini";
import { describeDbError, describeGeminiError, loiJson } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?tu=YYYY-MM-DD&den=YYYY-MM-DD: danh sách nhật ký trong khoảng.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const den = sp.get("den") ?? ngayVNHomNay();
  const tu = sp.get("tu") ?? new Date(Date.now() + 7 * 3600e3 - 30 * 86400000).toISOString().slice(0, 10);
  if (!NGAY_RE.test(tu) || !NGAY_RE.test(den)) {
    return NextResponse.json({ error: "Khoảng ngày không hợp lệ" }, { status: 400 });
  }
  try {
    return NextResponse.json({ entries: await listReflections(session.user.email, tu, den) });
  } catch (err) {
    return loiJson(describeDbError(err), "reflections");
  }
}

// PUT: ghi nhật ký của một ngày (mặc định hôm nay). Hai ô đều trống là xóa.
export async function PUT(req: Request) {
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
  const ngay = typeof body?.ngay === "string" && NGAY_RE.test(body.ngay) ? body.ngay : ngayVNHomNay();
  const lay = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null);
  try {
    await saveReflection(session.user.email, ngay, lay(body?.thanhTuu), lay(body?.caiThien));
    return NextResponse.json({ ok: true, ngay });
  } catch (err) {
    return loiJson(describeDbError(err), "reflections");
  }
}

// POST { tu, den, nhan }: Bé iu tổng hợp nhật ký trong khoảng, chỉ chạy khi bấm.
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
  const { tu, den } = body ?? {};
  if (!NGAY_RE.test(tu ?? "") || !NGAY_RE.test(den ?? "")) {
    return NextResponse.json({ error: "Khoảng ngày không hợp lệ" }, { status: 400 });
  }

  let entries;
  try {
    entries = await listReflections(session.user.email, tu, den);
  } catch (err) {
    return loiJson(describeDbError(err), "reflections");
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "Khoảng này chưa có dòng nhật ký nào để tổng hợp." }, { status: 400 });
  }

  try {
    const tomTat = await tongHopNhatKy(
      typeof body?.nhan === "string" ? body.nhan.slice(0, 40) : "khoảng thời gian đã chọn",
      entries.map((e) => ({ ngay: String(e.ngay).slice(0, 10), thanhTuu: e.thanh_tuu, caiThien: e.cai_thien })),
      await layTenTroLyAnToan(session.user.email)
    );
    return NextResponse.json({ tomTat });
  } catch (err) {
    console.error("Reflection summary error:", err);
    return loiJson(describeGeminiError(err), "reflections");
  }
}
