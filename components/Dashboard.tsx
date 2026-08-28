"use client";
import { useEffect, useState, useCallback } from "react";
import { signOut } from "next-auth/react";
import TaskInput from "./TaskInput";
import QuadrantBoard, { type Task } from "./QuadrantBoard";
import AnalysisPanel from "./AnalysisPanel";
import PushSetup from "./PushSetup";

export default function Dashboard({ userName }: { userName: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?status=open");
      if (res.status === 401) {
        // Phiên đăng nhập hết hạn, đưa về trang đăng nhập thay vì hiện màn hình trống.
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Không tải được danh sách công việc");
      setTasks(data.tasks || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Không kết nối được máy chủ");
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Thao tác không thành công");
      }
    } catch (e: any) {
      await loadTasks();
      setError(e?.message || "Không kết nối được máy chủ");
    }
  }

  function handleDone(id: string) {
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
    return mutate(
      (prev) => prev.filter((t) => t.id !== id),
      () => fetch(`/api/tasks/${id}`, { method: "DELETE" })
    );
  }

  function handleReclassify(id: string, patch: { userUrgent?: boolean; userImportant?: boolean }) {
    return mutate(
      (prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                user_urgent: patch.userUrgent ?? t.user_urgent,
                user_important: patch.userImportant ?? t.user_important
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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 60px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--teal)", letterSpacing: "0.12em" }}>
            HPPRIO
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "2px 0 0", color: "var(--cream)" }}>
            Chào {userName.split(" ")[0] || userName}
          </h1>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 12 }}
        >
          Đăng xuất
        </button>
      </header>

      <div style={{ marginBottom: 18 }}>
        <PushSetup />
      </div>

      <TaskInput onSaved={loadTasks} />

      {error && (
        <p
          role="alert"
          style={{
            color: "var(--coral)",
            fontSize: 13,
            marginTop: 12,
            background: "rgba(217, 99, 75, 0.1)",
            border: "1px solid var(--coral)",
            borderRadius: 8,
            padding: "8px 12px"
          }}
        >
          {error}
        </p>
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
