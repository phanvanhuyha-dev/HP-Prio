// Dịch lỗi kỹ thuật thành câu tiếng Việt nói rõ phải sửa ở đâu.
// Thông báo chung chung kiểu "thử lại sau" khiến người dùng phải đi mò log Vercel.

// Chuỗi kết nối và API key hay lẫn trong thông báo lỗi của thư viện.
// Che lại trước khi đưa ra giao diện hoặc ghi log.
export function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://***")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza***")
    .replace(/GOCSPX-[0-9A-Za-z_-]+/g, "GOCSPX-***")
    .replace(/\/\/[^\s/@]+:[^\s/@]+@/g, "//***:***@");
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return redact(err.message);
  return redact(String(err));
}

export function describeDbError(err: any): string {
  const code = err?.code;
  const msg = messageOf(err);

  // @vercel/postgres ném lỗi này khi không tìm thấy POSTGRES_URL
  if (code === "missing_connection_string" || /missing_connection_string/i.test(msg)) {
    return "Chưa kết nối database. Trên Vercel, vào tab Storage tạo Postgres rồi Redeploy.";
  }
  // 42P01 = undefined_table
  if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
    return "Database đã kết nối nhưng chưa có bảng. Chạy: vercel env pull .env.local rồi npm run db:init";
  }
  // 3D000 = invalid_catalog_name
  if (code === "3D000") return "Không tìm thấy database. Kiểm tra lại POSTGRES_URL trên Vercel.";
  // 28P01 = invalid_password
  if (code === "28P01") return "Sai thông tin đăng nhập database. Tạo lại kết nối Postgres trên Vercel.";
  if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return "Không kết nối được tới máy chủ database.";
  }

  return `Lỗi database${code ? ` (mã ${code})` : ""}: ${msg}`;
}

export function describeGeminiError(err: any): string {
  const msg = messageOf(err);
  // GoogleGenerativeAIFetchError gắn status; nếu không có thì dò trong thông báo.
  const status: number | undefined =
    err?.status ?? (msg.match(/\[(\d{3})\s/)?.[1] ? Number(msg.match(/\[(\d{3})\s/)![1]) : undefined);

  if (/Thiếu GEMINI_API_KEY/.test(msg)) {
    return "Chưa cấu hình GEMINI_API_KEY trên Vercel. Lấy key tại aistudio.google.com/app/apikey rồi Redeploy.";
  }
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) {
    return "GEMINI_API_KEY không hợp lệ. Kiểm tra lại key đã dán trên Vercel.";
  }
  if (status === 404 || /is not found for API version|models\/.* not found/i.test(msg)) {
    // App tự dò model thay thế, nên tới được đây nghĩa là không còn model nào
    // dùng được, hoặc người dùng đã tự ghim GEMINI_MODEL vào một tên sai.
    const ghim = process.env.GEMINI_MODEL?.trim();
    return ghim
      ? `API key không dùng được model "${ghim}" mà anh đã ghim trong biến GEMINI_MODEL. Xóa biến này đi để app tự chọn model.`
      : "API key không dùng được model nào phù hợp. Kiểm tra lại key trên aistudio.google.com.";
  }
  if (status === 403) return "API key bị từ chối quyền truy cập Gemini. Kiểm tra lại key và project trên Google.";
  if (status === 429) return "Đã vượt hạn mức gọi Gemini. Chờ một lát rồi thử lại.";
  if (err instanceof SyntaxError || /JSON/i.test(msg)) {
    return "AI trả về dữ liệu không đọc được. Anh thử rút gọn câu nhập rồi bấm lại.";
  }

  return `Gọi Gemini thất bại${status ? ` (HTTP ${status})` : ""}: ${msg}`;
}
