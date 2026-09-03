"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { docLoi, loiThanThien } from "@/lib/client-api";
import { TEN_TRO_LY_MAC_DINH } from "@/lib/branding";
import TaskInput from "./TaskInput";
import TaskList, { type Task } from "./TaskList";
import TrashPanel from "./TrashPanel";
import DonePanel from "./DonePanel";
import FocusMode, { docPhienDangDo, xoaPhienDangDo, type PhienTapTrung } from "./FocusMode";
import MiniFocusBar from "./MiniFocusBar";
import NhinLai from "./NhinLai";
import CalendarStrip from "./CalendarStrip";
import ReflectionLog from "./ReflectionLog";
import CaiDat from "./CaiDat";
import { TroLyProvider } from "./TroLy";
import { IcSpark, IcSun, IcMoon, IcList, IcChart, IcJournal, IcCaiDat } from "./icons";

const THU_VN = ["CHỦ NHẬT", "THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY"];

export default function Dashboard({ userName, email }: { userName: string; email: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daLuu, setDaLuu] = useState<string | null>(null);
  const [hoanTac, setHoanTac] = useState<{ task: Task; loai: "xong" | "xoa" } | null>(null);
  // Tăng lên mỗi khi danh sách chính đổi, để Thùng rác tải lại theo.
  const [nhipLamMoi, setNhipLamMoi] = useState(0);
  const [dem, setDem] = useState<Record<string, number>>({ open: 0, done: 0, deleted: 0 });

  // Bộ lọc và sắp xếp nhanh, chạy ngay trên danh sách đã tải nên không tốn request.
  const [tuKhoa, setTuKhoa] = useState("");
  const [nhan, setNhan] = useState<"tat-ca" | "work" | "personal">("tat-ca");
  const [sapXep, setSapXep] = useState<"uu-tien" | "han-chot" | "moi-nhat">("uu-tien");

  // Khung nhập việc nay nằm sau nút nổi "Bé iu", không chiếm màn hình chính nữa.
  const [moBeIu, setMoBeIu] = useState(false);

  // Ba tab, mỗi tab một việc để không tab nào thành trang dài phải kéo:
  // Hôm nay (làm việc), Nhật ký (ghi cuối ngày), Nhìn lại (thống kê).
  const [tab, setTab] = useState<"homnay" | "nhatky" | "nhinlai">("homnay");

  // Phiên tập trung thu nhỏ: FocusMode vẫn mount (đồng hồ chạy tiếp), chỉ ẩn
  // giao diện và hiện thanh mini ở đáy.
  const [focusThuNho, setFocusThuNho] = useState(false);

  // Ngày giờ, tên gọi tùy chỉnh và giao diện sáng/tối: đọc sau khi mount để
  // không lệch giữa bản render trên máy chủ và trên máy người dùng.
  const [ngayHomNay, setNgayHomNay] = useState("");
  const [tenGoi, setTenGoi] = useState("");
  const [giaoDien, setGiaoDien] = useState<"dark" | "light">("dark");
  // Cài đặt gom về một chỗ: tên gọi, tên trợ lý, lịch họp, nhắc deadline, thoát
  const [moCaiDat, setMoCaiDat] = useState(false);
  // Mục Đã xong hoặc Thùng rác đang bung: ẩn nút nổi để nó không đè lên các
  // nút thao tác nằm trong đó.
  const [panelMo, setPanelMo] = useState(false);
  const [lamMoiLich, setLamMoiLich] = useState(0);
  const [tenTroLy, setTenTroLy] = useState(TEN_TRO_LY_MAC_DINH);
  useEffect(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    setNgayHomNay(`${THU_VN[d.getDay()]}, ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`);
    try {
      setTenGoi(localStorage.getItem("hpprio-ten") ?? "");
      if (localStorage.getItem("hpprio-theme") === "light") setGiaoDien("light");
    } catch {}

    // Quay về từ màn hình cấp quyền của Microsoft: báo kết quả rồi dọn sạch
    // tham số khỏi thanh địa chỉ, để tải lại trang không hiện báo cũ.
    const q = new URLSearchParams(window.location.search);
    const ms = q.get("ms");
    if (ms) {
      const ghiChu = q.get("ghiChu") ?? "";
      if (ms === "ok") {
        setDaLuu(ghiChu || "Đã nối lịch Microsoft");
        setTimeout(() => setDaLuu(null), 5000);
        setLamMoiLich((v) => v + 1);
      } else {
        setError(ghiChu || "Không nối được lịch Microsoft");
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function doiGiaoDien() {
    const moi = giaoDien === "dark" ? "light" : "dark";
    setGiaoDien(moi);
    if (moi === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("hpprio-theme", moi);
    } catch {}
  }

  // Chế độ tập trung: lưu id để luôn đọc bản task MỚI NHẤT từ danh sách
  // (đánh dấu checklist trong lúc tập trung cần thấy thay đổi ngay).
  const [focusId, setFocusId] = useState<string | null>(null);
  const [phienKhoiPhuc, setPhienKhoiPhuc] = useState<PhienTapTrung | null>(null);
  const daKiemTraPhien = useRef(false);

  // App bị đóng giữa phiên tập trung (chuyện thường với PWA trên iOS) thì mở
  // lại tiếp tục đúng chỗ, nhờ phiên đã lưu trong localStorage.
  useEffect(() => {
    if (loading || daKiemTraPhien.current) return;
    daKiemTraPhien.current = true;
    const p = docPhienDangDo();
    if (!p) return;
    if (tasks.some((t) => t.id === p.taskId)) {
      setPhienKhoiPhuc(p);
      setFocusId(p.taskId);
    } else {
      // Việc đã xong hoặc đã xóa trong lúc vắng mặt thì phiên không còn nghĩa
      xoaPhienDangDo();
    }
  }, [loading, tasks]);

  // Khóa cuộn trang nền khi có lớp phủ, không thì trên iOS nền vẫn trượt theo.
  // Phiên tập trung thu nhỏ thì KHÔNG khóa: người dùng đang cần cuộn danh sách.
  useEffect(() => {
    if (!moBeIu && !(focusId && !focusThuNho)) return;
    const cu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = cu;
    };
  }, [moBeIu, focusId, focusThuNho]);

  useEffect(() => {
    const dong = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoBeIu(false);
    };
    window.addEventListener("keydown", dong);
    return () => window.removeEventListener("keydown", dong);
  }, []);

  // Lỗi WebKit nổi tiếng trên iOS: sau khi bàn phím đóng, các phần tử
  // position:fixed neo đáy (thanh điều hướng, nút Bé iu) bị treo lơ lửng đúng
  // bằng khoảng bàn phím cho tới cú cuộn kế tiếp. Nghe visualViewport: khi
  // viewport trở về đúng cỡ màn hình thì hích cuộn 1px để WebKit neo lại.
  useEffect(() => {
    const vv = (window as any).visualViewport;
    if (!vv) return;
    const neoLai = () => {
      if (Math.abs(vv.height + vv.offsetTop - window.innerHeight) < 2) {
        window.scrollBy(0, 1);
        window.scrollBy(0, -1);
      }
    };
    vv.addEventListener("resize", neoLai);
    return () => vv.removeEventListener("resize", neoLai);
  }, []);

  // Thứ tự nhóm Eisenhower: Làm ngay -> Lên lịch -> Giao bớt -> Cân nhắc bỏ
  const thuTuNhom = (t: Task) =>
    t.user_urgent && t.user_important ? 0 : !t.user_urgent && t.user_important ? 1 : t.user_urgent ? 2 : 3;
  const mocHan = (t: Task) => (t.deadline ? new Date(t.deadline).getTime() : Number.POSITIVE_INFINITY);

  const dsHienThi = tasks
    .filter((t) => {
      if (nhan !== "tat-ca" && t.category !== nhan) return false;
      const k = tuKhoa.trim().toLowerCase();
      if (!k) return true;
      return (t.title + " " + (t.notes ?? "")).toLowerCase().includes(k);
    })
    .sort((a, b) => {
      if (sapXep === "moi-nhat") return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      if (sapXep === "han-chot") {
        // Việc không có hạn xuống cuối; cùng hạn thì xếp theo nhóm ưu tiên
        if (mocHan(a) !== mocHan(b)) return mocHan(a) - mocHan(b);
        return thuTuNhom(a) - thuTuNhom(b);
      }
      // "uu-tien": nhóm trước, trong nhóm thì hạn gần lên trên, rồi việc mới lên trên
      if (thuTuNhom(a) !== thuTuNhom(b)) return thuTuNhom(a) - thuTuNhom(b);
      if (mocHan(a) !== mocHan(b)) return mocHan(a) - mocHan(b);
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  const dangLoc = tuKhoa.trim() !== "" || nhan !== "tat-ca";
  const soLamNgay = tasks.filter((t) => t.user_urgent && t.user_important).length;
  const soQuaHan = tasks.filter((t) => t.deadline && new Date(t.deadline) < new Date()).length;

  // Quá hạn được GHIM riêng lên đầu, tách khỏi danh sách thường. Ngày đỏ lẫn
  // trong danh sách là không đủ với nỗi lo "sợ quên việc".
  const dsQuaHan = dsHienThi.filter((t) => t.deadline && new Date(t.deadline) < new Date());
  const dsBinhThuong = dsHienThi.filter((t) => !(t.deadline && new Date(t.deadline) < new Date()));

  // Điểm tin sáng: tải một lần mỗi phiên, ẩn được cho tới hết ngày
  const [brief, setBrief] = useState<string | null>(null);
  const [anBrief, setAnBrief] = useState(true);
  useEffect(() => {
    const homNay = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    try {
      if (localStorage.getItem("hpprio-brief-an") === homNay) return; // đã đóng hôm nay
    } catch {}
    setAnBrief(false);
    fetch("/api/brief")
      .then(async (r) => (r.ok ? setBrief((await r.json()).brief ?? null) : null))
      .catch(() => {});
  }, []);

  function dongBrief() {
    setAnBrief(true);
    try {
      localStorage.setItem("hpprio-brief-an", new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10));
    } catch {}
  }

  // Tra theo id để màn tập trung luôn thấy bản task mới nhất. Việc biến mất
  // khỏi danh sách (vừa đánh dấu xong, vừa xóa) thì màn tập trung tự đóng.
  const focusTask = focusId ? tasks.find((t) => t.id === focusId) ?? null : null;
  useEffect(() => {
    if (focusId && !loading && !tasks.some((t) => t.id === focusId)) {
      setFocusId(null);
      setPhienKhoiPhuc(null);
    }
  }, [focusId, loading, tasks]);

  // Bé iu hoàn tất một hành động (lưu việc, báo xong, sửa việc): đóng khung,
  // hiện thông báo, tải lại danh sách.
  function handleBeIuHoanTat(thongBao: string) {
    setMoBeIu(false);
    setDaLuu(thongBao);
    setTimeout(() => setDaLuu(null), 4000);
    loadTasks();
    setNhipLamMoi((n) => n + 1);
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
      setDem(data.counts || { open: 0, done: 0, deleted: 0 });

      if (typeof data.tenTroLy === "string" && data.tenTroLy) setTenTroLy(data.tenTroLy);

      // Tên gọi: máy chủ là nguồn chuẩn. Máy chủ chưa có mà máy này từng đặt
      // tên trong localStorage (bản cũ) thì tự đẩy lên một lần, khỏi gõ lại.
      const tenServer = typeof data.tenGoi === "string" ? data.tenGoi : "";
      if (tenServer) {
        setTenGoi(tenServer);
        try {
          localStorage.setItem("hpprio-ten", tenServer);
        } catch {}
      } else {
        let tenCu = "";
        try {
          tenCu = localStorage.getItem("hpprio-ten") ?? "";
        } catch {}
        if (tenCu) {
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenGoi: tenCu })
          }).catch(() => {});
        }
      }
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
  // demDelta: cập nhật luôn bộ đếm ở tiêu đề. Trước đây chỉ danh sách đổi
  // ngay còn bộ đếm phải đợi lần tải lại sau, nên tiêu đề ghi "2 đã xong"
  // trong khi mục Đã xong liệt kê 3 việc.
  async function mutate(
    apply: (prev: Task[]) => Task[],
    request: () => Promise<Response>,
    demDelta?: Record<string, number>
  ) {
    setTasks(apply);
    if (demDelta) {
      setDem((d) => {
        const moi = { ...d };
        for (const [k, v] of Object.entries(demDelta)) moi[k] = Math.max(0, (moi[k] ?? 0) + v);
        return moi;
      });
    }
    setError(null);
    try {
      const res = await request();
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(await docLoi(res));
      // Xóa hoặc khôi phục đều làm thùng rác đổi, báo cho nó tải lại.
      setNhipLamMoi((n) => n + 1);
    } catch (e: any) {
      // Hỏng thì tải lại từ máy chủ, vừa sửa danh sách vừa sửa lại bộ đếm
      // đã cộng trừ lạc quan ở trên.
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
        }),
      { done: -1, open: 1 }
    );
  }

  // Xóa nay là XÓA MỀM ở phía máy chủ: việc chuyển sang trạng thái 'deleted'
  // và được dọn hẳn sau 30 ngày. Nhờ vậy hoàn tác không còn phụ thuộc vào một
  // đồng hồ đếm ngược trong trình duyệt: đóng tab rồi vẫn khôi phục được.
  function xoaCoHoanTac(task: Task) {
    setHoanTac({ task, loai: "xoa" });
    setTimeout(() => setHoanTac((h) => (h?.task.id === task.id ? null : h)), 10000);
    return mutate(
      (prev) => prev.filter((t) => t.id !== task.id),
      // Hàm này chỉ được gọi từ danh sách việc đang mở, nên luôn là open -> deleted
      () => fetch(`/api/tasks/${task.id}`, { method: "DELETE" }),
      { open: -1, deleted: 1 }
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
        }),
      { deleted: -1, open: 1 }
    );
  }

  function handleDone(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      setHoanTac({ task, loai: "xong" });
      setTimeout(() => setHoanTac((h) => (h?.task.id === id ? null : h)), 10000);
    }
    return mutate(
      (prev) => prev.filter((t) => t.id !== id),
      () =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" })
        }),
      { open: -1, done: 1 }
    );
  }

  function handleDelete(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) xoaCoHoanTac(task);
  }

  function handleReclassify(
    id: string,
    patch: { title?: string; userUrgent?: boolean; userImportant?: boolean; notes?: string | null }
  ) {
    return mutate(
      (prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                title: patch.title ?? t.title,
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
    // TroLyProvider bọc cả cây để mọi component con gọi useTenTroLy() đều thấy
    // tên mới ngay khi người dùng đổi trong Cài đặt, không cần tải lại trang.
    <TroLyProvider ten={tenTroLy}>
    {/* Danh sách dọc đọc thoải mái nhất trong một cột hẹp; 1040px là di sản của
        bố cục ma trận 2x2 cũ, nay thu về 680px. */}
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 210px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          {/* Dòng ngày kiểu "THỨ HAI, 31/08/2026" theo mẫu tham chiếu */}
          <div className="mono" style={{ fontSize: 11, color: "var(--slate)", letterSpacing: "0.14em", minHeight: 15 }}>
            {ngayHomNay}
          </div>
          {/* Lời chào chỉ để đọc. Đổi tên gọi nằm trong Cài đặt: mỗi năm đổi
              một lần thì không đáng chiếm chỗ ngay cạnh dòng chào mỗi ngày. */}
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              margin: "4px 0 0",
              color: "var(--cream)",
              lineHeight: 1.25
            }}
          >
            Chào {tenGoi || userName.split(" ")[0] || userName}.
          </h1>
          {!loading && (
            <p style={{ fontSize: 14, color: soQuaHan > 0 ? "var(--coral)" : "var(--slate)", margin: "4px 0 0" }}>
              {soQuaHan > 0
                ? `Anh có ${soQuaHan} việc quá hạn${soLamNgay > 0 ? ` và ${soLamNgay} việc cần làm ngay` : ""}.`
                : soLamNgay > 0
                  ? `Anh có ${soLamNgay} việc cần làm ngay hôm nay.`
                  : tasks.length > 0
                    ? "Không có việc nào khẩn cấp, anh chủ động được lịch hôm nay."
                    : "Hôm nay chưa có việc nào."}
            </p>
          )}
        </div>

        {/* Chỉ còn hai nút: đổi giao diện (bấm thường xuyên) và Cài đặt.
            Chuông nhắc, nối lịch và đăng xuất đã dọn vào trong Cài đặt. */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <button
            onClick={doiGiaoDien}
            className="tap"
            aria-label={giaoDien === "dark" ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"}
            title={giaoDien === "dark" ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"}
            style={{ background: "none", border: "none", fontSize: 16, color: "var(--slate)" }}
          >
            {giaoDien === "dark" ? <IcSun size={17} /> : <IcMoon size={16} />}
          </button>
          <button
            onClick={() => setMoCaiDat(true)}
            className="tap"
            aria-label="Cài đặt"
            title="Cài đặt"
            style={{ background: "none", border: "none", color: "var(--slate)", padding: "0 2px" }}
          >
            <IcCaiDat size={17} />
          </button>
        </div>
      </header>

      {moCaiDat && (
        <CaiDat
          tenGoiHienTai={tenGoi}
          tenTroLyHienTai={tenTroLy}
          onDong={() => setMoCaiDat(false)}
          onThongBao={(m) => {
            setDaLuu(m);
            setTimeout(() => setDaLuu(null), 4000);
          }}
          onLuuXong={({ tenGoi: tg, tenTroLy: tl, lichDoi }) => {
            setTenGoi(tg);
            setTenTroLy(tl);
            try {
              if (tg) localStorage.setItem("hpprio-ten", tg);
              else localStorage.removeItem("hpprio-ten");
            } catch {}
            if (lichDoi) setLamMoiLich((v) => v + 1);
            setDaLuu("Đã lưu cài đặt trên mọi thiết bị");
            setTimeout(() => setDaLuu(null), 4000);
          }}
        />
      )}

      {tab === "homnay" && (
      <>
      {/* Điểm tin sáng do Bé iu viết, mỗi ngày một bản, đóng là ẩn tới hết ngày */}
      {brief && !anBrief && (
        <div
          style={{
            background: "var(--navy-2)",
            border: "1px solid var(--line)",
            borderLeft: "3px solid var(--amber)",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 16
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span
              className="mono"
              style={{ fontSize: 10.5, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.12em", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <IcSun size={12} /> Điểm tin sáng
            </span>
            <button
              onClick={dongBrief}
              aria-label="Đóng điểm tin sáng"
              className="tap"
              style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 13, margin: -10 }}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--cream)", margin: 0, whiteSpace: "pre-wrap" }}>
            {brief}
          </p>
        </div>
      )}

      {/* Lịch họp hôm nay (Outlook + Google qua ICS), tự ẩn khi trống */}
      <CalendarStrip lamMoi={lamMoiLich} />

      {/* Mọi thông báo tạm thời gom về MỘT khu cố định ở đáy màn hình.
          Trước đây "Đã lưu" nằm đầu trang còn "Hoàn tác" nằm đáy, mắt phải
          canh hai vị trí. */}
      {(daLuu || hoanTac) && (
        <div className="toast-khu">
          {daLuu && (
            <div
              role="status"
              style={{
                background: "var(--navy-2)",
                border: "1px solid var(--teal)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "var(--teal)",
                fontSize: 13
              }}
            >
              ✓ {daLuu}
            </div>
          )}
          {hoanTac && (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "var(--navy-2)",
                border: "1px solid var(--teal)",
                borderRadius: 10,
                padding: "10px 14px"
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
        <h2 className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--slate)", margin: 0 }}>
          Việc cần làm
        </h2>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--slate)" }}>
          {dangLoc ? `${dsHienThi.length}/${tasks.length}` : tasks.length} việc mở
          {dem.done > 0 && <span style={{ color: "var(--teal)" }}> · {dem.done} đã xong</span>}
        </span>
      </div>

      {/* Bộ lọc và sắp xếp. Chỉ hiện khi đã có vài việc, dưới ngưỡng đó thì
          cuộn mắt nhanh hơn là gõ tìm. */}
      {tasks.length >= 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={tuKhoa}
              onChange={(e) => setTuKhoa(e.target.value)}
              placeholder="Tìm trong tiêu đề và ghi chú..."
              aria-label="Tìm việc"
              style={{
                flex: "1 1 180px",
                background: "var(--field)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "var(--cream)",
                fontSize: 13.5,
                minHeight: 44,
                fontFamily: "var(--font-body)"
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {([
                ["tat-ca", "Tất cả"],
                ["work", "Cơ quan"],
                ["personal", "Cá nhân"]
              ] as const).map(([ma, ten]) => (
                <button
                  key={ma}
                  onClick={() => setNhan(ma)}
                  aria-pressed={nhan === ma}
                  style={{
                    background: nhan === ma ? "var(--field)" : "transparent",
                    border: `1px solid ${nhan === ma ? "var(--amber)" : "var(--line)"}`,
                    color: nhan === ma ? "var(--cream)" : "var(--slate)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 12.5,
                    fontWeight: nhan === ma ? 600 : 400,
                    minHeight: 44
                  }}
                >
                  {ten}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Xếp theo
            </span>
            {([
              ["uu-tien", "Ưu tiên"],
              ["han-chot", "Hạn chót"],
              ["moi-nhat", "Mới thêm"]
            ] as const).map(([ma, ten]) => (
              <button
                key={ma}
                onClick={() => setSapXep(ma)}
                aria-pressed={sapXep === ma}
                style={{
                  background: "transparent",
                  border: "none",
                  color: sapXep === ma ? "var(--amber)" : "var(--slate)",
                  fontSize: 12.5,
                  fontWeight: sapXep === ma ? 700 : 400,
                  minHeight: 40,
                  padding: "0 8px",
                  textDecoration: sapXep === ma ? "underline" : "none",
                  textUnderlineOffset: 4
                }}
              >
                {ten}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--slate)" }}>Đang tải…</p>
      ) : (
        <>
          {/* Khu quá hạn ghim trên cùng, tách hẳn khỏi danh sách thường */}
          {dsQuaHan.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                className="mono"
                style={{ fontSize: 11.5, color: "var(--coral)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}
              >
                Quá hạn · {dsQuaHan.length}
              </div>
              <TaskList
                tasks={dsQuaHan}
                onDone={handleDone}
                onDelete={handleDelete}
                onReclassify={handleReclassify}
                onFocus={(t) => {
                  setPhienKhoiPhuc(null);
                  setFocusThuNho(false);
                  setFocusId(t.id);
                }}
              />
            </div>
          )}
          {/* Danh sách thường; màn hình trống kiểu "chưa có việc nào" chỉ hiện
              khi thật sự trống chứ không phải do bộ lọc */}
          {(dsBinhThuong.length > 0 || (dsQuaHan.length === 0 && !dangLoc)) && (
            <TaskList
              tasks={dsBinhThuong}
              onDone={handleDone}
              onDelete={handleDelete}
              onReclassify={handleReclassify}
              onFocus={(t) => {
                setPhienKhoiPhuc(null);
                setFocusThuNho(false);
                setFocusId(t.id);
              }}
            />
          )}
        </>
      )}

      {dangLoc && dsHienThi.length === 0 && tasks.length > 0 && (
        <p style={{ color: "var(--slate)", fontSize: 13, textAlign: "center", marginTop: 14 }}>
          Không có việc nào khớp bộ lọc.{" "}
          <button
            onClick={() => {
              setTuKhoa("");
              setNhan("tat-ca");
            }}
            style={{ background: "none", border: "none", color: "var(--amber)", fontSize: 13, textDecoration: "underline", minHeight: 44 }}
          >
            Xóa bộ lọc
          </button>
        </p>
      )}

      <DonePanel
        soLuong={dem.done ?? 0}
        moiLamMoi={nhipLamMoi}
        onDoiMo={setPanelMo}
        onDoiTrangThai={() => {
          loadTasks();
          setNhipLamMoi((n) => n + 1);
        }}
      />

      <TrashPanel
        soLuong={dem.deleted ?? 0}
        moiLamMoi={nhipLamMoi}
        onDoiMo={setPanelMo}
        onKhoiPhuc={() => {
          loadTasks();
          setNhipLamMoi((n) => n + 1);
        }}
      />
      </>
      )}

      {/* Tab Nhật ký: ghi cuối ngày và xem lại theo khoảng */}
      {tab === "nhatky" && <ReflectionLog />}

      {/* Tab Nhìn lại: thống kê */}
      {tab === "nhinlai" && <NhinLai email={email} />}

      {/* Thanh điều hướng đáy */}
      <nav className="nav-day" aria-label="Điều hướng chính">
        <button onClick={() => setTab("homnay")} aria-current={tab === "homnay" ? "page" : undefined}>
          <IcList size={17} />
          Hôm nay
        </button>
        <button onClick={() => setTab("nhatky")} aria-current={tab === "nhatky" ? "page" : undefined}>
          <IcJournal size={17} />
          Nhật ký
        </button>
        <button onClick={() => setTab("nhinlai")} aria-current={tab === "nhinlai" ? "page" : undefined}>
          <IcChart size={17} />
          Nhìn lại
        </button>
      </nav>

      {/* Thanh mini khi phiên tập trung được thu nhỏ */}
      {focusTask && focusThuNho && (
        <MiniFocusBar tieuDe={focusTask.title} onMo={() => setFocusThuNho(false)} />
      )}

      {/* Nút nổi gọi trợ lý, thay cho ô nhập luôn chiếm màn hình chính */}
      {tab === "homnay" && !moBeIu && !focusTask && !panelMo && !moCaiDat && !daLuu && !hoanTac && (
        <button className="fab-beiu" onClick={() => setMoBeIu(true)} aria-label={`Thêm việc với ${tenTroLy}`}>
          <IcSpark size={16} /> {tenTroLy}
        </button>
      )}

      {/* Khung nhập việc trượt lên từ đáy màn hình */}
      {moBeIu && (
        <div className="sheet-lop-phu" onClick={() => setMoBeIu(false)}>
          <div
            className="sheet-noi-dung"
            role="dialog"
            aria-modal="true"
            aria-label={`Thêm việc với ${tenTroLy}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 600, color: "var(--cream)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <IcSpark size={15} /> {tenTroLy}
              </span>
              <button
                onClick={() => setMoBeIu(false)}
                className="tap"
                aria-label="Đóng"
                style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 17, margin: -10 }}
              >
                ✕
              </button>
            </div>
            <TaskInput onHoanTat={handleBeIuHoanTat} />
          </div>
        </div>
      )}

      {/* Chế độ tập trung, phủ toàn màn hình */}
      {focusTask && (
        <FocusMode
          task={focusTask}
          phienCu={phienKhoiPhuc}
          thuNho={focusThuNho}
          onDoiThuNho={setFocusThuNho}
          onClose={() => {
            setFocusId(null);
            setPhienKhoiPhuc(null);
            setFocusThuNho(false);
          }}
          onXongViec={handleDone}
          onDoiGhiChu={(id, notes) => handleReclassify(id, { notes })}
        />
      )}
    </main>
    </TroLyProvider>
  );
}
