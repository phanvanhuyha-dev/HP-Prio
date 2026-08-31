"use client";
import { useRef, useState } from "react";
import NotesView from "./NotesView";
import { demBuoc, themBuocVaoGhiChu } from "@/lib/checklist";
import { docLoi, loiThanThien, rung } from "@/lib/client-api";
import { TEN_TRO_LY } from "@/lib/branding";
import { IcSpark, IcHome, IcCoQuan, IcPlay } from "./icons";

export type Task = {
  id: string;
  title: string;
  category: "work" | "personal";
  deadline: string | null;
  notes: string | null;
  // Chỉ có giá trị với việc nằm trong thùng rác
  deleted_at?: string | null;
  created_at?: string;
  user_urgent: boolean;
  user_important: boolean;
};

type ReclassifyPatch = { userUrgent?: boolean; userImportant?: boolean; notes?: string | null };

// Bốn nhóm Eisenhower giữ nguyên ngữ nghĩa, nhưng thể hiện bằng CHẤM MÀU và
// nhãn trên từng dòng thay vì bốn ô chia màn hình. Danh sách dọc đỡ tốn không
// gian hơn hẳn khi tiêu đề dài và số việc nhiều.
export function nhomCua(t: Pick<Task, "user_urgent" | "user_important">) {
  if (t.user_urgent && t.user_important)
    return { key: "do", label: "Làm ngay", color: "var(--coral)", thuTu: 0 };
  if (!t.user_urgent && t.user_important)
    return { key: "schedule", label: "Lên lịch", color: "var(--teal)", thuTu: 1 };
  // Không còn "Giao bớt": app một người dùng, không có ai để giao. Khẩn cấp
  // nhưng không quan trọng nghĩa là làm gọn dưới 15 phút hoặc mạnh dạn bỏ.
  if (t.user_urgent)
    return { key: "delegate", label: "Xử lý nhanh", color: "var(--amber)", thuTu: 2 };
  return { key: "drop", label: "Cân nhắc bỏ", color: "var(--slate)", thuTu: 3 };
}

// Sau khi đánh dấu xong, dòng biến mất và các dòng dưới dồn lên ngay. Một cú
// chạm thứ hai trong vài trăm mili giây sẽ rơi trúng việc KHÁC vừa trượt vào
// đúng vị trí đó. Bỏ qua các lần bấm quá sát nhau để chặn kiểu chạm nhầm này.
const KHOANG_CHAN_MS = 700;

export default function TaskList({
  tasks,
  onDone,
  onDelete,
  onReclassify,
  onFocus
}: {
  tasks: Task[];
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onReclassify: (id: string, patch: ReclassifyPatch) => void;
  onFocus: (task: Task) => void;
}) {
  const lanBamCuoi = useRef(0);

  function danhDauXong(id: string) {
    const gio = Date.now();
    if (gio - lanBamCuoi.current < KHOANG_CHAN_MS) return;
    lanBamCuoi.current = gio;
    rung();
    onDone(id);
  }

  if (tasks.length === 0) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--slate)" }}>
        <p style={{ fontSize: 20, fontWeight: 600, color: "var(--cream)" }}>Chưa có việc nào.</p>
        <p>Bấm nút “{TEN_TRO_LY}” ở góc dưới màn hình để thêm việc đầu tiên.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          onDone={danhDauXong}
          onDelete={onDelete}
          onReclassify={onReclassify}
          onFocus={onFocus}
        />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  onDone,
  onDelete,
  onReclassify,
  onFocus
}: {
  task: Task;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onReclassify: (id: string, patch: ReclassifyPatch) => void;
  onFocus: (task: Task) => void;
}) {
  const nhom = nhomCua(task);
  const overdue = task.deadline ? new Date(task.deadline) < new Date() : false;
  const buoc = demBuoc(task.notes);
  const [moRong, setMoRong] = useState(false);
  const [dangSua, setDangSua] = useState(false);
  const [nhap, setNhap] = useState("");
  const [dangChia, setDangChia] = useState(false);
  const [loiChia, setLoiChia] = useState<string | null>(null);

  // Nhờ AI chia việc thành các bước. Kết quả KHÔNG lưu thẳng: đổ vào ô sửa
  // ghi chú để duyệt rồi mới lưu, đúng nguyên tắc "AI đề xuất, anh duyệt".
  async function chiaBuoc() {
    if (dangChia) return;
    setDangChia(true);
    setLoiChia(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/breakdown`, { method: "POST" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const data = await res.json();
      setNhap(themBuocVaoGhiChu(task.notes, data.steps ?? []));
      setDangSua(true);
    } catch (e: any) {
      setLoiChia(loiThanThien(e));
    } finally {
      setDangChia(false);
    }
  }

  function luuGhiChu() {
    onReclassify(task.id, { notes: nhap.trim() || null });
    setDangSua(false);
  }

  return (
    <div
      style={{
        background: "var(--navy-2)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "10px 12px"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Chấm màu thay cho vị trí ô trong ma trận cũ */}
        <span
          aria-hidden="true"
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: nhom.color,
            flexShrink: 0,
            marginTop: 9
          }}
        />

        {/* Bấm vào phần chữ để mở chi tiết: ghi chú, các bước, đổi ưu tiên, xóa */}
        <button
          onClick={() => setMoRong((v) => !v)}
          aria-expanded={moRong}
          aria-label={`${moRong ? "Thu gọn" : "Mở"} chi tiết: ${task.title}`}
          style={{
            flex: 1,
            minWidth: 0,
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            color: "inherit"
          }}
        >
          <div className="viec-tieu-de" style={{ fontSize: 14.5, fontWeight: 500, color: "var(--cream)", lineHeight: 1.35 }}>
            {task.title}
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--slate)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
          >
            <span style={{ color: nhom.color }}>{nhom.label}</span>
            <span title={task.category === "work" ? "Việc cơ quan" : "Việc cá nhân"} style={{ display: "inline-flex" }}>
              {task.category === "work" ? <IcCoQuan size={12} /> : <IcHome size={12} />}
            </span>
            {task.deadline && (
              <span style={{ color: overdue ? "var(--coral)" : "var(--slate)" }}>
                {overdue ? "Quá hạn " : ""}
                {new Date(task.deadline).toLocaleDateString("vi-VN")}
              </span>
            )}
            {buoc.tong > 0 && (
              <span style={{ color: buoc.xong === buoc.tong ? "var(--teal)" : "var(--slate)" }}>
                ✓ {buoc.xong}/{buoc.tong}
              </span>
            )}
            <span aria-hidden="true">{moRong ? "▴" : "▾"}</span>
          </div>
        </button>

        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <button
            onClick={() => onFocus(task)}
            title="Tập trung vào việc này"
            aria-label={`Tập trung vào: ${task.title}`}
            className="tap"
            style={{ background: "none", border: "none", color: "var(--amber)", padding: 0, margin: "-10px 0" }}
          >
            <IcPlay size={13} />
          </button>
          <button
            onClick={() => onDone(task.id)}
            title="Đánh dấu xong"
            aria-label={`Đánh dấu xong: ${task.title}`}
            className="tap"
            style={{ background: "none", border: "none", color: "var(--teal)", fontSize: 18, padding: 0, margin: "-10px -10px -10px 0" }}
          >
            ✓
          </button>
        </div>
      </div>

      {moRong && (
        <div style={{ marginTop: 10, paddingLeft: 19, display: "flex", flexDirection: "column", gap: 10 }}>
          {dangSua ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                value={nhap}
                onChange={(e) => setNhap(e.target.value)}
                rows={7}
                autoFocus
                placeholder="Đường link, tài liệu, các bước cần làm (dòng bắt đầu bằng - [ ] thành ô đánh dấu)..."
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
                <button
                  onClick={luuGhiChu}
                  style={{ ...nutNho, background: "var(--amber)", color: "var(--navy)", border: "none", fontWeight: 600 }}
                >
                  Lưu
                </button>
                <button onClick={() => setDangSua(false)} style={nutNho}>
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            task.notes && (
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: "var(--slate)",
                  background: "var(--field)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  maxHeight: 280,
                  overflowY: "auto"
                }}
              >
                <NotesView text={task.notes} onDoi={(moi) => onReclassify(task.id, { notes: moi })} choSua />
              </div>
            )
          )}

          {loiChia && (
            <p role="alert" style={{ color: "var(--coral)", fontSize: 11.5, margin: 0 }}>
              {loiChia}
            </p>
          )}

          {!dangSua && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Đổi phân loại nếu AI đoán sai hoặc mức ưu tiên thay đổi */}
              <MiniToggle
                label="Khẩn cấp"
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

              <button
                onClick={chiaBuoc}
                disabled={dangChia}
                style={{ ...nutNho, opacity: dangChia ? 0.6 : 1 }}
                title={`Nhờ ${TEN_TRO_LY} chia việc này thành các bước`}
              >
                {dangChia ? <span className="spinner" aria-hidden="true" /> : <IcSpark size={12} />}{" "}
                {dangChia ? "Đang chia…" : "Chia bước"}
              </button>

              <button
                onClick={() => {
                  // Lấy bản MỚI NHẤT lúc mở: người dùng vừa đánh dấu checklist
                  // thì notes đã đổi từ bên ngoài, không dùng state cũ.
                  setNhap(task.notes ?? "");
                  setDangSua(true);
                }}
                style={nutNho}
              >
                {task.notes ? "Sửa ghi chú" : "+ Ghi chú"}
              </button>

              <button
                onClick={() => onDelete(task.id)}
                aria-label={`Xóa: ${task.title}`}
                style={{ ...nutNho, color: "var(--coral)", borderColor: "transparent", marginLeft: "auto" }}
              >
                Xóa
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const nutNho: React.CSSProperties = {
  background: "transparent",
  color: "var(--cream)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12.5,
  minHeight: 40
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
      style={{
        background: active ? color : "transparent",
        border: `1px solid ${active ? color : "var(--line)"}`,
        borderRadius: 999,
        padding: "8px 14px",
        fontSize: 12,
        minHeight: 40,
        color: active ? "var(--navy)" : "var(--slate)",
        fontWeight: active ? 700 : 500
      }}
    >
      {label}
    </button>
  );
}
