-- HPPrio database schema (Vercel Postgres)

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('work', 'personal')),
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'archived')),

  -- Ghi chú chi tiết: đường link, tài liệu, các bước cần làm
  notes TEXT,

  -- AI's original suggestion (kept forever, never overwritten)
  ai_urgent BOOLEAN,
  ai_important BOOLEAN,
  ai_category TEXT,
  ai_deadline TIMESTAMPTZ,
  ai_reasoning TEXT,

  -- What the user actually confirmed (may differ from AI's suggestion)
  user_urgent BOOLEAN NOT NULL,
  user_important BOOLEAN NOT NULL,

  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nâng cấp cho database tạo trước khi có cột notes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_email, status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks (deadline);

-- Cron quét theo (status, deadline, reminder_sent_at) mỗi lần chạy
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
