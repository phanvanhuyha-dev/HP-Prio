"use client";
import { useCallback, useEffect, useState } from "react";
import { docLoi, loiThanThien, ngayVN } from "@/lib/client-api";
import type { Task } from "./TaskList";

const SO_NGAY_GIU = 30;

// Còn bao nhiêu ngày nữa thì bị dọn hẳn.
function conLaiNgay(deletedAt: string | null | undefined): number {
  if (!deletedAt) return SO_NGAY_GIU;
  const troi = (Date.now() - new Date(deletedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(SO_NGAY_GIU - troi));
}

export default function TrashPanel({
  soLuong,
  moiLamMoi,
  onKhoiPhuc
}: {
  soLuong: number;
  moiLamMoi: number;
  onKhoiPhuc: () => void;
}) {
  const [items, setItems] = useState<Task[]>([]);
  const [mo, setMo] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      const res = await fetch("/api/tasks?status=deleted");
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
    } finally {
      setDangTai(false);
    }
  }, []);

  // Chỉ tải danh sách khi người dùng thật sự bung panel. Số lượng đã có sẵn từ
  // lần tải danh sách chính nên không cần gọi trước.
  useEffect(() => {
    if (mo) tai();
  }, [tai, mo, moiLamMoi]);

  async function goi(url: string, init: RequestInit, apDung: (prev: Task[]) => Task[]) {
    const truoc = items;
    setItems(apDung);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(await docLoi(res));
      onKhoiPhuc();
    } catch (e: any) {
      setItems(truoc);
      setError(loiThanThien(e));
    }
  }

  function khoiPhuc(t: Task) {
    return goi(
      `/api/tasks/${t.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" })
      },
      (prev) => prev.filter((x) => x.id !== t.id)
    );
  }

  function xoaHan(t: Task) {
    if (!window.confirm(`Xóa vĩnh viễn “${t.title}”?\n\nKhông khôi phục lại được nữa.`)) return;
    return goi(
      `/api/tasks/${t.id}?vinhVien=1`,
      { method: "DELETE" },
      (prev) => prev.filter((x) => x.id !== t.id)
    );
  }

  // Không có gì trong thùng rác thì không chiếm chỗ trên giao diện.
  if (soLuong === 0 && items.length === 0 && !error) return null;

  return (
    <section style={{ marginTop: 26 }} aria-labelledby="tieu-de-thung-rac">
      <button
        onClick={() => setMo((v) => !v)}
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
        <span id="tieu-de-thung-rac" style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--cream)" }}>
          Thùng rác
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
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12.5, color: "var(--slate)", margin: "0 0 10px" }}>
            Việc đã xóa được giữ {SO_NGAY_GIU} ngày rồi tự dọn hẳn.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((t) => {
              const conLai = conLaiNgay(t.deleted_at);
              return (
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
                    <div style={{ fontSize: 13.5, color: "var(--cream)", lineHeight: 1.35 }}>{t.title}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--slate)", marginTop: 3 }}>
                      Xóa lúc {ngayVN(t.deleted_at ?? null)} · còn {conLai} ngày
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => khoiPhuc(t)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--teal)",
                        color: "var(--teal)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 12.5,
                        fontWeight: 600,
                        minHeight: 44
                      }}
                    >
                      Khôi phục
                    </button>
                    <button
                      onClick={() => xoaHan(t)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--line)",
                        color: "var(--slate)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 12.5,
                        minHeight: 44
                      }}
                    >
                      Xóa hẳn
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {dangTai && (
            <p className="sr-only" aria-live="polite">
              Đang tải thùng rác
            </p>
          )}
        </div>
      )}
    </section>
  );
}
