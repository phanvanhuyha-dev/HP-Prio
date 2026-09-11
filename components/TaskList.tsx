"use client";
import { useEffect, useRef, useState } from "react";
import NotesView from "./NotesView";
import { demBuoc, themBuocVaoGhiChu } from "@/lib/checklist";
import { docLoi, loiThanThien, rung } from "@/lib/client-api";
import { useTenTroLy } from "./TroLy";
import { IcSpark, IcHome, IcCoQuan, IcPlay, IcPen, IcLich } from "./icons";

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

type ReclassifyPatch = {
  title?: string;
  userUrgent?: boolean;
  userImportant?: boolean;
  notes?: string | null;
  deadline?: string | null;
};

function isoToLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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
  const TEN_TRO_LY = useTenTroLy();
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
  const TEN_TRO_LY = useTenTroLy();
  const nhom = nhomCua(task);
  const overdue = task.deadline ? new Date(task.deadline) < new Date() : false;
  const buoc = demBuoc(task.notes);
  const [moRong, setMoRong] = useState(false);
  const [dangSua, setDangSua] = useState(false);
  const [nhap, setNhap] = useState("");
  const [dangChia, setDangChia] = useState(false);
  const [loiChia, setLoiChia] = useState<string | null>(null);
  const [suaTen, setSuaTen] = useState(false);
  const [tenNhap, setTenNhap] = useState("");
  const [dangSuaHan, setDangSuaHan] = useState(false);
  const [tamHan, setTamHan] = useState<string | null>(task.deadline);

  useEffect(() => {
    setTamHan(task.deadline);
  }, [task.deadline]);

  function luuTen() {
    const ten = tenNhap.trim();
    // Tên rỗng thì bỏ qua chứ không lưu: một việc không tên là việc không tìm
    // lại được, mà cũng không có nút nào để đặt lại tên cho nó.
    if (!ten || ten === task.title) {
      setSuaTen(false);
      return;
    }
    onReclassify(task.id, { title: ten });
    setSuaTen(false);
  }

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

        {/* Đang sửa tên thì chính dòng tiêu đề biến thành ô nhập, sửa tại chỗ
            chứ không nhảy xuống một ô khác bên dưới. */}
        {suaTen ? (
          <input
            value={tenNhap}
            autoFocus
            onChange={(e) => setTenNhap(e.target.value.slice(0, 500))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) luuTen();
              if (e.key === "Escape") setSuaTen(false);
            }}
            aria-label="Tên công việc"
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--field)",
              border: "1px solid var(--amber)",
              borderRadius: 8,
              padding: "7px 9px",
              color: "var(--cream)",
              fontSize: 14.5,
              fontWeight: 500,
              fontFamily: "var(--font-body)",
              minHeight: 38
            }}
          />
        ) : (
        /* Bấm vào phần chữ để mở chi tiết: ghi chú, các bước, đổi ưu tiên, xóa */
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
            {task.deadline ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setMoRong(true);
                  setTamHan(task.deadline);
                  setDangSuaHan((v) => !v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    setMoRong(true);
                    setTamHan(task.deadline);
                    setDangSuaHan((v) => !v);
                  }
                }}
                title="Bấm để sửa hoặc bỏ hạn chót"
                style={{
                  color: overdue ? "var(--coral)" : "var(--slate)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  textDecoration: "underline",
                  textUnderlineOffset: 3
                }}
              >
                <IcLich size={11} />
                {overdue ? "Quá hạn " : ""}
                {new Date(task.deadline).toLocaleDateString("vi-VN")}
              </span>
            ) : moRong ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setTamHan(null);
                  setDangSuaHan(true);
                }}
                title="Đặt thời hạn cho việc này"
                style={{
                  color: "var(--slate)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  textDecoration: "underline",
                  textUnderlineOffset: 3
                }}
              >
                <IcLich size={11} />
                + Hạn chót
              </span>
            ) : null}
            {buoc.tong > 0 && (
              <span style={{ color: buoc.xong === buoc.tong ? "var(--teal)" : "var(--slate)" }}>
                ✓ {buoc.xong}/{buoc.tong}
              </span>
            )}
            <span aria-hidden="true">{moRong ? "▴" : "▾"}</span>
          </div>
        </button>
        )}

        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {/* Cây bút chỉ hiện khi đã bung chi tiết: danh sách thu gọn không
              cần thêm một icon trên mỗi dòng. */}
          {moRong && !suaTen && (
            <button
              onClick={() => {
                setTenNhap(task.title);
                setSuaTen(true);
              }}
              title="Sửa tên việc"
              aria-label={`Sửa tên việc: ${task.title}`}
              className="tap"
              style={{ background: "none", border: "none", color: "var(--slate)", padding: 0, margin: "-10px 6px -10px 0" }}
            >
              <IcPen size={13} />
            </button>
          )}
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
          {/* Ô nhập tên nằm ngay trên dòng tiêu đề, ở đây chỉ còn hai nút.
              Enter và Escape vẫn dùng được, hai nút này cho người bấm chuột. */}
          {suaTen && (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={luuTen}
                disabled={!tenNhap.trim()}
                style={{
                  ...nutNho,
                  background: "var(--amber)",
                  color: "var(--navy)",
                  border: "none",
                  fontWeight: 600,
                  opacity: tenNhap.trim() ? 1 : 0.5
                }}
              >
                Lưu tên
              </button>
              <button onClick={() => setSuaTen(false)} style={nutNho}>
                Hủy
              </button>
            </div>
          )}

          {/* Khung sửa hạn chót */}
          {dangSuaHan && (
            <div
              style={{
                background: "var(--field)",
                border: "1px solid var(--amber)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--cream)", display: "flex", alignItems: "center", gap: 6 }}>
                  <IcLich size={13} style={{ color: "var(--amber)" }} />
                  Thời hạn công việc
                </span>
                {task.deadline && (
                  <button
                    type="button"
                    onClick={() => {
                      onReclassify(task.id, { deadline: null });
                      setDangSuaHan(false);
                      rung(6);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--coral)",
                      fontSize: 12,
                      cursor: "pointer",
                      padding: "2px 4px",
                      textDecoration: "underline"
                    }}
                  >
                    Bỏ hạn chót
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(tamHan)}
                  onChange={(e) => setTamHan(localInputToIso(e.target.value))}
                  style={{
                    flex: "1 1 200px",
                    background: "var(--navy)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    padding: "7px 10px",
                    color: "var(--cream)",
                    fontSize: 13,
                    fontFamily: "var(--font-body)"
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onReclassify(task.id, { deadline: tamHan });
                    setDangSuaHan(false);
                    rung(8);
                  }}
                  style={{
                    background: "var(--amber)",
                    color: "var(--navy)",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 16px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer"
                  }}
                >
                  Lưu hạn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTamHan(task.deadline);
                    setDangSuaHan(false);
                  }}
                  style={{
                    background: "transparent",
                    color: "var(--slate)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    padding: "7px 12px",
                    fontSize: 13,
                    cursor: "pointer"
                  }}
                >
                  Đóng
                </button>
              </div>

              {/* Phím chọn nhanh ngày */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--slate)" }}>Gợi ý:</span>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setHours(18, 0, 0, 0);
                    const iso = d.toISOString();
                    setTamHan(iso);
                    onReclassify(task.id, { deadline: iso });
                    setDangSuaHan(false);
                    rung(6);
                  }}
                  style={nutGoiYNhanh}
                >
                  Hôm nay 18:00
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(18, 0, 0, 0);
                    const iso = d.toISOString();
                    setTamHan(iso);
                    onReclassify(task.id, { deadline: iso });
                    setDangSuaHan(false);
                    rung(6);
                  }}
                  style={nutGoiYNhanh}
                >
                  Ngày mai 18:00
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    d.setHours(18, 0, 0, 0);
                    const iso = d.toISOString();
                    setTamHan(iso);
                    onReclassify(task.id, { deadline: iso });
                    setDangSuaHan(false);
                    rung(6);
                  }}
                  style={nutGoiYNhanh}
                >
                  +7 ngày
                </button>
              </div>
            </div>
          )}

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

              {/* Nút đặt hoặc sửa hạn chót */}
              <button
                type="button"
                onClick={() => {
                  setTamHan(task.deadline);
                  setDangSuaHan((v) => !v);
                }}
                style={{
                  ...nutNho,
                  borderColor: dangSuaHan ? "var(--amber)" : "var(--line)",
                  color: task.deadline ? (overdue ? "var(--coral)" : "var(--amber)") : "var(--cream)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6
                }}
                title={task.deadline ? "Sửa hoặc bỏ hạn chót" : "Đặt hạn chót cho việc này"}
              >
                <IcLich size={13} />
                {task.deadline ? (
                  <span>
                    {overdue ? "Quá hạn " : "Hạn "}
                    {new Date(task.deadline).toLocaleDateString("vi-VN")}
                  </span>
                ) : (
                  "+ Hạn chót"
                )}
              </button>

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

const nutGoiYNhanh: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  color: "var(--cream)",
  fontSize: 11.5,
  padding: "3px 8px",
  cursor: "pointer"
};
