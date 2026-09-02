"use client";
import { useCallback, useEffect, useState } from "react";
import { docLoi, loiThanThien, ngayVN } from "@/lib/client-api";
import type { Task } from "./TaskList";

// Màn hình việc đã xong. Không có nơi xem lại thì bấm nhầm dấu ✓ là mất dấu
// vĩnh viễn, dù dữ liệu vẫn nằm nguyên trong database.
export default function DonePanel({
  soLuong,
  moiLamMoi,
  onDoiTrangThai,
  onDoiMo
}: {
  soLuong: number;
  moiLamMoi: number;
  onDoiTrangThai: () => void;
  // Báo lên Dashboard để nút nổi tự ẩn, kẻo nó đè lên các nút trong danh sách
  onDoiMo?: (mo: boolean) => void;
}) {
  const [items, setItems] = useState<Task[]>([]);
  const [mo, setMo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tai = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?status=done");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const data = await res.json();
      setItems(data.tasks || []);
      setError(null);
    } catch (e: any) {
      setError(loiThanThien(e));
    }
  }, []);

  // Chỉ tải danh sách khi người dùng thật sự bung panel. Số lượng đã có sẵn từ
  // lần tải danh sách chính nên không cần gọi trước.
  useEffect(() => {
    if (mo) tai();
  }, [tai, mo, moiLamMoi]);

  async function moLai(t: Task) {
    const truoc = items;
    setItems((prev) => prev.filter((x) => x.id !== t.id));
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" })
      });
      if (!res.ok) throw new Error(await docLoi(res));
      onDoiTrangThai();
    } catch (e: any) {
      setItems(truoc);
      setError(loiThanThien(e));
    }
  }

  if (soLuong === 0 && items.length === 0 && !error) return null;

  return (
    <section style={{ marginTop: 22 }} aria-labelledby="tieu-de-da-xong">
      <button
        onClick={() =>
          setMo((v) => {
            onDoiMo?.(!v);
            return !v;
          })
        }
        aria-expanded={mo}
        style={{
          background: "none",
          border: "none",
          padding: "8px 0",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--slate)",
          fontSize: 13.5
        }}
      >
        <span id="tieu-de-da-xong" style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--cream)" }}>
          ✓ Đã xong
        </span>
        <span className="mono" style={{ fontSize: 11.5 }}>
          {mo ? items.length : soLuong} việc · {mo ? "thu gọn" : "xem"}
        </span>
      </button>

      {error && (
        <p role="alert" style={{ color: "var(--coral)", fontSize: 13, margin: "4px 0 0" }}>
          {error}
        </p>
      )}

      {mo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {items.map((t) => (
            <div
              key={t.id}
              style={{
                background: "var(--navy-2)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap"
              }}
            >
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div className="viec-tieu-de" style={{ fontSize: 13.5, color: "var(--cream)", lineHeight: 1.35 }}>
                  {t.title}
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--slate)", marginTop: 3 }}>
                  {t.category === "work" ? "Cơ quan" : "Cá nhân"}
                  {t.deadline ? ` · hạn ${ngayVN(t.deadline)}` : ""}
                </div>
              </div>
              <button
                onClick={() => moLai(t)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--teal)",
                  color: "var(--teal)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  minHeight: 44,
                  flexShrink: 0
                }}
              >
                Mở lại
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
