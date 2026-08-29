"use client";
import { useEffect, useRef, useState } from "react";
import { docLoi, loiThanThien } from "@/lib/client-api";

type Analysis = {
  summary: string;
  recommendations: string[];
  risks: string[];
};

// Đo thực tế: 1 việc ~2.4s, 20 việc ~6.4s, ngoại suy 40-50 việc có thể 10-15s.
// Giữ 60s để không cắt nhầm khi tồn đọng nhiều việc.
const HAN_CHO_MS = 60000;

export default function AnalysisPanel() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [giay, setGiay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Xem chú thích ở TaskInput: disabled chỉ có hiệu lực sau khi render lại,
  // useRef chặn được ngay cả khi hai cú bấm rơi vào cùng một chu kỳ.
  const dangChayRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!loading) return setGiay(0);
    const t = setInterval(() => setGiay((g) => g + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  async function run() {
    if (dangChayRef.current) return;
    dangChayRef.current = true;
    setLoading(true);
    setError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let doHetGio = false;
    const hetGio = setTimeout(() => {
      doHetGio = true;
      ctrl.abort();
    }, HAN_CHO_MS);

    try {
      const res = await fetch("/api/analyze", { signal: ctrl.signal });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      setAnalysis(await res.json());
    } catch (e: any) {
      setAnalysis(null);
      setError(loiThanThien(doHetGio ? Object.assign(e ?? {}, { quaHan: true }) : e));
    } finally {
      clearTimeout(hetGio);
      abortRef.current = null;
      dangChayRef.current = false;
      setLoading(false);
    }
  }

  return (
    <section style={{ marginTop: 22 }} aria-labelledby="tieu-de-phan-tich">
      <h2 id="tieu-de-phan-tich" className="sr-only">
        Phân tích và khuyến nghị
      </h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid var(--teal)",
            color: "var(--teal)",
            borderRadius: 10,
            padding: "11px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading && <span className="spinner" aria-hidden="true" />}
          {loading ? `Đang phân tích ${giay}s` : "📊 Phân tích & khuyến nghị"}
        </button>

        {/* Đồng bộ với nút Phân tích với AI: cũng phải dừng được giữa chừng. */}
        {loading && (
          <button
            onClick={() => abortRef.current?.abort()}
            style={{
              background: "transparent",
              color: "var(--coral)",
              border: "1px solid var(--coral)",
              borderRadius: 10,
              padding: "11px 16px",
              fontSize: 13,
              minHeight: 44
            }}
          >
            Dừng
          </button>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {loading ? `Đang phân tích, đã chờ ${giay} giây` : analysis ? "Đã có kết quả phân tích" : ""}
      </p>

      {loading && (
        <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 10, marginBottom: 0 }}>
          Việc càng nhiều thì càng lâu: vài việc mất 2 đến 3 giây, khoảng 20 việc mất 5 đến 8 giây.
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--coral)", fontSize: 13, marginTop: 12 }}>
          {error}
        </p>
      )}

      {analysis && (
        <div
          style={{
            marginTop: 14,
            background: "var(--navy-2)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 18
          }}
        >
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--cream)" }}>{analysis.summary}</p>

          {analysis.recommendations?.length > 0 && (
            <>
              <h3 className="mono" style={{ fontSize: 11.5, color: "var(--teal)", margin: "14px 0 0", textTransform: "uppercase" }}>
                Khuyến nghị
              </h3>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {analysis.recommendations.map((r, i) => (
                  <li key={i} style={{ fontSize: 13.5, marginBottom: 6, color: "var(--cream)" }}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {analysis.risks?.length > 0 && (
            <>
              <h3 className="mono" style={{ fontSize: 11.5, color: "var(--coral)", margin: "14px 0 0", textTransform: "uppercase" }}>
                Rủi ro
              </h3>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {analysis.risks.map((r, i) => (
                  <li key={i} style={{ fontSize: 13.5, marginBottom: 6, color: "var(--cream)" }}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
