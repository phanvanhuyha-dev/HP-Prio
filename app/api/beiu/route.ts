import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listTasks, isValidCategory, normalizeDeadline, layTenTroLyAnToan, type Task } from "@/lib/db";
import { routerBeIu } from "@/lib/gemini";
import { suKienSapToi, moTaLichChoAI } from "@/lib/calendar";
import { describeDbError, describeGeminiError, loiJson } from "@/lib/diagnostics";
import { doanViecTuCau } from "@/lib/ngay-viet";

// Gemini có lúc chậm, xem chú thích ở /api/parse.
export const maxDuration = 60;

function hanVN(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  // Hiển thị theo giờ Việt Nam bằng phép cộng 7 tiếng, không phụ thuộc tzdata
  const vn = new Date(d.getTime() + 7 * 3600e3);
  return `${p(vn.getUTCDate())}/${p(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()} lúc ${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}`;
}

const KHONG_HIEU = {
  hanhDong: "tra-loi" as const,
  traLoi: "Em chưa rõ cần thay đổi gì ở việc này. Anh nói cụ thể hơn giúp em nhé."
};

// AI chỉ ĐỀ XUẤT; route đối chiếu taskId với danh sách thật (chống bịa id),
// chuẩn hóa từng trường, rồi trả về cho giao diện hiện XÁC NHẬN. Không có
// đường nào để một câu nói sửa thẳng dữ liệu mà không qua tay người dùng.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }
  const text = body?.text;
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Thiếu nội dung" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Nội dung quá dài, anh rút gọn lại giúp" }, { status: 400 });
  }

  let tasks: Task[];
  try {
    tasks = await listTasks(session.user.email, "open");
  } catch (err) {
    return loiJson(describeDbError(err), "beiu");
  }

  // Cùng khẩu vị với analyze cũ: chỉ 5 trường + id, chặn 60 việc, không in đẹp
  const compact = tasks.slice(0, 60).map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    deadline: t.deadline ? new Date(t.deadline as any).toISOString().slice(0, 16) : null,
    urgent: t.user_urgent,
    important: t.user_important
  }));

  // Lịch họp là ngữ cảnh phụ: lỗi thì bỏ qua, không chặn trợ lý
  let lich = "";
  try {
    lich = moTaLichChoAI((await suKienSapToi(session.user.email)).suKien);
  } catch {}

  const troLy = await layTenTroLyAnToan(session.user.email);

  let kq;
  try {
    kq = await routerBeIu(text.trim(), compact, lich, troLy);
  } catch (err) {
    console.error("BeIu router lỗi, chuyển sang lớp dự phòng:", err);
    // AI hỏng (hết hạn mức, mất mạng, quá tải) thì KHÔNG chặn người dùng ghi
    // việc. Đọc câu bằng luật và vẫn cho ra bản nháp để duyệt như thường.
    // Chỉ làm được việc "thêm mới"; báo xong và sửa việc cần hiểu ngữ cảnh
    // nên đành báo rõ là tạm chưa dùng được.
    const m = describeGeminiError(err);
    return NextResponse.json({
      hanhDong: "them",
      viec: doanViecTuCau(text.trim()),
      duPhong: true,
      ghiChu: `${troLy} đang không gọi được AI nên tự đọc câu này bằng quy tắc. Anh kiểm lại giúp em, nhất là hạn chót.`,
      khacPhuc: m.khacPhuc
    });
  }

  if (kq.hanhDong === "them" || kq.hanhDong === "tra-loi") {
    return NextResponse.json(kq);
  }

  // xong / sua: taskId phải nằm trong danh sách thật của người dùng
  const task = tasks.find((t) => t.id === kq.taskId);
  if (!task) {
    return NextResponse.json({
      hanhDong: "tra-loi",
      traLoi: `Em không tìm thấy việc đó trong danh sách đang mở. Anh mở lại danh sách xem tên chính xác giúp em.`
    });
  }

  if (kq.hanhDong === "xong") {
    return NextResponse.json({ hanhDong: "xong", taskId: task.id, tieuDe: task.title });
  }

  // "sua": dựng sẵn body PATCH và bản tóm tắt dễ đọc để người dùng duyệt
  const td: any = kq.thayDoi ?? {};
  const capNhat: Record<string, unknown> = {};
  const tomTat: string[] = [];

  if (typeof td.title === "string" && td.title.trim()) {
    capNhat.title = td.title.trim().slice(0, 500);
    tomTat.push(`Tiêu đề → “${capNhat.title}”`);
  }
  if ("deadline" in td) {
    if (td.deadline === null) {
      capNhat.deadline = null;
      tomTat.push("Bỏ hạn chót");
    } else {
      const h = normalizeDeadline(td.deadline);
      if (h) {
        capNhat.deadline = h;
        tomTat.push(`Hạn chót → ${hanVN(h)}`);
      }
    }
  }
  if (isValidCategory(td.category) && td.category !== task.category) {
    capNhat.category = td.category;
    tomTat.push(`Phân loại → ${td.category === "work" ? "Cơ quan" : "Cá nhân"}`);
  }
  if (typeof td.urgent === "boolean") {
    capNhat.userUrgent = td.urgent;
    tomTat.push(`Khẩn cấp → ${td.urgent ? "bật" : "tắt"}`);
  }
  if (typeof td.important === "boolean") {
    capNhat.userImportant = td.important;
    tomTat.push(`Quan trọng → ${td.important ? "bật" : "tắt"}`);
  }
  if (typeof td.ghiChuThem === "string" && td.ghiChuThem.trim()) {
    const them = td.ghiChuThem.trim().slice(0, 2000);
    const cu = typeof task.notes === "string" && task.notes.trim() ? task.notes.trim() + "\n\n" : "";
    capNhat.notes = cu + them;
    tomTat.push(`Thêm ghi chú: “${them.slice(0, 80)}${them.length > 80 ? "…" : ""}”`);
  }

  if (tomTat.length === 0) return NextResponse.json(KHONG_HIEU);

  return NextResponse.json({
    hanhDong: "sua",
    taskId: task.id,
    tieuDe: task.title,
    capNhat,
    tomTat,
    troLy
  });
}
