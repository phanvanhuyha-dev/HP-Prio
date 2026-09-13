"use client";
import { useEffect, useRef, useState, useId, CSSProperties } from "react";
import { docLoi, loiThanThien, ngayVN } from "@/lib/client-api";
import { useTenTroLy } from "./TroLy";
import { IcSpark, IcMic, IcStop, IcArrowUp, IcArrowDown } from "./icons";
import { doanViecTuCau } from "@/lib/ngay-viet";

import { type DanhMuc, DANH_MUC_MAC_DINH } from "@/lib/db";

export type BuocThucHien = {
  xong: boolean;
  noiDung: string;
};

// Phân tách câu nhập ban đầu thành các bước (nếu có dấu gạch đầu dòng/đánh số)
// và phần ghi chú phụ còn lại.
export function tachGhiChuVaBuoc(
  original: string,
  tieuDe: string
): { ghiChuPhu: string; cacBuoc: BuocThucHien[] } {
  const dongs = original.split("\n").map((d) => d.trimEnd());
  const cacBuoc: BuocThucHien[] = [];
  const ghiChuDongs: string[] = [];

  const chuanHoa = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const tieuDeChuan = chuanHoa(tieuDe);

  const REGEX_CHECKLIST = /^(\s*)- \[( |x|X)\] ?(.*)$/;
  const REGEX_DAU_DONG = /^(\s*)(?:[-*+]|\d+[.)\-])\s+(.+)$/;

  let daBoQuaTieuDe = false;

  for (let i = 0; i < dongs.length; i++) {
    const dong = dongs[i];
    const dongTrim = dong.trim();
    if (!dongTrim) {
      if (ghiChuDongs.length > 0) ghiChuDongs.push("");
      continue;
    }

    if (!daBoQuaTieuDe && chuanHoa(dongTrim) === tieuDeChuan) {
      daBoQuaTieuDe = true;
      continue;
    }

    const mChecklist = dong.match(REGEX_CHECKLIST);
    if (mChecklist) {
      const noiDung = mChecklist[3].trim();
      if (noiDung) {
        cacBuoc.push({ xong: mChecklist[2].toLowerCase() === "x", noiDung });
      }
      continue;
    }

    const mDauDong = dong.match(REGEX_DAU_DONG);
    if (mDauDong) {
      const noiDung = mDauDong[2].trim();
      if (noiDung) {
        cacBuoc.push({ xong: false, noiDung });
      }
      continue;
    }

    ghiChuDongs.push(dong);
  }

  return {
    ghiChuPhu: ghiChuDongs.join("\n").trim(),
    cacBuoc
  };
}

type ParsedTask = {
  title: string;
  category: string;
  deadline: string | null;
  urgent: boolean;
  important: boolean;
  reasoning: string;
};

type DraftTask = ParsedTask & { notes: string };

// Đề xuất hành động từ trợ lý (báo xong / sửa việc), chờ người dùng xác nhận
type DeXuat =
  | { loai: "xong"; taskId: string; tieuDe: string }
  | { loai: "sua"; taskId: string; tieuDe: string; capNhat: Record<string, unknown>; tomTat: string[] };

// Đo thực tế: router trả lời trong 2-4 giây. 30 giây là dư cho khởi động nguội.
const HAN_CHO_MS = 30000;

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
// trừ khi tiêu đề đã nói đúng y như vậy.
// Model đôi lúc vẫn trả về markdown dù prompt đã dặn không. Đổi cặp ** thành
// chữ đậm bằng phần tử React, KHÔNG dùng dangerouslySetInnerHTML, nên đây
// không phải một đường chèn mã: mọi thứ còn lại vẫn là chữ thuần.
function ChuDam({ text }: { text: string }) {
  const phan = text.split("**");
  // Số dấu ** phải chẵn thì mới là in đậm. Lẻ một dấu nghĩa là nó đứng một
  // mình, xử lý tiếp sẽ làm cả phần đuôi câu đậm lên. Trường hợp đó giữ
  // nguyên văn bản, thà hiện ra dấu ** còn hơn bôi đậm nhầm nửa câu.
  if (phan.length % 2 === 0) return <>{text}</>;
  return (
    <>
      {phan.map((p, i) =>
        i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
      )}
    </>
  );
}

function ghiChuMacDinh(cauGoc: string, tieuDe: string) {
  const chuanHoa = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return chuanHoa(cauGoc) === chuanHoa(tieuDe) ? "" : cauGoc.trim();
}

export default function TaskInput({
  onHoanTat,
  danhMuc
}: {
  onHoanTat: (thongBao: string) => void;
  danhMuc?: DanhMuc[];
}) {
  const TEN_TRO_LY = useTenTroLy();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [giay, setGiay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ParsedTask | null>(null);
  const [deXuat, setDeXuat] = useState<DeXuat | null>(null);
  const [traLoi, setTraLoi] = useState<string | null>(null);
  const [dungAI, setDungAI] = useState(true);
  // Máy chủ báo đã phải dùng lớp dự phòng (AI hỏng), hiện cảnh báo để người
  // dùng soi kỹ bản nháp hơn bình thường.
  const [ghiChuDuPhong, setGhiChuDuPhong] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Chốt chống gửi trùng: disabled chỉ có hiệu lực sau khi React render lại,
  // useRef chặn được ngay cả khi hai cú bấm rơi vào cùng một chu kỳ.
  const dangChayRef = useRef(false);
  const nhapId = useId();

  // Safari trên iPhone/iPad KHÔNG hỗ trợ Web Speech API (mọi trình duyệt iOS
  // đều chạy lõi WebKit). Thay nút micro bằng hướng dẫn dùng bàn phím.
  const [hoTroMicro, setHoTroMicro] = useState<"chua-biet" | "co" | "khong">("chua-biet");

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setHoTroMicro(SR ? "co" : "khong");
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading) return setGiay(0);
    const t = setInterval(() => setGiay((g) => g + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (e: any) => {
      let moi = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) moi += e.results[i][0].transcript;
      }
      if (!moi.trim()) return;
      setText((prev) => (prev ? prev.trimEnd() + " " + moi.trim() : moi.trim()));
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = (e: any) => {
      setListening(false);
      const loi: Record<string, string> = {
        "not-allowed": "Trình duyệt đang chặn micro. Anh vào phần cài đặt quyền của trang để cho phép.",
        "service-not-allowed": "Trình duyệt đang chặn micro. Anh vào phần cài đặt quyền của trang để cho phép.",
        "no-speech": "Không nghe thấy gì. Anh thử nói to hơn hoặc lại gần micro.",
        "audio-capture": "Không tìm thấy micro nào trên máy.",
        network: "Nhận giọng nói cần mạng, mà kết nối đang trục trặc."
      };
      if (e?.error === "aborted") return;
      setError(loi[e?.error] ?? `Không nhận được giọng nói (${e?.error ?? "lỗi không rõ"}).`);
    };

    recognitionRef.current = recognition;
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Không khởi động được micro, anh thử lại.");
    }
  }

  // Bỏ qua AI: đọc câu bằng quy tắc ngay trên máy, đủ hiểu "3h chiều mai",
  // "thứ 6", "15/9". Nhanh tức thì và không tốn lượt gọi AI nào.
  function boQuaAI() {
    const raw = text.trim();
    if (!raw) return;
    abortRef.current?.abort();
    setDungAI(false);
    setError(null);
    setTraLoi(null);
    setGhiChuDuPhong(null);
    setSuggestion(doanViecTuCau(raw));
  }

  // Gửi câu nói cho trợ lý: có thể ra 1 trong 4 hành động
  async function handleGui() {
    if (!text.trim()) return;
    if (dangChayRef.current) return;
    dangChayRef.current = true;
    setLoading(true);
    setError(null);
    setTraLoi(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let doHetGio = false;
    const hetGio = setTimeout(() => {
      doHetGio = true;
      ctrl.abort();
    }, HAN_CHO_MS);

    try {
      const res = await fetch("/api/beiu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const kq = await res.json();

      if (kq.hanhDong === "them") {
        setDungAI(!kq.duPhong);
        setGhiChuDuPhong(kq.duPhong ? (kq.ghiChu ?? null) : null);
        setSuggestion(kq.viec);
      } else if (kq.hanhDong === "xong") {
        setDeXuat({ loai: "xong", taskId: kq.taskId, tieuDe: kq.tieuDe });
      } else if (kq.hanhDong === "sua") {
        setDeXuat({ loai: "sua", taskId: kq.taskId, tieuDe: kq.tieuDe, capNhat: kq.capNhat, tomTat: kq.tomTat });
      } else if (kq.hanhDong === "tra-loi") {
        setTraLoi(kq.traLoi);
        setText("");
      } else {
        throw new Error("Phản hồi không đúng định dạng");
      }
    } catch (e: any) {
      setError(loiThanThien(doHetGio ? Object.assign(e ?? {}, { quaHan: true }) : e));
    } finally {
      clearTimeout(hetGio);
      abortRef.current = null;
      dangChayRef.current = false;
      setLoading(false);
    }
  }

  // Xác nhận đề xuất báo xong / sửa việc từ trợ lý
  async function thucHienDeXuat() {
    const dx = deXuat;
    if (!dx || dangChayRef.current) return;
    dangChayRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${dx.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dx.loai === "xong" ? { status: "done" } : dx.capNhat)
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const thongBao =
        dx.loai === "xong" ? `Đã đánh dấu xong “${dx.tieuDe}”` : `Đã cập nhật “${dx.tieuDe}”`;
      setText("");
      setDeXuat(null);
      onHoanTat(thongBao);
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      dangChayRef.current = false;
      setLoading(false);
    }
  }

  async function handleConfirm(final: DraftTask) {
    if (!final.title.trim()) {
      setError("Tiêu đề không được để trống");
      return;
    }
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
      if (!res.ok) throw new Error(await docLoi(res));
      const tieuDe = final.title.trim();
      setText("");
      setSuggestion(null);
      onHoanTat(`Đã lưu “${tieuDe}”`);
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
        danhMuc={danhMuc}
        dungAI={dungAI}
        ghiChuDuPhong={ghiChuDuPhong}
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

  // Đề xuất báo xong / sửa việc: hiện xác nhận, không tự làm gì cả
  if (deXuat) {
    return (
      <div style={{ background: "var(--navy-2)", border: "1px solid var(--amber)", borderRadius: 16, padding: 20 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--slate)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {TEN_TRO_LY} hiểu là
        </div>
        <p style={{ fontSize: 15, color: "var(--cream)", margin: "0 0 4px", fontWeight: 600 }}>
          {deXuat.loai === "xong" ? "Đánh dấu xong:" : "Cập nhật:"} “{deXuat.tieuDe}”
        </p>
        {deXuat.loai === "sua" && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {deXuat.tomTat.map((d, i) => (
              <li key={i} style={{ fontSize: 13.5, color: "var(--cream)", marginBottom: 4 }}>
                {d}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" style={{ color: "var(--coral)", fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={() => {
              setDeXuat(null);
              setError(null);
            }}
            disabled={loading}
            style={{ ...ghostBtn, flex: 1, opacity: loading ? 0.5 : 1 }}
          >
            Hủy
          </button>
          <button onClick={thucHienDeXuat} disabled={loading} style={{ ...primaryBtn, flex: 2, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Đang thực hiện…" : "✓ Xác nhận"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--navy-2)", border: "1px solid var(--line)", borderRadius: 16, padding: 18 }}>
      {/* Câu trả lời / phân tích của trợ lý; ô nhập vẫn mở để hỏi tiếp */}
      {traLoi && (
        <div
          style={{
            background: "var(--field)",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 12
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span
              className="mono"
              style={{ fontSize: 10.5, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <IcSpark size={11} /> {TEN_TRO_LY}
            </span>
            <button
              onClick={() => setTraLoi(null)}
              aria-label="Đóng câu trả lời"
              className="tap"
              style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 13, margin: -10 }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--cream)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <ChuDam text={traLoi} />
          </div>
        </div>
      )}

      <label htmlFor={nhapId} className="sr-only">
        Nói với {TEN_TRO_LY}
      </label>
      <textarea
        id={nhapId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Thêm việc, báo xong, sửa việc, hoặc hỏi ${TEN_TRO_LY}... vd: "Dời hạn báo cáo định biên sang thứ 6"`}
        rows={3}
        autoFocus
        onKeyDown={(e) => {
          // Enter gửi, Shift + Enter xuống dòng. Ô này gần như luôn dùng một
          // câu ngắn nên bắt tay rời bàn phím đi bấm nút là thừa.
          // isComposing: đang gõ dấu tiếng Việt bằng bộ gõ, Enter lúc đó là
          // để chọn chữ chứ không phải để gửi.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (text.trim() && !loading) void handleGui();
          }
        }}
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
        {hoTroMicro === "khong" ? (
          <span style={{ fontSize: 12, color: "var(--slate)", maxWidth: 260, lineHeight: 1.4 }}>
            Máy này không cho web dùng micro. Anh bấm vào ô nhập rồi chọn nút 🎤 trên bàn phím để đọc chính tả.
          </span>
        ) : (
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
              flexShrink: 0,
              color: listening ? "var(--navy)" : "var(--cream)"
            }}
          >
            {listening ? <IcStop size={16} /> : <IcMic size={17} />}
          </button>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={boQuaAI}
            disabled={!text.trim()}
            title={loading ? "Dừng AI và tự điền các trường" : "Thêm việc không cần AI"}
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

          {loading && (
            <button
              onClick={() => abortRef.current?.abort()}
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
            onClick={handleGui}
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
            {loading ? (
              `Đang xử lý ${giay}s`
            ) : (
              <>
                Gửi <IcSpark size={13} />
              </>
            )}
          </button>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {loading ? `Đang xử lý, đã chờ ${giay} giây` : listening ? "Đang nghe" : ""}
      </p>

      {listening && (
        <p style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 10, marginBottom: 0 }}>
          <span
            aria-hidden="true"
            style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--coral)", marginRight: 7 }}
          />
          Đang nghe, anh nói bình thường. Nói xong bấm lại nút micro để dừng.
        </p>
      )}

      {loading && (
        <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 10, marginBottom: 0 }}>
          {TEN_TRO_LY} thường trả lời trong 2 đến 4 giây.
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
  danhMuc,
  dungAI,
  ghiChuDuPhong,
  saving,
  error,
  onConfirm,
  onCancel
}: {
  original: string;
  suggestion: ParsedTask;
  danhMuc?: DanhMuc[];
  dungAI: boolean;
  ghiChuDuPhong: string | null;
  saving: boolean;
  error: string | null;
  onConfirm: (final: DraftTask) => void;
  onCancel: () => void;
}) {
  const TEN_TRO_LY = useTenTroLy();
  const [init] = useState(() => tachGhiChuVaBuoc(original, suggestion.title));
  const [draft, setDraft] = useState<DraftTask>(() => ({
    ...suggestion,
    notes: ""
  }));
  const [cacBuoc, setCacBuoc] = useState<BuocThucHien[]>(init.cacBuoc);
  const [ghiChuPhu, setGhiChuPhu] = useState(init.ghiChuPhu);
  const [nhapBuocMoi, setNhapBuocMoi] = useState("");
  const [dangChiaBuoc, setDangChiaBuoc] = useState(false);
  const [loiChiaBuoc, setLoiChiaBuoc] = useState<string | null>(null);
  const inputThemBuocRef = useRef<HTMLInputElement>(null);

  const [xemDayDu, setXemDayDu] = useState(false);
  const id = useId();

  const NGAN = 160;
  const quaDai = original.trim().length > NGAN;
  const trichDan = xemDayDu || !quaDai ? original.trim() : original.trim().slice(0, NGAN) + "…";
  const daQua = draft.deadline ? new Date(draft.deadline).getTime() < Date.now() : false;

  function themBuoc() {
    const nd = nhapBuocMoi.trim();
    if (!nd) return;
    setCacBuoc((prev) => [...prev, { xong: false, noiDung: nd }]);
    setNhapBuocMoi("");
    inputThemBuocRef.current?.focus();
  }

  function suaNoiDungBuoc(idx: number, nd: string) {
    setCacBuoc((prev) => prev.map((b, i) => (i === idx ? { ...b, noiDung: nd } : b)));
  }

  function toggleBuoc(idx: number) {
    setCacBuoc((prev) => prev.map((b, i) => (i === idx ? { ...b, xong: !b.xong } : b)));
  }

  function xoaBuoc(idx: number) {
    setCacBuoc((prev) => prev.filter((_, i) => i !== idx));
  }

  function diChuyenBuoc(tuIdx: number, sangIdx: number) {
    if (sangIdx < 0 || sangIdx >= cacBuoc.length) return;
    setCacBuoc((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(tuIdx, 1);
      copy.splice(sangIdx, 0, item);
      return copy;
    });
  }

  async function chiaBuocAI() {
    if (dangChiaBuoc || !draft.title.trim()) return;
    setDangChiaBuoc(true);
    setLoiChiaBuoc(null);
    try {
      const res = await fetch("/api/tasks/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          deadline: draft.deadline,
          notes: ghiChuPhu
        })
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const data = await res.json();
      const stepsMoi: string[] = data.steps ?? [];
      if (stepsMoi.length > 0) {
        setCacBuoc((prev) => [
          ...prev,
          ...stepsMoi.map((s) => ({ xong: false, noiDung: s }))
        ]);
      }
    } catch (e: any) {
      setLoiChiaBuoc(loiThanThien(e));
    } finally {
      setDangChiaBuoc(false);
    }
  }

  function handleXacNhan() {
    const checklist = cacBuoc
      .filter((b) => b.noiDung.trim())
      .map((b) => `- [${b.xong ? "x" : " "}] ${b.noiDung.trim()}`)
      .join("\n");
    const notesFinal = [ghiChuPhu.trim(), checklist].filter(Boolean).join("\n\n");
    onConfirm({
      ...draft,
      notes: notesFinal
    });
  }

  return (
    <div style={{ background: "var(--navy-2)", border: "1px solid var(--amber)", borderRadius: 16, padding: 20 }}>
      <div className="mono" style={{ fontSize: 11, color: "var(--slate)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {dungAI ? `${TEN_TRO_LY} đề xuất, anh duyệt trước khi lưu` : "Đọc bằng quy tắc, anh duyệt trước khi lưu"}
      </div>

      {/* AI hỏng nên phải dùng lớp dự phòng: nói thẳng để anh soi kỹ hơn */}
      {ghiChuDuPhong && (
        <p
          role="status"
          style={{
            fontSize: 12.5,
            color: "var(--coral)",
            background: "rgba(222, 121, 100, 0.1)",
            border: "1px solid var(--coral)",
            borderRadius: 8,
            padding: "8px 10px",
            margin: "0 0 10px"
          }}
        >
          {ghiChuDuPhong}
        </p>
      )}

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
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            style={inputStyle}
          >
            {(danhMuc && danhMuc.length > 0 ? danhMuc : DANH_MUC_MAC_DINH).map((m) => (
              <option key={m.id} value={m.id}>
                {m.ten}
              </option>
            ))}
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
          {draft.deadline && (
            <p style={{ fontSize: 11.5, color: daQua ? "var(--coral)" : "var(--slate)", margin: "4px 0 0" }}>
              {daQua ? "Đã qua: " : "Tức là "}
              {ngayVN(draft.deadline)}
            </p>
          )}
        </div>
      </div>

      {/* Khu vực tạo và quản lý từng bước thực hiện */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6 }}>
        <label htmlFor={`${id}-buoc-moi`} style={{ ...fieldLabel, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          Các bước thực hiện
          {cacBuoc.length > 0 && (
            <span style={{ color: "var(--teal)", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
              ({cacBuoc.length} bước)
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={chiaBuocAI}
          disabled={dangChiaBuoc || !draft.title.trim()}
          title={`Nhờ ${TEN_TRO_LY} gợi ý chia việc thành các bước`}
          style={{
            background: "transparent",
            border: "1px solid var(--amber)",
            borderRadius: 6,
            color: "var(--amber)",
            fontSize: 11.5,
            padding: "4px 9px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            opacity: dangChiaBuoc || !draft.title.trim() ? 0.5 : 1
          }}
        >
          {dangChiaBuoc ? <span className="spinner" aria-hidden="true" style={{ width: 11, height: 11 }} /> : <IcSpark size={11} />}
          {dangChiaBuoc ? "Đang chia…" : "Gợi ý bước bằng AI"}
        </button>
      </div>

      {loiChiaBuoc && (
        <p role="alert" style={{ color: "var(--coral)", fontSize: 12, margin: "0 0 6px" }}>
          {loiChiaBuoc}
        </p>
      )}

      {cacBuoc.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8, maxHeight: 220, overflowY: "auto" }}>
          {cacBuoc.map((b, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--field)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "6px 8px"
              }}
            >
              <input
                type="checkbox"
                checked={b.xong}
                onChange={() => toggleBuoc(idx)}
                aria-label={`Đánh dấu bước ${idx + 1}`}
                style={{
                  accentColor: "var(--teal)",
                  width: 15,
                  height: 15,
                  cursor: "pointer",
                  flexShrink: 0
                }}
              />
              <input
                value={b.noiDung}
                onChange={(e) => suaNoiDungBuoc(idx, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    inputThemBuocRef.current?.focus();
                  }
                }}
                placeholder={`Bước ${idx + 1}...`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  color: b.xong ? "var(--slate)" : "var(--cream)",
                  textDecoration: b.xong ? "line-through" : "none",
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                  outline: "none"
                }}
              />
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => diChuyenBuoc(idx, idx - 1)}
                title={idx === 0 ? "Đã ở vị trí đầu" : "Chuyển lên"}
                aria-label={`Chuyển bước ${idx + 1} lên`}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--slate)",
                  cursor: idx === 0 ? "not-allowed" : "pointer",
                  opacity: idx === 0 ? 0.25 : 0.75,
                  padding: "3px 4px",
                  display: "inline-flex"
                }}
              >
                <IcArrowUp size={13} />
              </button>
              <button
                type="button"
                disabled={idx === cacBuoc.length - 1}
                onClick={() => diChuyenBuoc(idx, idx + 1)}
                title={idx === cacBuoc.length - 1 ? "Đã ở vị trí cuối" : "Chuyển xuống"}
                aria-label={`Chuyển bước ${idx + 1} xuống`}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--slate)",
                  cursor: idx === cacBuoc.length - 1 ? "not-allowed" : "pointer",
                  opacity: idx === cacBuoc.length - 1 ? 0.25 : 0.75,
                  padding: "3px 4px",
                  display: "inline-flex"
                }}
              >
                <IcArrowDown size={13} />
              </button>
              <button
                type="button"
                onClick={() => xoaBuoc(idx)}
                title="Xóa bước này"
                aria-label={`Xóa bước: ${b.noiDung || idx + 1}`}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--slate)",
                  cursor: "pointer",
                  padding: "3px 6px",
                  fontSize: 13,
                  lineHeight: 1
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--coral)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--slate)")}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ô nhập nhanh từng bước */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          id={`${id}-buoc-moi`}
          ref={inputThemBuocRef}
          value={nhapBuocMoi}
          onChange={(e) => setNhapBuocMoi(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              themBuoc();
            }
          }}
          placeholder="Thêm bước cần làm... (nhấn Enter để thêm)"
          style={{
            ...inputStyle,
            fontSize: 13,
            padding: "8px 10px"
          }}
        />
        <button
          type="button"
          onClick={themBuoc}
          disabled={!nhapBuocMoi.trim()}
          style={{
            background: nhapBuocMoi.trim() ? "var(--amber)" : "transparent",
            color: nhapBuocMoi.trim() ? "var(--navy)" : "var(--slate)",
            border: `1px solid ${nhapBuocMoi.trim() ? "var(--amber)" : "var(--line)"}`,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            minHeight: 38,
            cursor: nhapBuocMoi.trim() ? "pointer" : "default",
            flexShrink: 0,
            whiteSpace: "nowrap"
          }}
        >
          + Thêm bước
        </button>
      </div>

      {/* Ghi chú phụ, đường link */}
      <label htmlFor={`${id}-notes`} style={{ ...fieldLabel, marginTop: 14 }}>
        Ghi chú thêm, đường link
        {ghiChuPhu && (
          <span style={{ color: "var(--slate)", textTransform: "none", letterSpacing: 0 }}>
            {" "}
            · {ghiChuPhu.length} ký tự
          </span>
        )}
      </label>
      <textarea
        id={`${id}-notes`}
        value={ghiChuPhu}
        onChange={(e) => setGhiChuPhu(e.target.value)}
        rows={3}
        placeholder="Dán đường link tài liệu, người liên quan, ghi chú thêm..."
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontSize: 13 }}
      />

      <fieldset style={{ border: "none", padding: 0, margin: "14px 0" }}>
        <legend className="sr-only">Mức ưu tiên</legend>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <ToggleField label="Khẩn cấp" value={draft.urgent} onChange={(v) => setDraft({ ...draft, urgent: v })} color="var(--coral)" />
          <ToggleField label="Quan trọng" value={draft.important} onChange={(v) => setDraft({ ...draft, important: v })} color="var(--teal)" />
        </div>
      </fieldset>

      {suggestion.reasoning && (
        <p style={{ fontSize: 12.5, color: "var(--slate)", background: "var(--field)", padding: "8px 10px", borderRadius: 8 }}>
          <IcSpark size={11} style={{ marginRight: 6 }} />
          {suggestion.reasoning}
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
          onClick={handleXacNhan}
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
