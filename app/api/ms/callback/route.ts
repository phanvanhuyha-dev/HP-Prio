import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { doiMaLayToken } from "@/lib/ms-lich";

export const dynamic = "force-dynamic";

// Microsoft báo lỗi bằng mã AADSTS khó đọc. Dịch mấy trường hợp hay gặp sang
// tiếng Việt, nhất là trường hợp công ty bắt quản trị viên phê duyệt, vì đó
// mới là câu trả lời anh cần chứ không phải một chuỗi mã.
function dichLoiMs(ma: string | null, mota: string | null): string {
  const t = `${ma ?? ""} ${mota ?? ""}`;
  if (/AADSTS65001|consent_required|admin/i.test(t)) {
    return "Công ty yêu cầu quản trị viên phê duyệt trước khi ứng dụng ngoài đọc lịch. Anh cần nhờ IT duyệt quyền Calendars.Read cho ứng dụng HPPrio.";
  }
  if (/AADSTS50105|AADSTS50020/i.test(t)) {
    return "Tài khoản này không được phép dùng ứng dụng. Anh kiểm lại đã đăng nhập đúng tài khoản công ty chưa.";
  }
  if (/access_denied/i.test(t)) {
    return "Anh đã bấm từ chối ở màn hình cấp quyền của Microsoft.";
  }
  return (mota ?? ma ?? "Microsoft từ chối cấp quyền").slice(0, 300);
}

function ve(tham: Record<string, string>) {
  const u = new URL("/", process.env.NEXTAUTH_URL);
  for (const [k, v] of Object.entries(tham)) u.searchParams.set(k, v);
  const res = NextResponse.redirect(u);
  // Dọn cookie một lần dùng dù thành công hay thất bại
  res.cookies.set("ms_state", "", { path: "/api/ms", maxAge: 0 });
  res.cookies.set("ms_verifier", "", { path: "/api/ms", maxAge: 0 });
  return res;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const url = new URL(req.url);
  const loi = url.searchParams.get("error");
  if (loi) {
    return ve({ ms: "loi", ghiChu: dichLoiMs(loi, url.searchParams.get("error_description")) });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = req.headers.get("cookie") ?? "";
  const doc = (ten: string) =>
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(ten + "="))
      ?.slice(ten.length + 1);

  const stateLuu = doc("ms_state");
  const verifier = doc("ms_verifier");

  // State phải khớp: chống trường hợp kẻ khác dụ anh bấm vào một đường dẫn
  // callback dựng sẵn để nối lịch của HỌ vào tài khoản của anh.
  if (!code || !state || !stateLuu || state !== stateLuu || !verifier) {
    return ve({ ms: "loi", ghiChu: "Phiên nối tài khoản không hợp lệ hoặc đã quá hạn, anh thử lại giúp em." });
  }

  try {
    const msEmail = await doiMaLayToken(session.user.email, code, verifier);
    return ve({ ms: "ok", ghiChu: msEmail ? `Đã nối lịch ${msEmail}` : "Đã nối lịch Microsoft" });
  } catch (err: any) {
    console.error("MS callback lỗi:", err);
    return ve({ ms: "loi", ghiChu: dichLoiMs(err?.maMs ?? null, err?.moTaMs ?? err?.message ?? null) });
  }
}
