"use client";
import { useRef, useState, CSSProperties } from "react";

type ParsedTask = {
  title: string;
  category: "work" | "personal";
  deadline: string | null;
  urgent: boolean;
  important: boolean;
  reasoning: string;
};

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

export default function TaskInput({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ParsedTask | null>(null);
  const recognitionRef = useRef<any>(null);

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Trình duyệt này không hỗ trợ nhập bằng giọng nói. Anh có thể gõ text.");
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

  async function handleAnalyze() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Lỗi không xác định");
      setSuggestion(data.parsed);
    } catch (e: any) {
      setError(e?.message || "Không kết nối được máy chủ");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(final: ParsedTask) {
    if (!final.title.trim()) {
      setError("Tiêu đề không được để trống");
      return;
    }
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
          aiUrgent: suggestion?.urgent,
          aiImportant: suggestion?.important,
          aiCategory: suggestion?.category,
          aiDeadline: suggestion?.deadline,
          aiReasoning: suggestion?.reasoning,
          userUrgent: final.urgent,
          userImportant: final.important
        })
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      // Trước đây không kiểm tra kết quả: lưu thất bại vẫn xóa trắng ô nhập,
      // người dùng mất nội dung vừa gõ mà tưởng đã lưu xong.
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Không lưu được công việc");
      }
      setText("");
      setSuggestion(null);
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Không kết nối được máy chủ");
    } finally {
      setLoading(false);
    }
  }

  if (suggestion) {
    return (
      <ReviewCard
        original={text}
        suggestion={suggestion}
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
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Nói hoặc gõ việc cần làm... vd: Gửi báo cáo định biên cho anh Nam trước thứ 6 tuần này"
        rows={3}
        style={{
          width: "100%",
          resize: "none",
          background: "transparent",
          border: "none",
          color: "var(--cream)",
          fontSize: 16,
          fontFamily: "var(--font-body)",
          outline: "none"
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <button
          onClick={toggleVoice}
          aria-pressed={listening}
          style={{
            background: listening ? "var(--coral)" : "transparent",
            border: "1px solid " + (listening ? "var(--coral)" : "var(--line)"),
            borderRadius: 999,
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: "var(--cream)"
          }}
        >
          {listening ? "⏹" : "🎙"}
        </button>
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
            opacity: !text.trim() || loading ? 0.5 : 1
          }}
        >
          {loading ? "Đang phân tích…" : "Phân tích với AI"}
        </button>
      </div>
      {error && (
        <p style={{ color: "var(--coral)", fontSize: 13, marginTop: 10 }}>{error}</p>
      )}
    </div>
  );
}

function ReviewCard({
  original,
  suggestion,
  saving,
  error,
  onConfirm,
  onCancel
}: {
  original: string;
  suggestion: ParsedTask;
  saving: boolean;
  error: string | null;
  onConfirm: (final: ParsedTask) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ParsedTask>(suggestion);

  return (
    <div
      style={{
        background: "var(--navy-2)",
        border: "1px solid var(--amber)",
        borderRadius: 16,
        padding: 20
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: "var(--slate)", marginBottom: 4 }}>
        AI ĐỀ XUẤT — ANH DUYỆT LẠI TRƯỚC KHI LƯU
      </div>
      <p style={{ fontSize: 13, color: "var(--slate)", fontStyle: "italic", marginTop: 0 }}>
        “{original}”
      </p>

      <label style={fieldLabel}>Tiêu đề</label>
      <input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        style={inputStyle}
      />

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Phân loại</label>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as any })}
            style={inputStyle}
          >
            <option value="work">Công việc (NHG)</option>
            <option value="personal">Cá nhân</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={fieldLabel}>Deadline</label>
          <input
            type="datetime-local"
            value={isoToLocalInput(draft.deadline)}
            onChange={(e) => setDraft({ ...draft, deadline: localInputToIso(e.target.value) })}
            style={inputStyle}
          />
          {!draft.deadline && (
            <p style={{ fontSize: 11, color: "var(--coral)", margin: "4px 0 0" }}>
              AI không đủ chắc chắn về ngày — anh tự điền nếu có deadline.
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, margin: "14px 0" }}>
        <ToggleField label="Khẩn cấp" value={draft.urgent} onChange={(v) => setDraft({ ...draft, urgent: v })} color="var(--coral)" />
        <ToggleField label="Quan trọng" value={draft.important} onChange={(v) => setDraft({ ...draft, important: v })} color="var(--teal)" />
      </div>

      {suggestion.reasoning && (
        <p style={{ fontSize: 12, color: "var(--slate)", background: "rgba(255,255,255,0.03)", padding: "8px 10px", borderRadius: 8 }}>
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: value ? color : "transparent",
        border: `1px solid ${value ? color : "var(--line)"}`,
        borderRadius: 999,
        padding: "8px 14px",
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
  fontSize: 11,
  color: "var(--slate)",
  marginTop: 12,
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.04em"
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--cream)",
  fontSize: 14,
  fontFamily: "var(--font-body)"
};

const primaryBtn: CSSProperties = {
  background: "var(--amber)",
  color: "var(--navy)",
  border: "none",
  borderRadius: 10,
  padding: "12px 0",
  fontWeight: 700,
  fontSize: 14
};

const ghostBtn: CSSProperties = {
  background: "transparent",
  color: "var(--cream)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "12px 0",
  fontSize: 14
};
