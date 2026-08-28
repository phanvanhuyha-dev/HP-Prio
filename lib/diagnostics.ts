import { NextResponse } from "next/server";

// Tách làm hai tầng thông báo:
//  - nguoiDung: câu hiện trên giao diện. Không chứa lệnh terminal, tên biến
//    môi trường hay hướng dẫn triển khai.
//  - khacPhuc: hướng dẫn kỹ thuật, chỉ ghi vào log máy chủ và trang /api/health
//    (trang này yêu cầu đăng nhập). Đây là chỗ dành cho người quản trị.
export type MoTaLoi = {
  nguoiDung: string;
  khacPhuc?: string;
  ma?: string;
};

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

const CHUA_SAN_SANG =
  "Hệ thống chưa kết nối được kho dữ liệu. Anh mở /api/health để xem chi tiết.";

// Trả lỗi về client: CHỈ gửi câu dành cho người dùng, phần hướng dẫn kỹ thuật
// đẩy vào log máy chủ. Dùng chung để không chỗ nào lỡ tay gửi nhầm khacPhuc.
export function loiJson(mota: MoTaLoi, boiCanh: string, status = 500) {
  console.error(`[${boiCanh}]`, mota.khacPhuc ?? mota.nguoiDung, mota.ma ? `(mã ${mota.ma})` : "");
  return NextResponse.json({ error: mota.nguoiDung }, { status });
}

export function describeDbError(err: any): MoTaLoi {
  const ma = err?.code;
  const msg = messageOf(err);

  if (ma === "missing_connection_string" || /missing_connection_string/i.test(msg)) {
    return {
      ma,
      nguoiDung: CHUA_SAN_SANG,
      khacPhuc:
        "Thiếu POSTGRES_URL/DATABASE_URL. Gắn database vào project trên Vercel (Storage > Connect Store) rồi Redeploy."
    };
  }

  // 42703 = undefined_column. PHẢI kiểm tra TRƯỚC 42P01: thông báo của Postgres
  // khi thiếu cột là 'column "x" of relation "tasks" does not exist', bên trong
  // có chứa cụm 'relation ... does not exist' nên rất dễ bị nhận nhầm thành
  // lỗi thiếu bảng, dẫn tới hướng dẫn sai hoàn toàn.
  if (ma === "42703" || /column .* does not exist/i.test(msg)) {
    const cot = msg.match(/column "([^"]+)"/i)?.[1];
    return {
      ma,
      nguoiDung: CHUA_SAN_SANG,
      khacPhuc: `Bảng thiếu cột${cot ? ` "${cot}"` : ""}. Cấu trúc bảng cũ hơn code. Chạy lại scripts/schema-oneshot.sql để cập nhật.`
    };
  }

  // 42P01 = undefined_table. Neo đầu chuỗi để không nuốt lỗi thiếu cột ở trên.
  if (ma === "42P01" || /^relation .* does not exist/i.test(msg)) {
    return {
      ma,
      nguoiDung: CHUA_SAN_SANG,
      khacPhuc: "Chưa có bảng. Chạy scripts/schema-oneshot.sql trong trình soạn thảo SQL của database."
    };
  }

  if (ma === "3D000") {
    return { ma, nguoiDung: CHUA_SAN_SANG, khacPhuc: "Không tìm thấy database. Kiểm tra lại chuỗi kết nối." };
  }
  if (ma === "28P01") {
    return { ma, nguoiDung: CHUA_SAN_SANG, khacPhuc: "Sai thông tin đăng nhập database. Tạo lại kết nối." };
  }
  if (ma === "ECONNREFUSED" || ma === "ENOTFOUND" || ma === "ETIMEDOUT") {
    return { ma, nguoiDung: CHUA_SAN_SANG, khacPhuc: "Không kết nối được tới máy chủ database." };
  }

  // 23514 = check_violation, 23502 = not_null_violation: dữ liệu gửi lên sai,
  // đây là lỗi người dùng sửa được chứ không phải sự cố hệ thống.
  if (ma === "23514" || ma === "23502") {
    return { ma, nguoiDung: "Dữ liệu chưa hợp lệ, anh kiểm tra lại các trường rồi lưu lần nữa." };
  }
  if (ma === "22001") {
    return { ma, nguoiDung: "Nội dung quá dài, anh rút gọn bớt giúp." };
  }

  return {
    ma,
    nguoiDung: "Không lưu được lúc này, anh thử lại. Nếu vẫn lỗi, mở /api/health để xem chi tiết.",
    khacPhuc: `Lỗi database${ma ? ` (mã ${ma})` : ""}: ${msg}`
  };
}

export function describeGeminiError(err: any): MoTaLoi {
  const msg = messageOf(err);
  const status: number | undefined =
    err?.status ?? (msg.match(/\[(\d{3})\s/)?.[1] ? Number(msg.match(/\[(\d{3})\s/)![1]) : undefined);

  if (err?.name === "AbortError" || /aborted|timeout/i.test(msg)) {
    return { nguoiDung: "AI phản hồi quá lâu nên đã dừng. Anh thử lại, hoặc nhập tay các trường bên dưới." };
  }
  if (/Thiếu GEMINI_API_KEY/.test(msg)) {
    return {
      nguoiDung: "Tính năng AI chưa sẵn sàng. Anh nhập tay các trường bên dưới.",
      khacPhuc: "Chưa cấu hình GEMINI_API_KEY. Lấy key tại aistudio.google.com/app/apikey rồi Redeploy."
    };
  }
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) {
    return {
      nguoiDung: "Tính năng AI chưa sẵn sàng. Anh nhập tay các trường bên dưới.",
      khacPhuc: "GEMINI_API_KEY không hợp lệ."
    };
  }
  if (status === 404 || /is not found for API version|models\/.* not found/i.test(msg)) {
    const ghim = process.env.GEMINI_MODEL?.trim();
    return {
      nguoiDung: "Tính năng AI chưa sẵn sàng. Anh nhập tay các trường bên dưới.",
      khacPhuc: ghim
        ? `API key không dùng được model "${ghim}" đang ghim ở GEMINI_MODEL. Xóa biến này để app tự chọn.`
        : "API key không dùng được model nào phù hợp."
    };
  }
  if (status === 403) {
    return { nguoiDung: "Tính năng AI chưa sẵn sàng.", khacPhuc: "API key bị từ chối quyền truy cập Gemini." };
  }
  if (status === 429) {
    return { nguoiDung: "AI đang quá tải, anh chờ một lát rồi thử lại." };
  }
  if (status === 503 || status === 500) {
    return { nguoiDung: "Máy chủ AI đang bận, anh thử lại sau ít phút." };
  }
  if (err instanceof SyntaxError || /JSON/i.test(msg)) {
    return { nguoiDung: "AI trả về dữ liệu không đọc được. Anh thử rút gọn câu nhập rồi bấm lại." };
  }

  return {
    nguoiDung: "Không phân tích được lúc này. Anh nhập tay các trường bên dưới.",
    khacPhuc: `Gọi Gemini thất bại${status ? ` (HTTP ${status})` : ""}: ${msg}`
  };
}
