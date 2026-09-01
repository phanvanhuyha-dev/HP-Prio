import { listTasks, getBrief, saveBrief, ngayVNHomNay, type Task } from "./db";
import { briefDaily } from "./gemini";
import { briefTheoMau } from "./brief-mau";
import { suKienSapToi, moTaLichChoAI } from "./calendar";

const NGAY_NAM_IM = 14;

// Phân loại danh sách việc cho điểm tin sáng. Tách riêng để kiểm thử được
// bằng dữ liệu dựng sẵn, không cần AI hay database.
export function phanLoaiChoBrief(tasks: Task[], luc = new Date()) {
  const cuoiNgayVN = (() => {
    // Hết ngày hôm nay theo giờ Việt Nam (+7, VN không có giờ mùa hè)
    const t = luc.getTime() + 7 * 3600e3;
    return new Date(Math.floor(t / 86400000) * 86400000 + 86400000 - 7 * 3600e3);
  })();
  const mocNamIm = new Date(luc.getTime() - NGAY_NAM_IM * 86400000);

  const quaHan: string[] = [];
  const homNay: string[] = [];
  const lamNgay: string[] = [];
  const namIm: string[] = [];

  for (const t of tasks) {
    const han = t.deadline ? new Date(t.deadline as any) : null;
    if (han && han < luc) quaHan.push(t.title);
    else if (han && han <= cuoiNgayVN) homNay.push(t.title);

    if (t.user_urgent && t.user_important) lamNgay.push(t.title);

    // "Nằm im": không có hạn (nên không bao giờ được cron nhắc) và không được
    // đụng tới suốt 14 ngày. Đây là kịch bản quên nguy hiểm nhất.
    if (!han && new Date(t.updated_at as any) < mocNamIm) namIm.push(t.title);
  }

  const cat = (ds: string[]) => ds.slice(0, 5);
  return { quaHan: cat(quaHan), homNay: cat(homNay), lamNgay: cat(lamNgay), namIm: cat(namIm), tong: tasks.length };
}

// Lấy điểm tin hôm nay, tạo mới nếu chưa có. Bản đã tạo được cache trong
// database nên mỗi ngày tốn đúng một lượt gọi AI dù cron lẫn app cùng gọi.
export async function layHoacTaoBrief(userEmail: string): Promise<string | null> {
  const ngay = ngayVNHomNay();
  const cu = await getBrief(userEmail, ngay);
  if (cu) return cu;

  const tasks = await listTasks(userEmail, "open");
  if (tasks.length === 0) return null;

  // Lịch họp là ngữ cảnh phụ, lỗi thì bỏ qua
  let lich = "";
  try {
    lich = moTaLichChoAI((await suKienSapToi()).suKien);
  } catch {}

  const duLieu = { ...phanLoaiChoBrief(tasks), lich };

  // AI viết hay hơn, nhưng điểm tin là tấm lưới chống quên nên KHÔNG được
  // vắng mặt chỉ vì Gemini hết hạn mức hay lỗi mạng. Hỏng thì dựng theo mẫu
  // từ chính dữ liệu đã tính.
  let brief: string;
  try {
    brief = await briefDaily(duLieu);
  } catch (err) {
    console.error("Brief AI lỗi, dùng bản theo mẫu:", (err as any)?.message ?? err);
    brief = briefTheoMau(duLieu);
  }

  await saveBrief(userEmail, ngay, brief);
  return brief;
}
