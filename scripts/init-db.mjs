// Chạy: npm run db:init
// Đọc scripts/schema.sql và thực thi lên Vercel Postgres (dùng biến môi trường POSTGRES_URL)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { sql } from "@vercel/postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  // gen_random_uuid() cần extension pgcrypto
  await sql.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  const statements = schema.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await sql.query(stmt + ";");
    console.log("OK:", stmt.slice(0, 60).replace(/\n/g, " ") + "...");
  }
  console.log("\n✅ Database HPPrio đã khởi tạo xong.");
}

main().catch((err) => {
  console.error("❌ Lỗi khởi tạo database:", err);
  process.exit(1);
});
