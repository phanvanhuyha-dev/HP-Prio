import { sql } from "@vercel/postgres";
import { CAU_LENH_SCHEMA, COT_BAT_BUOC, laLoiThieuCauTruc } from "./schema";

// Tích hợp Neon trên Vercel có khi chỉ đặt DATABASE_URL, trong khi @vercel/postgres
// chỉ tìm đúng POSTGRES_URL rồi báo 'missing_connection_string'. Bắc cầu sang để
// khỏi phải thêm biến thủ công.
// Chỗ này chạy sau lệnh import (ESM luôn nâng import lên trước) nhưng vẫn kịp,
// vì sql là proxy chỉ đọc chuỗi kết nối ở lần gọi truy vấn đầu tiên.
if (!process.env.POSTGRES_URL?.trim()) {
  const duPhong =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (duPhong?.trim()) process.env.POSTGRES_URL = duPhong.trim();
}

export type Task = {
  id: string;
  user_email: string;
  raw_input: string;
  title: string;
  category: "work" | "personal";
  deadline: string | null;
  status: "open" | "done" | "archived" | "deleted";
  // Ghi chú chi tiết: đường link, tài liệu, các bước cần làm
  notes: string | null;
  deleted_at: string | null;
  ai_urgent: boolean | null;
  ai_important: boolean | null;
  ai_category: string | null;
  ai_deadline: string | null;
  ai_reasoning: string | null;
  user_urgent: boolean;
  user_important: boolean;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

// --- Tự tạo và tự nâng cấp cấu trúc bảng ---------------------------------
// Bắt lỗi thiếu bảng/thiếu cột, chạy schema rồi thử lại đúng MỘT lần. Nhờ vậy
// đổi cấu trúc bảng không còn phải nhớ chạy tay file SQL trên web nữa.
let daChaySchema = false;
let dangChaySchema: Promise<void> | null = null;

export async function damBaoSchema(): Promise<void> {
  if (daChaySchema) return;
  // Nhiều request cùng lúc chỉ chạy một lượt
  if (!dangChaySchema) {
    dangChaySchema = (async () => {
      for (const cau of CAU_LENH_SCHEMA) {
        await sql.query(cau);
      }
      daChaySchema = true;
      console.log("[HPPrio] Đã kiểm tra và cập nhật cấu trúc bảng.");
    })().finally(() => {
      dangChaySchema = null;
    });
  }
  return dangChaySchema;
}

async function chayVaTuSua<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!laLoiThieuCauTruc(err)) throw err;
    console.warn("[HPPrio] Cấu trúc bảng cũ hơn code, đang tự cập nhật rồi thử lại.");
    await damBaoSchema();
    return await fn();
  }
}

export const TASK_CATEGORIES = ["work", "personal"] as const;
export const TASK_STATUSES = ["open", "done", "archived", "deleted"] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isValidCategory(value: unknown): value is TaskCategory {
  return typeof value === "string" && (TASK_CATEGORIES as readonly string[]).includes(value);
}

export function isValidStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

// Cột id là UUID. Nếu truyền chuỗi không đúng định dạng, Postgres sẽ ném lỗi
// "invalid input syntax for type uuid" và trả về 500 thay vì 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Chuẩn hóa deadline về ISO 8601. Trả null nếu không phải ngày hợp lệ,
// tránh việc chèn chuỗi rác vào cột TIMESTAMPTZ và làm route chết.
export function normalizeDeadline(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Chỉ nhận deadline quanh thời điểm hiện tại. Khoảng 2000-2100 trước đây quá rộng:
  // chuỗi rác kiểu "5" được new Date() hiểu thành tháng 5/2001 và vẫn lọt qua.
  const year = parsed.getUTCFullYear();
  const nowYear = new Date().getUTCFullYear();
  if (year < nowYear - 1 || year > nowYear + 10) return null;
  return parsed.toISOString();
}

export async function listTasks(userEmail: string, status: TaskStatus = "open") {
  return chayVaTuSua(async () => {
    const { rows } = await sql<Task>`
      SELECT * FROM tasks
      WHERE user_email = ${userEmail} AND status = ${status}
      ORDER BY
        (user_urgent AND user_important) DESC,
        deadline ASC NULLS LAST,
        created_at DESC
    `;
    return rows;
  });
}

export async function createTask(data: {
  userEmail: string;
  rawInput: string;
  title: string;
  category: string;
  deadline: string | null;
  notes: string | null;
  aiUrgent: boolean | null;
  aiImportant: boolean | null;
  aiCategory: string | null;
  aiDeadline: string | null;
  aiReasoning: string | null;
  userUrgent: boolean;
  userImportant: boolean;
}) {
  return chayVaTuSua(async () => {
    const { rows } = await sql<Task>`
      INSERT INTO tasks (
        user_email, raw_input, title, category, deadline, notes,
        ai_urgent, ai_important, ai_category, ai_deadline, ai_reasoning,
        user_urgent, user_important
      ) VALUES (
        ${data.userEmail}, ${data.rawInput}, ${data.title}, ${data.category}, ${data.deadline}, ${data.notes},
        ${data.aiUrgent}, ${data.aiImportant}, ${data.aiCategory}, ${data.aiDeadline}, ${data.aiReasoning},
        ${data.userUrgent}, ${data.userImportant}
      )
      RETURNING *
    `;
    return rows[0];
  });
}

export async function updateTaskStatus(id: string, userEmail: string, status: TaskStatus) {
  return chayVaTuSua(async () => {
    const { rows } = await sql<Task>`
      UPDATE tasks SET status = ${status}, updated_at = now()
      WHERE id = ${id} AND user_email = ${userEmail}
      RETURNING *
    `;
    return rows[0] ?? null;
  });
}

export async function updateTask(
  id: string,
  userEmail: string,
  data: {
    title?: string;
    category?: string;
    // undefined = không đụng tới, null = xóa deadline
    deadline?: string | null;
    // undefined = không đụng tới, chuỗi rỗng hoặc null = xóa ghi chú
    notes?: string | null;
    userUrgent?: boolean;
    userImportant?: boolean;
  }
) {
  // COALESCE(${null}, deadline) luôn giữ nguyên giá trị cũ, nên trước đây
  // không thể xóa một deadline đã đặt. Dùng cờ riêng để phân biệt rõ
  // "không gửi trường này" với "gửi null để xóa".
  const clearDeadline = data.deadline === null;
  const nextDeadline = clearDeadline ? null : normalizeDeadline(data.deadline);

  // Ghi chú cũng cần phân biệt như vậy, và chuỗi rỗng nghĩa là xóa trắng.
  const suaNotes = data.notes !== undefined;
  const nextNotes = data.notes?.trim() ? data.notes : null;

  return chayVaTuSua(async () => {
  const { rows } = await sql<Task>`
    UPDATE tasks SET
      title = COALESCE(${data.title ?? null}::text, title),
      category = COALESCE(${data.category ?? null}::text, category),
      deadline = CASE
        WHEN ${clearDeadline}::boolean THEN NULL
        ELSE COALESCE(${nextDeadline}::timestamptz, deadline)
      END,
      notes = CASE WHEN ${suaNotes}::boolean THEN ${nextNotes}::text ELSE notes END,
      user_urgent = COALESCE(${data.userUrgent ?? null}::boolean, user_urgent),
      user_important = COALESCE(${data.userImportant ?? null}::boolean, user_important),
      updated_at = now()
    WHERE id = ${id} AND user_email = ${userEmail}
    RETURNING *
  `;
  return rows[0] ?? null;
  });
}

// XÓA MỀM. Đây là con đường mất dữ liệu duy nhất còn lại của app, nên không
// xóa thật: chỉ đổi trạng thái và ghi mốc thời gian. Bấm nhầm vẫn lấy lại được
// kể cả sau khi đã đóng trình duyệt.
export async function deleteTask(id: string, userEmail: string) {
  return chayVaTuSua(async () => {
    const { rowCount } = await sql`
      UPDATE tasks
      SET status = 'deleted', deleted_at = now(), updated_at = now()
      WHERE id = ${id} AND user_email = ${userEmail} AND status <> 'deleted'
    `;
    return (rowCount ?? 0) > 0;
  });
}

// Khôi phục việc đã xóa mềm.
export async function restoreTask(id: string, userEmail: string) {
  return chayVaTuSua(async () => {
    const { rows } = await sql<Task>`
      UPDATE tasks
      SET status = 'open', deleted_at = NULL, updated_at = now()
      WHERE id = ${id} AND user_email = ${userEmail}
      RETURNING *
    `;
    return rows[0] ?? null;
  });
}

// Xóa hẳn MỘT việc khỏi database. Chỉ cho phép với việc đã nằm trong thùng rác,
// để không bao giờ có đường xóa thẳng một việc đang mở chỉ bằng một lần bấm.
export async function hardDeleteTask(id: string, userEmail: string) {
  return chayVaTuSua(async () => {
    const { rowCount } = await sql`
      DELETE FROM tasks
      WHERE id = ${id} AND user_email = ${userEmail} AND status = 'deleted'
    `;
    return (rowCount ?? 0) > 0;
  });
}

// Dọn sạch thùng rác của một người dùng.
export async function emptyTrash(userEmail: string) {
  return chayVaTuSua(async () => {
    const { rowCount } = await sql`
      DELETE FROM tasks WHERE user_email = ${userEmail} AND status = 'deleted'
    `;
    return rowCount ?? 0;
  });
}

export async function listDeletedTasks(userEmail: string) {
  return chayVaTuSua(async () => {
    const { rows } = await sql<Task>`
      SELECT * FROM tasks
      WHERE user_email = ${userEmail} AND status = 'deleted'
      ORDER BY deleted_at DESC
    `;
    return rows;
  });
}

// Dọn hẳn các việc đã xóa quá 30 ngày. Cron gọi mỗi ngày.
export async function purgeOldDeleted(soNgay = 30) {
  return chayVaTuSua(async () => {
    const { rowCount } = await sql`
      DELETE FROM tasks
      WHERE status = 'deleted'
        AND deleted_at IS NOT NULL
        AND deleted_at < now() - (${soNgay} * interval '1 day')
    `;
    return rowCount ?? 0;
  });
}

export async function getUpcomingForReminders() {
  // Việc có deadline trong 24h tới HOẶC vừa quá hạn trong 48h qua, chưa nhắc, chưa xong.
  // Khoảng lùi 48h để cron chạy 1 lần/ngày (gói Hobby) không bỏ sót việc
  // có deadline rơi vào giữa hai lần chạy.
  const { rows } = await sql<Task>`
    SELECT * FROM tasks
    WHERE status = 'open'
      AND deadline IS NOT NULL
      AND deadline <= now() + interval '24 hours'
      AND deadline >= now() - interval '48 hours'
      AND reminder_sent_at IS NULL
    ORDER BY deadline ASC
  `;
  return rows;
}

export async function markReminderSent(id: string) {
  await sql`UPDATE tasks SET reminder_sent_at = now() WHERE id = ${id}`;
}

export type StoredPushSubscription = {
  id: string;
  user_email: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export async function savePushSubscription(userEmail: string, sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  await sql`
    INSERT INTO push_subscriptions (user_email, endpoint, p256dh, auth)
    VALUES (${userEmail}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE
      SET p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_email = EXCLUDED.user_email
  `;
}

export async function getPushSubscriptions(userEmail: string) {
  const { rows } = await sql<StoredPushSubscription>`
    SELECT * FROM push_subscriptions WHERE user_email = ${userEmail}
  `;
  return rows;
}

export async function deletePushSubscription(endpoint: string) {
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

// Dùng cho /api/health. Đặt ở đây (thay vì gọi sql thẳng trong route) để đoạn
// bắc cầu DATABASE_URL phía trên chắc chắn được chạy trước.
// Dùng cho /api/health. Kiểm tra tới TỪNG CỘT chứ không chỉ sự tồn tại của bảng:
// trước đây health báo khỏe trong khi đường ghi đang chết vì thiếu cột notes.
export async function checkSchema() {
  const { rows } = await sql<{ bang: string; cot: string }>`
    SELECT table_name AS bang, column_name AS cot
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('tasks', 'push_subscriptions')
  `;

  const thucTe: Record<string, string[]> = {};
  for (const r of rows) (thucTe[r.bang] ??= []).push(r.cot);

  const thieu: string[] = [];
  for (const [bang, cots] of Object.entries(COT_BAT_BUOC)) {
    if (!thucTe[bang]) {
      thieu.push(`bảng ${bang}`);
      continue;
    }
    for (const c of cots) if (!thucTe[bang].includes(c)) thieu.push(`${bang}.${c}`);
  }

  return {
    tasks: Boolean(thucTe["tasks"]),
    push_subscriptions: Boolean(thucTe["push_subscriptions"]),
    thieu
  };
}
