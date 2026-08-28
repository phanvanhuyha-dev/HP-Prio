// Chạy: npm run db:init (script đã kèm --env-file=.env.local để nạp POSTGRES_URL,
// vì Node chạy trực tiếp không tự đọc .env.local như Next.js)
// Đọc scripts/schema.sql và thực thi lên database.
//
// Không có chuỗi kết nối ở máy thì có cách nhanh hơn: dán scripts/schema-oneshot.sql
// vào trình soạn thảo SQL trên web. Chạy lệnh này khi thiếu biến sẽ in hướng dẫn.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// Giống lib/db.ts: tích hợp Neon có khi chỉ đặt DATABASE_URL, trong khi
// @vercel/postgres chỉ tìm đúng POSTGRES_URL.
if (!process.env.POSTGRES_URL?.trim()) {
  const duPhong =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (duPhong?.trim()) process.env.POSTGRES_URL = duPhong.trim();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function huongDanThieuKetNoi() {
  console.error(`
❌ Không tìm thấy chuỗi kết nối database.

File .env.local ở máy anh chưa có POSTGRES_URL (hoặc DATABASE_URL).
Biến điền trên Vercel KHÔNG tự về máy, phải kéo về hoặc dán tay.

Có 2 cách, chọn 1:

  CÁCH A (nhanh nhất, không cần cài gì)
    Bỏ qua lệnh này. Mở trình soạn thảo SQL trên web:
      Neon Console > Query   hoặc   Vercel > Storage > Query
    Tắt công tắc "Read-only", rồi dán toàn bộ nội dung file:
      scripts/schema-oneshot.sql
    Bấm Run là xong. Chạy lại nhiều lần cũng an toàn.

  CÁCH B (nếu muốn chạy được từ máy về sau)
    Lấy chuỗi kết nối ở Neon Console > Connect, hoặc
    Vercel > Storage > (database) > tab .env.local
    Dán vào dòng POSTGRES_URL= trong .env.local rồi chạy lại lệnh này.

    Hoặc kéo toàn bộ biến về bằng Vercel CLI:
      npm i -g vercel
      vercel login
      vercel link
      vercel env pull .env.local
    Lưu ý: lệnh pull GHI ĐÈ .env.local, sao lưu trước nếu cần.
`);
}

async function main() {
  if (!process.env.POSTGRES_URL?.trim()) {
    huongDanThieuKetNoi();
    process.exit(1);
  }

  const { sql } = await import("@vercel/postgres");
  const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

  // gen_random_uuid() đã có sẵn từ Postgres 13 nên extension này không bắt buộc.
  // Một số dịch vụ không cho tạo extension, lỗi ở đây không nên chặn cả script.
  try {
    await sql.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  } catch {
    console.log("Bỏ qua pgcrypto (không bắt buộc).");
  }

  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await sql.query(stmt + ";");
    const nhan = stmt
      .split("\n")
      .find((l) => l.trim() && !l.trim().startsWith("--"))
      ?.slice(0, 62);
    console.log("OK:", nhan);
  }

  console.log("\n✅ Database HPPrio đã khởi tạo xong.");
}

main().catch((err) => {
  if (err?.code === "missing_connection_string") {
    huongDanThieuKetNoi();
  } else {
    console.error("❌ Lỗi khởi tạo database:", err?.message ?? err);
    if (err?.code) console.error("   Mã lỗi:", err.code);
  }
  process.exit(1);
});
