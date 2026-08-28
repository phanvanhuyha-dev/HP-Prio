// Định nghĩa cấu trúc bảng ngay trong code, để app TỰ tạo và TỰ nâng cấp.
//
// Vì sao: trước đây mỗi lần đổi cấu trúc bảng lại phải nhớ chạy tay một file
// SQL trên web. Quên một lần là toàn bộ chức năng ghi chết với lỗi 500, mà
// đường đọc vẫn chạy nên rất khó nhận ra. Đúng chuyện đã xảy ra với cột notes.
//
// Mọi câu lệnh ở đây đều idempotent (IF NOT EXISTS) nên chạy lại bao nhiêu lần
// cũng an toàn, và đều là phép cộng thêm: không xóa cột, không xóa dữ liệu.

export const CAU_LENH_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS tasks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_email TEXT NOT NULL,
     raw_input TEXT NOT NULL,
     title TEXT NOT NULL,
     category TEXT NOT NULL CHECK (category IN ('work', 'personal')),
     deadline TIMESTAMPTZ,
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'archived')),
     notes TEXT,
     ai_urgent BOOLEAN,
     ai_important BOOLEAN,
     ai_category TEXT,
     ai_deadline TIMESTAMPTZ,
     ai_reasoning TEXT,
     user_urgent BOOLEAN NOT NULL,
     user_important BOOLEAN NOT NULL,
     reminder_sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  // Nâng cấp cho bảng tạo từ phiên bản cũ hơn code
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT`,

  `CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_email, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks (deadline)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_reminders ON tasks (status, deadline) WHERE reminder_sent_at IS NULL`,

  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_email TEXT NOT NULL,
     endpoint TEXT NOT NULL UNIQUE,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_email)`
];

// Các cột mà code đang dựa vào. /api/health đối chiếu danh sách này với cấu trúc
// thật, để không còn chuyện health báo khỏe trong khi đường ghi đang chết.
export const COT_BAT_BUOC: Record<string, string[]> = {
  tasks: [
    "id", "user_email", "raw_input", "title", "category", "deadline", "status",
    "notes", "ai_urgent", "ai_important", "ai_category", "ai_deadline",
    "ai_reasoning", "user_urgent", "user_important", "reminder_sent_at",
    "created_at", "updated_at"
  ],
  push_subscriptions: ["id", "user_email", "endpoint", "p256dh", "auth", "created_at"]
};

// Mã lỗi Postgres cho "thiếu bảng" và "thiếu cột".
export function laLoiThieuCauTruc(err: any): boolean {
  const ma = err?.code;
  if (ma === "42P01" || ma === "42703") return true;
  const msg = String(err?.message ?? "");
  return /relation .* does not exist|column .* does not exist/i.test(msg);
}
