"use client";
import { useState } from "react";

type Analysis = {
  summary: string;
  recommendations: string[];
  risks: string[];
};

export default function AnalysisPanel() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze");
      const data = await res.json();
      // Trước đây lỗi 500 vẫn được gán vào analysis, làm hiện ra một khung trắng không nội dung.
      if (!res.ok) throw new Error(data?.error || "Không phân tích được lúc này");
      setAnalysis(data);
    } catch (e: any) {
      setAnalysis(null);
      setError(e?.message || "Không kết nối được máy chủ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 22 }}>
      <button
        onClick={run}
        disabled={loading}
        style={{
          background: "transparent",
          border: "1px solid var(--teal)",
          color: "var(--teal)",
          borderRadius: 10,
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 600
        }}
      >
        {loading ? "Đang phân tích…" : "📊 Phân tích & khuyến nghị"}
      </button>

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
              <div className="mono" style={{ fontSize: 11, color: "var(--teal)", marginTop: 14, textTransform: "uppercase" }}>
                Khuyến nghị
              </div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {analysis.recommendations.map((r, i) => (
                  <li key={i} style={{ fontSize: 13.5, marginBottom: 6, color: "var(--cream)" }}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {analysis.risks?.length > 0 && (
            <>
              <div className="mono" style={{ fontSize: 11, color: "var(--coral)", marginTop: 14, textTransform: "uppercase" }}>
                Rủi ro
              </div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {analysis.risks.map((r, i) => (
                  <li key={i} style={{ fontSize: 13.5, marginBottom: 6, color: "var(--cream)" }}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
