import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cauHinhMs, taoPkce, urlDangNhap } from "@/lib/ms-lich";

export const dynamic = "force-dynamic";

// Bắt đầu nối tài khoản Microsoft để đọc lịch. Chỉ xin quyền Calendars.Read.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }
  if (!cauHinhMs()) {
    return NextResponse.redirect(
      new URL("/?ms=loi&ghiChu=" + encodeURIComponent("Máy chủ chưa cấu hình MS_CLIENT_ID và MS_CLIENT_SECRET"), process.env.NEXTAUTH_URL)
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const { verifier, challenge } = taoPkce();

  const res = NextResponse.redirect(urlDangNhap(state, challenge));
  const chung = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // lax để cookie còn sống khi Microsoft chuyển hướng người dùng quay lại
    sameSite: "lax" as const,
    path: "/api/ms",
    maxAge: 600
  };
  res.cookies.set("ms_state", state, chung);
  res.cookies.set("ms_verifier", verifier, chung);
  return res;
}
