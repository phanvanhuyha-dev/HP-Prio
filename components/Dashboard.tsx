"use client";
import { useEffect, useState, useCallback } from "react";
import { signOut } from "next-auth/react";
import { docLoi, loiThanThien } from "@/lib/client-api";
import TaskInput from "./TaskInput";
import QuadrantBoard, { type Task } from "./QuadrantBoard";
import AnalysisPanel from "./AnalysisPanel";
import PushSetup from "./PushSetup";

export default function Dashboard({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daLuu, setDaLuu] = useState<string | null>(null);
  const [hoanTac, setHoanTac] = useState<{ task: Task; loai: "xong" | "xoa" } | null>(null);

  function handleSaved(tieuDe: string) {
    setDaLuu(tieuDe);
    setTimeout(() => setDaLuu(null), 4000);
    loadTasks();
  }

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?status=open");
      if (res.status === 401) {
        // Phiên đăng nhập hết hạn, đưa về trang đăng nhập thay vì hiện màn hình trống.
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      const data = await res.json();
      setTasks(data.tasks || []);
      // Tải lại thành công thì lỗi cũ không còn đúng nữa, phải xóa đi.
      setError(null);
    } catch (e: any) {
      setError(loiThanThien(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Cập nhật lạc quan: đổi giao diện trước cho mượt. Khi máy chủ báo lỗi thì tải lại
  // danh sách từ server thay vì khôi phục snapshot: snapshot chụp trước request có thể
  // ghi đè một thao tác khác đã thành công trong lúc request này đang chạy.
  async function mutate(apply: (prev: Task[]) => Task[], request: () => Promise<Response>) {
    setTasks(apply);
    setError(null);
    try {
      const res = await request();
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
    } catch (e: any) {
      await loadTasks();
      setError(loiThanThien(e));
    }
  }

  // --- Hoàn tác -----------------------------------------------------------
  // "Xong" đảo ngược được ngay vì dữ liệu chỉ đổi trạng thái, không mất đi.
  function hoanTacXong(task: Task) {
    setHoanTac(null);
    return mutate(
      (prev) => (prev.some((t) => t.id === task.id) ? prev : [task, ...prev]),
      () =>
        fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" })
        })
    );
  }

  // Xóa nay là XÓA MỀM ở phía máy chủ: việc chuyển sang trạng thái 'deleted'
  // và được dọn hẳn sau 30 ngày. Nhờ vậy hoàn tác không còn phụ thuộc vào một
  // đồng hồ đếm ngược trong trình duyệt: đóng tab rồi vẫn khôi phục được.
  function xoaCoHoanTac(task: Task) {
    setHoanTac({ task, loai: "xoa" });
    setTimeout(() => setHoanTac((h) => (h?.task.id === task.id ? null : h)), 8000);
    return mutate(
      (prev) => prev.filter((t) => t.id !== task.id),
      () => fetch(`/api/tasks/${task.id}`, { method: "DELETE" })
    );
  }

  function khoiPhuc(task: Task) {
    setHoanTac(null);
    return mutate(
      (prev) => (prev.some((t) => t.id === task.id) ? prev : [task, ...prev]),
      () =>
        fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" })
        })
    );
  }

  function handleDone(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      setHoanTac({ task, loai: "xong" });
      setTimeout(() => setHoanTac((h) => (h?.task.id === id ? null : h)), 8000);
    }
    return mutate(
      (prev) => prev.filter((t) => t.id !== id),
      () =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" })
        })
    );
  }

  function handleDelete(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) xoaCoHoanTac(task);
  }

  function handleReclassify(
    id: string,
    patch: { userUrgent?: boolean; userImportant?: boolean; notes?: string | null }
  ) {
    return mutate(
      (prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                user_urgent: patch.userUrgent ?? t.user_urgent,
                user_important: patch.userImportant ?? t.user_important,
                // notes có thể là null (xóa trắng) nên phải dùng "in", không dùng ??
                notes: "notes" in patch ? patch.notes ?? null : t.notes
              }
            : t
        ),
      () =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        })
    );
  }

  return (
    // 720px cố định để trống 44% màn hình ở 1280px và làm tiêu đề việc gãy nhiều
    // dòng. Cho khung rộng tới 1040px trên màn lớn, mobile vẫn giữ nguyên.
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px 60px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--teal)", letterSpacing: "0.12em" }}>
            HPPRIO
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "2px 0 0", color: "var(--cream)" }}>
            Chào {userName.split(" ")[0] || userName}
          </h1>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            background: "none",
            border: "none",
            color: "var(--slate)",
            fontSize: 13,
            minHeight: 44,
            padding: "0 4px"
          }}
        >
          Đăng xuất
        </button>
      </header>

      <div style={{ marginBottom: 18 }}>
        <PushSetup />
      </div>

      <TaskInput onSaved={handleSaved} />

      {/* Trước đây lưu xong không có xác nhận nào, người dùng phải tự dò trong
          ma trận xem việc đã vào chưa. */}
      {daLuu && (
        <p
          role="status"
          style={{
            color: "var(--teal)",
            fontSize: 13,
            marginTop: 12,
            marginBottom: 0,
            background: "rgba(90, 163, 148, 0.12)",
            border: "1px solid var(--teal)",
            borderRadius: 8,
            padding: "8px 12px"
          }}
        >
          ✓ Đã lưu “{daLuu}”
        </p>
      )}

      {/* Băng hoàn tác cho "xong" và "xóa" */}
      {hoanTac && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 12,
            background: "var(--navy-2)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "8px 12px"
          }}
        >
          <span style={{ fontSize: 13, color: "var(--cream)" }}>
            {hoanTac.loai === "xong" ? "Đã đánh dấu xong" : "Đã xóa"} “{hoanTac.task.title}”
          </span>
          <button
            onClick={() => (hoanTac.loai === "xong" ? hoanTacXong(hoanTac.task) : khoiPhuc(hoanTac.task))}
            style={{
              background: "transparent",
              border: "1px solid var(--amber)",
              color: "var(--amber)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              minHeight: 40,
              flexShrink: 0
            }}
          >
            Hoàn tác
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 12,
            background: "rgba(222, 121, 100, 0.12)",
            border: "1px solid var(--coral)",
            borderRadius: 8,
            padding: "8px 12px"
          }}
        >
          <span style={{ color: "var(--coral)", fontSize: 13 }}>{error}</span>
          {/* Lỗi cũ treo mãi ở đầu trang là sai. Cho đóng được. */}
          <button
            onClick={() => setError(null)}
            aria-label="Đóng thông báo lỗi"
            className="tap"
            style={{ background: "none", border: "none", color: "var(--coral)", fontSize: 14, margin: -10, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ marginTop: 26, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--cream)", margin: 0 }}>
          Ma trận ưu tiên
        </h2>
        <span className="mono" style={{ fontSize: 11, color: "var(--slate)" }}>{tasks.length} việc mở</span>
      </div>

      {loading ? (
        <p style={{ color: "var(--slate)" }}>Đang tải…</p>
      ) : (
        <QuadrantBoard
          tasks={tasks}
          onDone={handleDone}
          onDelete={handleDelete}
          onReclassify={handleReclassify}
        />
      )}

      <AnalysisPanel />
    </main>
  );
}
