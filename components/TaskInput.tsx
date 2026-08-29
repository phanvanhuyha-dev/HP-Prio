"use client";
import { useEffect, useRef, useState, useId, CSSProperties } from "react";
import { docLoi, loiThanThien, ngayVN } from "@/lib/client-api";

type ParsedTask = {
  title: string;
  category: "work" | "personal";
  deadline: string | null;
  urgent: boolean;
  important: boolean;
  reasoning: string;
};

type DraftTask = ParsedTask & { notes: string };

// Gọi AI có thể mất 30-50s. Quá mốc này thì dừng hẳn để người dùng không chờ vô hạn.
const HAN_CHO_MS = 60000;

// Ô <input type="datetime-local"> làm việc theo giờ máy người dùng.
// Cắt chuỗi ISO bằng slice(0,16) sẽ hiện sai giờ khi chuỗi có offset múi giờ.
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

// Quy tắc DUY NHẤT cho việc tự điền ghi chú: giữ nguyên câu người dùng gõ,
// trừ khi tiêu đề đã nói đúng y như vậy. Trước đây dùng ngưỡng độ dài nên lúc
// điền lúc không, người dùng không đoán được.
function ghiChuMacDinh(cauGoc: string, tieuDe: string) {
  const chuanHoa = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return chuanHoa(cauGoc) === chuanHoa(tieuDe) ? "" : cauGoc.trim();
}

export default function TaskInput({ onSaved }: { onSaved: (tieuDe: string) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [giay, setGiay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ParsedTask | null>(null);
  const [dungAI, setDungAI] = useState(true);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Chốt chống gửi trùng. Thuộc tính disabled chỉ có hiệu lực sau khi React
  // render lại; máy chậm hoặc nhiều tab là đủ để hai cú bấm cùng lọt qua và
  // bay mất hai lượt gọi Gemini. useRef có hiệu lực ngay lập tức.
  const dangChayRef = useRef(false);
  const nhapId = useId();

  // Dọn micro và huỷ request đang bay khi rời màn hình.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      abortRef.current?.abort();
    };
  }, []);

  // Đếm giây khi đang chờ AI. Chờ 30-50s mà màn hình đứng im thì người dùng
  // tưởng hỏng, thấy số giây chạy thì biết hệ thống vẫn đang làm việc.
  useEffect(() => {
    if (!loading) return setGiay(0);
    const t = setInterval(() => setGiay((g) => g + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Trình duyệt này không hỗ trợ nhập bằng giọng nói. Anh có thể gõ chữ.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setText((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  // Bỏ qua AI: dựng sẵn bản nháp từ chính câu gõ. Việc đơn giản như "họp"
  // không đáng phải chờ AI 30-50s.
  function boQuaAI() {
    const raw = text.trim();
    if (!raw) return;
    // Đang chờ AI mà bấm nút này thì hủy luôn request, không bắt bấm Dừng trước.
    // Đây đúng lúc người dùng sốt ruột nhất, bớt được một bước.
    abortRef.current?.abort();
    const dongDau = raw.split("\n")[0].trim();
    setDungAI(false);
    setError(null);
    setSuggestion({
      title: (dongDau.length > 80 ? dongDau.slice(0, 80) : dongDau) || raw.slice(0, 80),
      category: "work",
      deadline: null,
      urgent: false,
      important: false,
      reasoning: ""
    });
  }

  async function handleAnalyze() {
    if (!text.trim()) return;
    if (dangChayRef.current) return;
    dangChayRef.current = true;
    setLoading(true);
    setError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Phân biệt "hết giờ" với "người dùng bấm Dừng": hai việc này cần hai câu
    // thông báo khác nhau, trước đây gộp làm một nên báo sai bản chất.
    let doHetGio = false;
    const hetGio = setTimeout(() => {
      doHetGio = true;
      ctrl.abort();
    }, HAN_CHO_MS);

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      // Không gọi thẳng res.json(): body có thể là text/plain khi hạ tầng trả 503.
      if (!res.ok) throw new Error(await docLoi(res));
      const data = await res.json();
      setDungAI(true);
      setSuggestion(data.parsed);
    } catch (e: any) {
      setError(loiThanThien(doHetGio ? Object.assign(e ?? {}, { quaHan: true }) : e));
    } finally {
      clearTimeout(hetGio);
      abortRef.current = null;
      dangChayRef.current = false;
      setLoading(false);
    }
  }

  function huyPhanTich() {
    abortRef.current?.abort();
  }

  async function handleConfirm(final: DraftTask) {
    if (!final.title.trim()) {
      setError("Tiêu đề không được để trống");
      return;
    }
    // Chặn lưu hai lần thành hai việc trùng nhau
    if (dangChayRef.current) return;
    dangChayRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: text,
          title: final.title.trim(),
          category: final.category,
          deadline: final.deadline,
          notes: final.notes,
          aiUrgent: dungAI ? suggestion?.urgent : undefined,
          aiImportant: dungAI ? suggestion?.important : undefined,
          aiCategory: dungAI ? suggestion?.category : undefined,
          aiDeadline: dungAI ? suggestion?.deadline : undefined,
          aiReasoning: dungAI ? suggestion?.reasoning : undefined,
          userUrgent: final.urgent,
          userImportant: final.important
        })
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      // Lưu thất bại mà vẫn xóa trắng ô nhập thì người dùng mất nội dung vừa gõ
      // mà tưởng đã lưu xong.
      if (!res.ok) throw new Error(await docLoi(res));
      const tieuDe = final.title.trim();
      setText("");
      setSuggestion(null);
      onSaved(tieuDe);
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      dangChayRef.current = false;
      setLoading(false);
    }
  }

  if (suggestion) {
    return (
      <ReviewCard
        original={text}
        suggestion={suggestion}
        dungAI={dungAI}
        saving={loading}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => {
          setSuggestion(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div
      style={{
        background: "var(--navy-2)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        padding: 18
      }}
    >
      <label htmlFor={nhapId} className="sr-only">
        Nội dung công việc cần thêm
      </label>
      <textarea
        id={nhapId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Nói hoặc gõ việc cần làm... vd: Gửi báo cáo định biên cho anh Nam trước thứ 6 tuần này"
        rows={3}
        style={{
          width: "100%",
          resize: "vertical",
          background: "transparent",
          border: "none",
          color: "var(--cream)",
          fontSize: 16,
          fontFamily: "var(--font-body)",
          outline: "none"
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button
          onClick={toggleVoice}
          aria-pressed={listening}
          aria-label={listening ? "Dừng nhập bằng giọng nói" : "Nhập bằng giọng nói"}
          title={listening ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
          style={{
            background: listening ? "var(--coral)" : "transparent",
            border: "1px solid " + (listening ? "var(--coral)" : "var(--line)"),
            borderRadius: 999,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: listening ? "var(--navy)" : "var(--cream)"
          }}
        >
          {listening ? "⏹" : "🎙"}
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Đường thoát khỏi nút thắt chờ AI: việc đơn giản thì lưu thẳng. */}
          <button
            onClick={boQuaAI}
            disabled={!text.trim()}
            title={loading ? "Dừng AI và tự điền các trường" : "Tự điền các trường, không chờ AI"}
            style={{
              background: "transparent",
              color: "var(--cream)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              minHeight: 44,
              opacity: !text.trim() ? 0.5 : 1
            }}
          >
            Bỏ qua AI
          </button>

          {/* Nút Dừng phải NẰM RIÊNG, không được biến nút chính thành nút hủy:
              nhấp đúp vào nút chính sẽ tự hủy chính request vừa gửi. */}
          {loading && (
            <button
              onClick={huyPhanTich}
              style={{
                background: "transparent",
                color: "var(--coral)",
                border: "1px solid var(--coral)",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 13,
                minHeight: 44
              }}
            >
              Dừng
            </button>
          )}
          <button
            onClick={handleAnalyze}
            disabled={!text.trim() || loading}
            style={{
              background: "var(--amber)",
              color: "var(--navy)",
              border: "none",
              borderRadius: 10,
              padding: "12px 22px",
              fontWeight: 600,
              fontSize: 14,
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: !text.trim() || loading ? 0.6 : 1
            }}
          >
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? `Đang phân tích ${giay}s` : "Phân tích với AI"}
          </button>
        </div>
      </div>

      {/* Trình đọc màn hình cần được báo trạng thái, không chỉ đổi chữ trên nút. */}
      <p aria-live="polite" className="sr-only">
        {loading ? `Đang phân tích, đã chờ ${giay} giây` : ""}
      </p>

      {loading && (
        <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 10, marginBottom: 0 }}>
          AI thường mất 20 đến 50 giây. Anh có thể bấm Dừng rồi chọn “Bỏ qua AI” để tự nhập.
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--coral)", fontSize: 13, marginTop: 10, marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ReviewCard({
  original,
  suggestion,
  dungAI,
  saving,
  error,
  onConfirm,
  onCancel
}: {
  original: string;
  suggestion: ParsedTask;
  dungAI: boolean;
  saving: boolean;
  error: string | null;
  onConfirm: (final: DraftTask) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<DraftTask>(() => ({
    ...suggestion,
    notes: ghiChuMacDinh(original, suggestion.title)
  }));
  const [xemDayDu, setXemDayDu] = useState(false);
  const id = useId();

  const NGAN = 160;
  const quaDai = original.trim().length > NGAN;
  const trichDan = xemDayDu || !quaDai ? original.trim() : original.trim().slice(0, NGAN) + "…";

  // Cảnh báo deadline đã qua. Trước đây nhận im lặng, người dùng không biết
  // mình vừa đặt một mốc trong quá khứ.
  const daQua = draft.deadline ? new Date(draft.deadline).getTime() < Date.now() : false;

  return (
    <div
      style={{
        background: "var(--navy-2)",
        border: "1px solid var(--amber)",
        borderRadius: 16,
        padding: 20
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: "var(--slate)", marginBottom: 6 }}>
        {dungAI ? "AI ĐỀ XUẤT, ANH DUYỆT LẠI TRƯỚC KHI LƯU" : "ANH TỰ ĐIỀN, KHÔNG DÙNG AI"}
      </div>

      {/* Câu gõ dài chiếm gần nửa màn hình, đẩy các trường xuống dưới.
          Rút gọn lại, ai cần thì mở ra xem. */}
      <p style={{ fontSize: 13, color: "var(--slate)", fontStyle: "italic", margin: "0 0 4px" }}>
        “{trichDan}”
        {quaDai && (
          <button
            onClick={() => setXemDayDu((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "var(--amber)",
              fontSize: 12,
              padding: "0 0 0 6px",
              textDecoration: "underline",
              fontStyle: "normal"
            }}
          >
            {xemDayDu ? "Thu gọn" : "Xem đầy đủ"}
          </button>
        )}
      </p>

      <label htmlFor={`${id}-title`} style={fieldLabel}>Tiêu đề</label>
      <input
        id={`${id}-title`}
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        style={inputStyle}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor={`${id}-cat`} style={fieldLabel}>Phân loại</label>
          <select
            id={`${id}-cat`}
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as any })}
            style={selectStyle}
          >
            <option value="work">Công việc cơ quan</option>
            <option value="personal">Cá nhân</option>
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor={`${id}-due`} style={fieldLabel}>Hạn chót</label>
          <input
            id={`${id}-due`}
            type="datetime-local"
            value={isoToLocalInput(draft.deadline)}
            onChange={(e) => setDraft({ ...draft, deadline: localInputToIso(e.target.value) })}
            style={inputStyle}
          />
          {!draft.deadline && dungAI && (
            <p style={{ fontSize: 11.5, color: "var(--coral)", margin: "4px 0 0" }}>
              AI không đủ chắc chắn về ngày, anh tự điền nếu có hạn chót.
            </p>
          )}
          {/* Ô datetime-local hiển thị theo ngôn ngữ trình duyệt, ra dạng
              "01-Aug-2026 09:00 AM" và không ép được. Hiện thêm dòng tiếng Việt. */}
          {draft.deadline && (
            <p style={{ fontSize: 11.5, color: daQua ? "var(--coral)" : "var(--slate)", margin: "4px 0 0" }}>
              {daQua ? "⚠ Đã qua: " : "Tức là "}
              {ngayVN(draft.deadline)}
            </p>
          )}
        </div>
      </div>

      <label htmlFor={`${id}-notes`} style={fieldLabel}>
        Ghi chú, đường link, việc cần làm
        {draft.notes && (
          <span style={{ color: "var(--slate)", textTransform: "none", letterSpacing: 0 }}>
            {" "}
            · {draft.notes.length} ký tự
          </span>
        )}
      </label>
      <textarea
        id={`${id}-notes`}
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        rows={5}
        placeholder="Dán đường link tài liệu, ghi các bước cần làm, người liên quan..."
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
      />

      <fieldset style={{ border: "none", padding: 0, margin: "14px 0" }}>
        <legend className="sr-only">Mức ưu tiên</legend>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ToggleField label="Khẩn cấp" value={draft.urgent} onChange={(v) => setDraft({ ...draft, urgent: v })} color="var(--coral)" />
          <ToggleField label="Quan trọng" value={draft.important} onChange={(v) => setDraft({ ...draft, important: v })} color="var(--teal)" />
        </div>
      </fieldset>

      {suggestion.reasoning && (
        <p style={{ fontSize: 12.5, color: "var(--slate)", background: "rgba(255,255,255,0.04)", padding: "8px 10px", borderRadius: 8 }}>
          💭 AI lý giải: {suggestion.reasoning}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--coral)", fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={onCancel} disabled={saving} style={{ ...ghostBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
          Hủy
        </button>
        <button
          onClick={() => onConfirm(draft)}
          disabled={saving}
          style={{ ...primaryBtn, flex: 2, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Đang lưu…" : "Xác nhận & Lưu"}
        </button>
      </div>
    </div>
  );
}

function ToggleField({ label, value, onChange, color }: { label: string; value: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      aria-pressed={value}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: value ? color : "transparent",
        border: `1px solid ${value ? color : "var(--line)"}`,
        borderRadius: 999,
        padding: "10px 16px",
        minHeight: 44,
        color: value ? "var(--navy)" : "var(--cream)",
        fontSize: 13,
        fontWeight: 600
      }}
    >
      {label}
    </button>
  );
}

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 11.5,
  color: "var(--slate)",
  marginTop: 12,
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--field)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--cream)",
  fontSize: 14,
  fontFamily: "var(--font-body)"
};

// Nền đục là bắt buộc với select: nền trong suốt khiến một số trình duyệt vẽ
// khung danh sách xổ xuống bằng màu trắng mặc định.
const selectStyle: CSSProperties = { ...inputStyle };

const primaryBtn: CSSProperties = {
  background: "var(--amber)",
  color: "var(--navy)",
  border: "none",
  borderRadius: 10,
  padding: "13px 0",
  minHeight: 44,
  fontWeight: 700,
  fontSize: 14
};

const ghostBtn: CSSProperties = {
  background: "transparent",
  color: "var(--cream)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "13px 0",
  minHeight: 44,
  fontSize: 14
};
