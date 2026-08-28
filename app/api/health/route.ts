import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@vercel/postgres";
import { authOptions } from "@/lib/auth";
import { describeDbError, describeGeminiError } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

// Trang chẩn đoán cấu hình. Chỉ chủ tài khoản xem được, và KHÔNG BAO GIỜ
// trả về giá trị của biến bí mật, chỉ trả về có/không.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const co = (name: string) => Boolean(process.env[name]?.trim());

  const bienMoiTruong = {
    POSTGRES_URL: co("POSTGRES_URL"),
    GOOGLE_CLIENT_ID: co("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: co("GOOGLE_CLIENT_SECRET"),
    OWNER_EMAIL: co("OWNER_EMAIL"),
    NEXTAUTH_SECRET: co("NEXTAUTH_SECRET"),
    GEMINI_API_KEY: co("GEMINI_API_KEY"),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: co("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    VAPID_PRIVATE_KEY: co("VAPID_PRIVATE_KEY"),
    CRON_SECRET: co("CRON_SECRET")
  };

  // Hai giá trị này không phải bí mật nên hiện thẳng để đối chiếu cho nhanh.
  const cauHinh = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash (mặc định)"
  };

  // --- Database ---
  let database: Record<string, unknown>;
  try {
    const { rows } = await sql<{ ten: string }>`
      SELECT table_name AS ten FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('tasks', 'push_subscriptions')
    `;
    const bang = rows.map((r) => r.ten);
    database = {
      ketNoi: true,
      bangTasks: bang.includes("tasks"),
      bangPushSubscriptions: bang.includes("push_subscriptions"),
      ...(bang.length < 2
        ? { canLam: "Thiếu bảng. Chạy: vercel env pull .env.local rồi npm run db:init" }
        : {})
    };
  } catch (err) {
    database = { ketNoi: false, loi: describeDbError(err) };
  }

  // --- Gemini ---
  let gemini: Record<string, unknown>;
  if (!bienMoiTruong.GEMINI_API_KEY) {
    gemini = { hoatDong: false, loi: "Chưa cấu hình GEMINI_API_KEY." };
  } else {
    try {
      // Gọi thử một câu cực ngắn để xác nhận key và model dùng được.
      const { parseTaskInput } = await import("@/lib/gemini");
      await parseTaskInput("kiểm tra hệ thống");
      gemini = { hoatDong: true };
    } catch (err) {
      gemini = { hoatDong: false, loi: describeGeminiError(err) };
    }
  }

  const sanSang =
    Object.values(bienMoiTruong).every(Boolean) &&
    database.ketNoi === true &&
    database.bangTasks === true &&
    database.bangPushSubscriptions === true &&
    gemini.hoatDong === true;

  return NextResponse.json({ sanSang, bienMoiTruong, cauHinh, database, gemini }, { status: 200 });
}
