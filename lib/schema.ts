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
     status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'archived', 'deleted')),
     notes TEXT,
     deleted_at TIMESTAMPTZ,
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
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,

  // Xóa mềm: thêm trạng thái 'deleted' vào ràng buộc CHECK.
  // Cặp DROP IF EXISTS rồi ADD là idempotent, chạy lại bao nhiêu lần cũng được.
  `ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check`,
  `ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
     CHECK (status IN ('open', 'done', 'archived', 'deleted'))`,

  `CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks (deleted_at) WHERE status = 'deleted'`,

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

  `CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_email)`,

  // Phiên tập trung (deep work). task_title là ảnh chụp tiêu đề tại thời điểm
  // bắt đầu: việc có thể bị xóa mềm rồi dọn hẳn sau 30 ngày, nhưng lịch sử
  // "hôm đó đã tập trung vào việc gì" thì nên giữ nguyên.
  `CREATE TABLE IF NOT EXISTS focus_sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_email TEXT NOT NULL,
     task_id UUID,
     task_title TEXT NOT NULL,
     planned_minutes INT NOT NULL,
     started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     ended_at TIMESTAMPTZ,
     seconds INT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_focus_user_time ON focus_sessions (user_email, started_at)`,

  // Mốc hoàn thành riêng, phục vụ thống kê "xong trong tuần". updated_at không
  // dùng được vì nó đổi mỗi lần sửa lại việc cũ.
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ`,
  // Lấp dữ liệu cho việc đã xong từ trước: xấp xỉ bằng updated_at.
  // WHERE done_at IS NULL nên chạy lại bao nhiêu lần cũng chỉ tác dụng một lần.
  `UPDATE tasks SET done_at = updated_at WHERE status = 'done' AND done_at IS NULL`,

  // Cấu hình người dùng, hiện mới có tên gọi. Lưu máy chủ để đồng bộ mọi
  // thiết bị: từng lưu localStorage và người dùng đặt tên trên web xong mở
  // iPhone vẫn thấy tên cũ.
  `CREATE TABLE IF NOT EXISTS user_settings (
     user_email TEXT PRIMARY KEY,
     ten_goi TEXT,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  // Điểm tin sáng do Bé iu viết, mỗi ngày một bản. Lưu lại để cron gửi push
  // xong thì mở app vẫn đọc được, và ai gọi trước thì người sau dùng bản cache
  // thay vì đốt thêm một lượt AI.
  `CREATE TABLE IF NOT EXISTS daily_briefs (
     user_email TEXT NOT NULL,
     ngay DATE NOT NULL,
     noi_dung TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_email, ngay)
   )`
];

// Các cột mà code đang dựa vào. /api/health đối chiếu danh sách này với cấu trúc
// thật, để không còn chuyện health báo khỏe trong khi đường ghi đang chết.
export const COT_BAT_BUOC: Record<string, string[]> = {
  tasks: [
    "id", "user_email", "raw_input", "title", "category", "deadline", "status",
    "notes", "deleted_at", "done_at", "ai_urgent", "ai_important", "ai_category", "ai_deadline",
    "ai_reasoning", "user_urgent", "user_important", "reminder_sent_at",
    "created_at", "updated_at"
  ],
  push_subscriptions: ["id", "user_email", "endpoint", "p256dh", "auth", "created_at"],
  focus_sessions: [
    "id", "user_email", "task_id", "task_title", "planned_minutes",
    "started_at", "ended_at", "seconds"
  ],
  daily_briefs: ["user_email", "ngay", "noi_dung", "created_at"],
  user_settings: ["user_email", "ten_goi", "updated_at"]
};

// Mã lỗi Postgres cho "thiếu bảng" và "thiếu cột".
export function laLoiThieuCauTruc(err: any): boolean {
  const ma = err?.code;
  if (ma === "42P01" || ma === "42703") return true;
  const msg = String(err?.message ?? "");
  return /relation .* does not exist|column .* does not exist/i.test(msg);
}
