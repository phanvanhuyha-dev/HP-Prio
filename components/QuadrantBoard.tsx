"use client";
import { useRef, useState } from "react";
import Linkify from "./Linkify";

export type Task = {
  id: string;
  title: string;
  category: "work" | "personal";
  deadline: string | null;
  notes: string | null;
  // Chỉ có giá trị với việc nằm trong thùng rác
  deleted_at?: string | null;
  user_urgent: boolean;
  user_important: boolean;
};

type ReclassifyPatch = { userUrgent?: boolean; userImportant?: boolean; notes?: string | null };

// Dùng thống nhất một cặp từ "khẩn cấp" và "quan trọng" đúng như hai nút bấm
// trên thẻ. Trước đây chỗ ghi "gấp" chỗ ghi "khẩn" khiến người đọc tưởng là
// hai tiêu chí khác nhau.
const QUADRANTS = [
  {
    key: "do",
    label: "Làm ngay",
    sub: "khẩn cấp + quan trọng",
    goiY: "Tự tay làm, ưu tiên trước hết",
    color: "var(--coral)",
    urgent: true,
    important: true
  },
  {
    key: "schedule",
    label: "Lên lịch",
    sub: "quan trọng, chưa khẩn cấp",
    goiY: "Đặt lịch cụ thể kẻo bị việc gấp lấn át",
    color: "var(--teal)",
    urgent: false,
    important: true
  },
  {
    key: "delegate",
    label: "Giao bớt",
    sub: "khẩn cấp, không quan trọng",
    goiY: "Giao cho người khác hoặc rút gọn cách làm",
    color: "var(--amber)",
    urgent: true,
    important: false
  },
  {
    key: "drop",
    label: "Cân nhắc bỏ",
    sub: "không khẩn cấp, không quan trọng",
    goiY: "Bỏ hẳn, hoặc hẹn xem lại vào cuối tháng",
    color: "var(--slate)",
    urgent: false,
    important: false
  }
] as const;

// Sau khi đánh dấu xong, thẻ biến mất và các thẻ dưới dồn lên ngay. Một cú chạm
// thứ hai trong vòng vài trăm mili giây sẽ rơi trúng việc KHÁC vừa trượt vào
// đúng vị trí đó. Bỏ qua các lần bấm quá sát nhau để chặn kiểu chạm nhầm này.
const KHOANG_CHAN_MS = 700;

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
  const lanBamCuoi = useRef(0);

  function danhDauXong(id: string) {
    const gio = Date.now();
    if (gio - lanBamCuoi.current < KHOANG_CHAN_MS) return;
    lanBamCuoi.current = gio;
    onDone(id);
  }

  if (tasks.length === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--slate)" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--cream)" }}>Chưa có việc nào.</p>
        <p>Nhập việc đầu tiên ở ô phía trên.</p>
      </div>
    );
  }

  return (
    // Lớp .quadrants xuống 1 cột khi màn hẹp. Ép 2 cột ở 390px làm tiêu đề
    // việc gãy 4 dòng và nút Xóa dính sát nút Ghi chú, rất dễ bấm nhầm.
    <div className="quadrants">
      {QUADRANTS.map((q) => {
        const items = tasks.filter((t) => t.user_urgent === q.urgent && t.user_important === q.important);
        return (
          // section + h3 để người dùng trình đọc màn hình nhảy được giữa 4 ô.
          // Trước đây tiêu đề ô là div trần nên không có mốc nào để điều hướng.
          <section
            key={q.key}
            aria-labelledby={`o-${q.key}`}
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
              <h3
                id={`o-${q.key}`}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--cream)",
                  margin: 0
                }}
              >
                {q.label}
              </h3>
              {/* Trên màn hẹp, hai dòng này bị ẩn (xem .o-phu-de / .o-goi-y trong
                  globals.css) để nhường chỗ cho tiêu đề việc, nhưng bố cục 2x2
                  vẫn giữ nguyên. Số lượng việc luôn hiện. */}
              <div className="mono" style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>
                <span className="o-phu-de">{q.sub} · </span>
                {items.length} việc
              </div>
              <div className="o-goi-y" style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 3, lineHeight: 1.35 }}>
                {q.goiY}
              </div>
            </div>
            <div className="o-danh-sach">
              {items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onDone={danhDauXong}
                  onDelete={onDelete}
                  onReclassify={onReclassify}
                />
              ))}
            </div>
          </section>
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

  // Bỏ window.confirm: hộp thoại hệ thống chặn luồng, không theo giao diện app,
  // và vẫn không cứu được khi bấm nhầm. Thay bằng băng "Hoàn tác" 6 giây ở
  // Dashboard, việc chỉ thật sự bị xóa sau khoảng chờ đó.
  function confirmDelete() {
    onDelete(task.id);
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
        <span className="viec-tieu-de" style={{ fontSize: 13.5, color: "var(--cream)", lineHeight: 1.3 }}>
          {task.title}
        </span>
        {/* class "tap" mở vùng chạm ra 44x44px theo WCAG 2.5.5, icon vẫn nhỏ.
            Trước đây vùng bấm chỉ 12x21px, rất dễ bấm trượt trên điện thoại. */}
        <button
          onClick={() => onDone(task.id)}
          title="Đánh dấu xong"
          aria-label={`Đánh dấu xong: ${task.title}`}
          className="tap"
          style={{ background: "none", border: "none", color: "var(--teal)", fontSize: 18, flexShrink: 0, padding: 0, margin: -10 }}
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

      <div className="viec-hang-duoi" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="viec-nut-nho" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--slate)" }}
            title={task.category === "work" ? "Việc cơ quan" : "Việc cá nhân"}
          >
            {task.category === "work" ? "🏢 Cơ quan" : "🏠 Cá nhân"}
          </span>
          {!dangSua &&
            (task.notes ? (
              <button
                onClick={() => setMoRong((v) => !v)}
                className="mono"
                title={moRong ? "Thu gọn ghi chú" : "Xem ghi chú"}
                style={{ ...nutChuThich, color: "var(--amber)" }}
              >
                📎 <span className="nut-chu">{moRong ? "Thu gọn" : "Ghi chú"}</span>
              </button>
            ) : (
              <button
                onClick={() => setDangSua(true)}
                className="mono"
                title="Thêm ghi chú"
                style={nutChuThich}
                aria-label="Thêm ghi chú"
              >
                + <span className="nut-chu">Ghi chú</span>
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
            <span className="mono" style={{ fontSize: 11, color: overdue ? "var(--coral)" : "var(--slate)" }}>
              {overdue ? "Quá hạn " : ""}
              {new Date(task.deadline).toLocaleDateString("vi-VN")}
            </span>
          )}
          <button
            onClick={confirmDelete}
            title="Xóa"
            aria-label={`Xóa: ${task.title}`}
            className="tap"
            style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 14, padding: 0, margin: -10 }}
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
  fontSize: 11.5,
  padding: "6px 4px",
  minHeight: 44,
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
      aria-label={label}
      className="mono"
      style={{
        background: active ? color : "transparent",
        border: `1px solid ${active ? color : "var(--line)"}`,
        borderRadius: 999,
        padding: "2px 12px",
        fontSize: 11,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        // 44px theo WCAG 2.5.5. Đây là thao tác hay dùng nhất trên điện thoại.
        minHeight: 44,
        color: active ? "var(--navy)" : "var(--slate)",
        fontWeight: active ? 700 : 500
      }}
    >
      {/* Dưới 480px chữ được ẩn, chỉ còn một chấm màu, nhưng aria-label vẫn đầy
          đủ nên trình đọc màn hình không mất thông tin. */}
      <span className="pill-chu">{label}</span>
      <span className="pill-cham" aria-hidden="true" />
    </button>
  );
}
