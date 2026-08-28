import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// Nhập từ lib/db (không gọi sql thẳng) để đoạn bắc cầu DATABASE_URL trong đó
// được chạy trước. Gọi sql trực tiếp sẽ báo thiếu kết nối dù app vẫn chạy được.
import { checkTables } from "@/lib/db";
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
    // Cần ít nhất một trong hai biến này thì mới kết nối được database
    POSTGRES_URL: co("POSTGRES_URL"),
    DATABASE_URL: co("DATABASE_URL"),
    GOOGLE_CLIENT_ID: co("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: co("GOOGLE_CLIENT_SECRET"),
    OWNER_EMAIL: co("OWNER_EMAIL"),
    NEXTAUTH_SECRET: co("NEXTAUTH_SECRET"),
    GEMINI_API_KEY: co("GEMINI_API_KEY"),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: co("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    VAPID_PRIVATE_KEY: co("VAPID_PRIVATE_KEY"),
    CRON_SECRET: co("CRON_SECRET")
  };

  const cauHinh = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash (mặc định)",
    // Biết chắc bản deploy đang chạy là commit nào, khỏi đoán code đã lên chưa
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "không rõ"
  };

  // --- Database ---
  let database: Record<string, unknown>;
  try {
    const bang = await checkTables();
    database = {
      ketNoi: true,
      bangTasks: bang.tasks,
      bangPushSubscriptions: bang.push_subscriptions,
      ...(bang.tasks && bang.push_subscriptions
        ? {}
        : { canLam: "Thiếu bảng. Dán scripts/schema-oneshot.sql vào trình soạn thảo SQL rồi Run." })
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
      const { parseTaskInput } = await import("@/lib/gemini");
      await parseTaskInput("kiểm tra hệ thống");
      gemini = { hoatDong: true };
    } catch (err) {
      gemini = { hoatDong: false, loi: describeGeminiError(err) };
      // Model hiện tại không chạy thì hỏi luôn Google xem key này dùng được model nào,
      // để khỏi phải đoán mò tên model qua nhiều lần deploy.
      try {
        const { listAvailableModels } = await import("@/lib/gemini");
        const ds = await listAvailableModels();
        gemini.modelDungDuoc = ds.length ? ds : "API key không thấy model nào";
        gemini.goiY = ds.length
          ? `Đặt biến GEMINI_MODEL trên Vercel thành một tên trong danh sách trên, ví dụ "${
              ds.find((m) => /2\.5-flash$|2\.0-flash$/.test(m)) ?? ds[0]
            }", rồi Redeploy.`
          : undefined;
      } catch (e2) {
        gemini.khongLietKeDuocModel = describeGeminiError(e2);
      }
    }
  }

  const sanSang =
    (bienMoiTruong.POSTGRES_URL || bienMoiTruong.DATABASE_URL) &&
    bienMoiTruong.GOOGLE_CLIENT_ID &&
    bienMoiTruong.GOOGLE_CLIENT_SECRET &&
    bienMoiTruong.OWNER_EMAIL &&
    bienMoiTruong.NEXTAUTH_SECRET &&
    bienMoiTruong.GEMINI_API_KEY &&
    bienMoiTruong.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    bienMoiTruong.VAPID_PRIVATE_KEY &&
    bienMoiTruong.CRON_SECRET &&
    database.ketNoi === true &&
    database.bangTasks === true &&
    database.bangPushSubscriptions === true &&
    gemini.hoatDong === true;

  return NextResponse.json({ sanSang, bienMoiTruong, cauHinh, database, gemini }, { status: 200 });
}
