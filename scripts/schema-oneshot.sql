-- Bản gộp của schema.sql thành MỘT lệnh duy nhất, để dán vào trình soạn thảo
-- SQL trên web (Neon Console, Vercel Storage > Query).
--
-- Vì sao cần bản này: các trình soạn thảo đó gửi câu lệnh qua prepared statement,
-- chỉ nhận đúng một lệnh. Dán nhiều lệnh cách nhau bằng dấu ";" sẽ báo lỗi
-- "cannot insert multiple commands into a prepared statement".
-- Bọc trong khối DO $$ ... $$ thì cả cụm được tính là một lệnh.
--
-- Chạy lại nhiều lần vẫn an toàn, mọi lệnh đều có IF NOT EXISTS.
-- Nhớ TẮT công tắc "Read-only" của trình soạn thảo trước khi bấm Run.
--
-- Không cần CREATE EXTENSION pgcrypto: gen_random_uuid() đã có sẵn từ Postgres 13,
-- mà Neon thì chạy phiên bản mới hơn nhiều.
--
-- LƯU Ý CHO NGƯỜI SỬA SAU: file này phải khớp với schema.sql. Sửa một bên thì
-- sửa cả bên kia.

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS tasks (
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
  );

  -- Nâng cấp cho database tạo trước khi có cột notes. Chạy lại file này là đủ.
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;

  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_email, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks (deadline);
  CREATE INDEX IF NOT EXISTS idx_tasks_reminders ON tasks (status, deadline) WHERE reminder_sent_at IS NULL;

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_email);
END
$$;
