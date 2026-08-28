"use client";
import { useState } from "react";
import Linkify from "./Linkify";

export type Task = {
  id: string;
  title: string;
  category: "work" | "personal";
  deadline: string | null;
  notes: string | null;
  user_urgent: boolean;
  user_important: boolean;
};

type ReclassifyPatch = { userUrgent?: boolean; userImportant?: boolean; notes?: string | null };

const QUADRANTS = [
  { key: "do", label: "Làm ngay", sub: "khẩn cấp + quan trọng", color: "var(--coral)", urgent: true, important: true },
  { key: "schedule", label: "Lên lịch", sub: "quan trọng, chưa gấp", color: "var(--teal)", urgent: false, important: true },
  { key: "delegate", label: "Giao bớt", sub: "gấp, không cốt lõi", color: "var(--amber)", urgent: true, important: false },
  { key: "drop", label: "Cân nhắc bỏ", sub: "không gấp, không quan trọng", color: "var(--slate)", urgent: false, important: false }
] as const;

export default function QuadrantBoard({
  tasks,
  onDone,
  onDelete,
  onReclassify
}: {
  tasks: Task[];
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onReclassify: (id: string, patch: ReclassifyPatch) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--slate)" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--cream)" }}>Chưa có việc nào.</p>
        <p>Nhập việc đầu tiên ở ô phía trên.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {QUADRANTS.map((q) => {
        const items = tasks.filter((t) => t.user_urgent === q.urgent && t.user_important === q.important);
        return (
          <div
            key={q.key}
            style={{
              background: "var(--navy-2)",
              border: `1px solid var(--line)`,
              borderTop: `3px solid ${q.color}`,
              borderRadius: 14,
              padding: 14,
              minHeight: 160
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--cream)" }}>
                {q.label}
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--slate)", textTransform: "uppercase" }}>
                {q.sub} · {items.length}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDone={onDone}
                  onDelete={onDelete}
                  onReclassify={onReclassify}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({
  task,
  onDone,
  onDelete,
  onReclassify
}: {
  task: Task;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onReclassify: (id: string, patch: ReclassifyPatch) => void;
}) {
  const overdue = task.deadline ? new Date(task.deadline) < new Date() : false;
  const [moRong, setMoRong] = useState(false);
  const [dangSua, setDangSua] = useState(false);
  const [nhap, setNhap] = useState(task.notes ?? "");

  function confirmDelete() {
    if (window.confirm(`Xóa hẳn việc “${task.title}”?`)) onDelete(task.id);
  }

  function luuGhiChu() {
    onReclassify(task.id, { notes: nhap.trim() || null });
    setDangSua(false);
    setMoRong(true);
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 10,
        padding: "9px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 13.5, color: "var(--cream)", lineHeight: 1.3 }}>{task.title}</span>
        <button
          onClick={() => onDone(task.id)}
          title="Đánh dấu xong"
          aria-label={`Đánh dấu xong: ${task.title}`}
          style={{ background: "none", border: "none", color: "var(--teal)", fontSize: 16, flexShrink: 0, padding: 0 }}
        >
          ✓
        </button>
      </div>

      {/* Cho phép sửa lại phân loại nếu AI đoán sai hoặc mức ưu tiên thay đổi */}
      <div style={{ display: "flex", gap: 6 }}>
        <MiniToggle
          label="Khẩn"
          active={task.user_urgent}
          color="var(--coral)"
          onClick={() => onReclassify(task.id, { userUrgent: !task.user_urgent })}
        />
        <MiniToggle
          label="Quan trọng"
          active={task.user_important}
          color="var(--teal)"
          onClick={() => onReclassify(task.id, { userImportant: !task.user_important })}
        />
      </div>

      {dangSua ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={nhap}
            onChange={(e) => setNhap(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Đường link, tài liệu, các bước cần làm..."
            style={{
              width: "100%",
              background: "var(--field)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "var(--cream)",
              fontSize: 12.5,
              lineHeight: 1.5,
              fontFamily: "var(--font-body)",
              resize: "vertical"
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={luuGhiChu} style={{ ...nutNho, background: "var(--amber)", color: "var(--navy)", border: "none", fontWeight: 600 }}>
              Lưu
            </button>
            <button
              onClick={() => {
                setNhap(task.notes ?? "");
                setDangSua(false);
              }}
              style={nutNho}
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        task.notes && moRong && (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--slate)",
              background: "rgba(0,0,0,0.18)",
              borderRadius: 8,
              padding: "8px 10px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 260,
              overflowY: "auto"
            }}
          >
            <Linkify text={task.notes} />
          </div>
        )
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--slate)" }}>
            {task.category === "work" ? "🏢 NHG" : "🏠 Cá nhân"}
          </span>
          {!dangSua &&
            (task.notes ? (
              <button
                onClick={() => setMoRong((v) => !v)}
                className="mono"
                title={moRong ? "Thu gọn ghi chú" : "Xem ghi chú"}
                style={{ ...nutChuThich, color: "var(--amber)" }}
              >
                📎 {moRong ? "Thu gọn" : "Ghi chú"}
              </button>
            ) : (
              <button
                onClick={() => setDangSua(true)}
                className="mono"
                title="Thêm ghi chú"
                style={nutChuThich}
              >
                + Ghi chú
              </button>
            ))}
          {!dangSua && task.notes && moRong && (
            <button onClick={() => setDangSua(true)} className="mono" title="Sửa ghi chú" style={nutChuThich}>
              Sửa
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {task.deadline && (
            <span className="mono" style={{ fontSize: 10, color: overdue ? "var(--coral)" : "var(--slate)" }}>
              {overdue ? "Quá hạn " : ""}
              {new Date(task.deadline).toLocaleDateString("vi-VN")}
            </span>
          )}
          <button
            onClick={confirmDelete}
            title="Xóa"
            aria-label={`Xóa: ${task.title}`}
            style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 12, padding: 0 }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

const nutChuThich: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--slate)",
  fontSize: 10,
  padding: 0,
  textDecoration: "underline",
  textUnderlineOffset: 2
};

const nutNho: React.CSSProperties = {
  background: "transparent",
  color: "var(--cream)",
  border: "1px solid var(--line)",
  borderRadius: 7,
  padding: "5px 12px",
  fontSize: 12
};

function MiniToggle({
  label,
  active,
  color,
  onClick
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="mono"
      style={{
        background: active ? color : "transparent",
        border: `1px solid ${active ? color : "var(--line)"}`,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 9.5,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: active ? "var(--navy)" : "var(--slate)",
        fontWeight: active ? 700 : 400
      }}
    >
      {label}
    </button>
  );
}
