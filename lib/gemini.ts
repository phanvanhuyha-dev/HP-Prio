import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeDeadline } from "./db";

// KHÔNG ghim tên model theo phiên bản. Google liên tục ngừng cấp model cũ cho
// API key mới: dự án này đã chết hai lần vì gemini-1.5-flash rồi gemini-2.0-flash.
// Mặc định dùng bí danh tự cập nhật của Google, và tự dò lại khi bí danh hỏng.
const BI_DANH_MAC_DINH = "gemini-flash-latest";

// Model chuyên dụng, không sinh được JSON theo yêu cầu của app.
const LOAI_TRU =
  /(preview|tts|image|robotics|computer-use|transcribe|omni|lyria|nano-banana|deep-research|gemma|embedding|customtools|vision|clip)/i;

// Chọn model tốt nhất từ danh sách mà API key thực sự dùng được.
export function chonModelTot(models: string[]): string | null {
  const ungVien = models.filter((m) => !LOAI_TRU.test(m));
  if (ungVien.length === 0) return null;

  // Ưu tiên bí danh "...-latest": Google tự trỏ sang bản mới, không bao giờ lỗi thời.
  const biDanhFlash = ungVien.find((m) => /^gemini-flash-latest$/.test(m));
  if (biDanhFlash) return biDanhFlash;
  const biDanhKhac = ungVien.find((m) => /-latest$/.test(m) && /flash/.test(m));
  if (biDanhKhac) return biDanhKhac;

  // Không có bí danh thì lấy bản flash thường có số phiên bản cao nhất.
  const soPhienBan = (m: string) => Number(m.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const flash = ungVien
    .filter((m) => /flash/.test(m) && !/lite/.test(m))
    .sort((a, b) => soPhienBan(b) - soPhienBan(a));
  if (flash.length) return flash[0];

  const batKyGemini = ungVien.filter((m) => /^gemini-/.test(m)).sort((a, b) => soPhienBan(b) - soPhienBan(a));
  return batKyGemini[0] ?? ungVien[0];
}

// Khởi tạo trễ: không tạo client ở cấp module để việc thiếu GEMINI_API_KEY
// không làm hỏng bước build của Next.js.
let tenModelDangDung: string | null = null;

export function modelDangDung() {
  return process.env.GEMINI_MODEL?.trim() || tenModelDangDung || BI_DANH_MAC_DINH;
}

function taoModel(ten: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Thiếu GEMINI_API_KEY");
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: ten,
    generationConfig: { responseMimeType: "application/json" }
  });
}

function laLoiKhongCoModel(err: any) {
  const msg = String(err?.message ?? err);
  return err?.status === 404 || /is not found for API version|models\/.* not found/i.test(msg);
}

// Gọi Gemini, nếu model hiện tại không dùng được thì tự hỏi Google xem còn
// model nào rồi gọi lại. Người dùng không phải sửa cấu hình mỗi lần Google
// đổi danh mục model.
async function sinhJson(prompt: string): Promise<any> {
  try {
    const res = await taoModel(modelDangDung()).generateContent(prompt);
    return parseJsonResponse(res.response.text());
  } catch (err) {
    // GEMINI_MODEL do người dùng chỉ định thì tôn trọng, không tự đổi.
    if (!laLoiKhongCoModel(err) || process.env.GEMINI_MODEL?.trim()) throw err;

    const ds = await listAvailableModels();
    const chon = chonModelTot(ds);
    if (!chon) throw err;

    console.warn(`[HPPrio] Model "${modelDangDung()}" không dùng được, chuyển sang "${chon}".`);
    tenModelDangDung = chon;
    const res = await taoModel(chon).generateContent(prompt);
    return parseJsonResponse(res.response.text());
  }
}

// Hỏi thẳng Google xem API key này dùng được những model nào.
// Đoán mò tên model tốn nhiều vòng thử sai hơn là hỏi một câu.
export async function listAvailableModels(): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Thiếu GEMINI_API_KEY");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) {
    throw Object.assign(new Error(`ListModels HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`), {
      status: res.status
    });
  }

  const data = await res.json();
  return (data.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m: any) => String(m.name).replace(/^models\//, ""));
}

export type ParsedTask = {
  title: string;
  category: "work" | "personal";
  deadline: string | null; // ISO 8601, hoặc null nếu không chắc chắn
  urgent: boolean;
  important: boolean;
  reasoning: string;
};

const WEEKDAYS_VI = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

// Máy chủ Vercel chạy theo giờ UTC. Nếu đưa thẳng toISOString() vào prompt rồi
// bảo với AI đó là giờ Việt Nam thì sau 17h chiều VN, AI sẽ hiểu sai ngày hôm nay
// và tính "ngày mai", "thứ 6 tuần này" lệch mất một ngày.
function nowInVietnam() {
  // Locale "sv-SE" cho ra đúng dạng "YYYY-MM-DD HH:mm:ss".
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());

  const [datePart, timePart] = formatted.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);

  // Tính thứ bằng Date.UTC để kết quả không phụ thuộc múi giờ của máy chủ.
  const weekday = WEEKDAYS_VI[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  return { iso: `${datePart}T${timePart}+07:00`, weekday };
}

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích công việc cho một Trưởng phòng Nhân sự cấp cao tại Việt Nam.
Nhiệm vụ: đọc câu mô tả công việc (tiếng Việt, có thể là giọng nói được chuyển thành text, văn phong tự nhiên/không đầy đủ),
và trả về JSON với các trường:

- "title": tiêu đề ngắn gọn, rõ ràng (dưới 80 ký tự).
  GIỮ NGUYÊN các tiền tố, mã, thẻ mà người dùng cố ý gõ, ví dụ "[TEST]", "[GẤP]", "#DA01", "KPI:".
  Đó là quy ước riêng của họ, tự ý bỏ đi là làm mất thông tin.
- "category": "work" nếu liên quan công việc/tổ chức, "personal" nếu là việc cá nhân/gia đình. Nếu không rõ, suy luận theo ngữ cảnh hợp lý nhất.
- "deadline": ngày giờ dạng ISO 8601 kèm múi giờ (vd "2026-09-05T17:00:00+07:00") NẾU người dùng nói rõ hoặc gần như chắc chắn (vd "5h chiều mai", "thứ 6 tuần này", "trước 15/9").
  NẾU không đủ dữ kiện để xác định một ngày cụ thể (vd chỉ nói "tuần sau", "sớm", "khi nào rảnh" mà không có mốc rõ), trả về null. TUYỆT ĐỐI KHÔNG đoán bừa một ngày.
  Bây giờ là {{WEEKDAY}}, {{TODAY}} (giờ Việt Nam, UTC+7). Mọi mốc thời gian phải tính theo múi giờ này.
- "urgent": true/false, có tính khẩn cấp (deadline gần, hoặc ngôn từ thể hiện gấp) không
- "important": true/false, có tính quan trọng (ảnh hưởng lớn, liên quan chiến lược/cấp trên/quyết định lớn) không
- "reasoning": giải thích ngắn gọn (1-2 câu, tiếng Việt) vì sao suy luận như vậy

Chỉ trả JSON, không thêm chữ nào khác.`;

// Dù đã đặt responseMimeType JSON, model vẫn có thể bọc kết quả trong ```json.
function parseJsonResponse(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

export async function parseTaskInput(rawInput: string): Promise<ParsedTask> {
  const { iso, weekday } = nowInVietnam();
  const prompt =
    SYSTEM_PROMPT.replace("{{TODAY}}", iso).replace("{{WEEKDAY}}", weekday) +
    `\n\nCâu nhập của người dùng: "${rawInput}"`;

  const parsed = await sinhJson(prompt);

  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim().slice(0, 200)
    : rawInput.slice(0, 80);

  return {
    title,
    category: parsed.category === "personal" ? "personal" : "work",
    // AI có thể trả "tuần sau" hoặc ngày sai định dạng. Lọc lại để không
    // đẩy chuỗi rác vào cột TIMESTAMPTZ của Postgres.
    deadline: normalizeDeadline(parsed.deadline),
    urgent: Boolean(parsed.urgent),
    important: Boolean(parsed.important),
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : ""
  };
}

const ANALYSIS_PROMPT = `Bạn là cố vấn CHRO/Chuyên gia Quản trị Nhân sự cấp cao, phong cách thẳng thắn, thực tế, mang tính hành động.
Dưới đây là danh sách công việc đang mở của người dùng (định dạng JSON), mỗi việc có: tiêu đề, nhãn (công/cá nhân), deadline, mức khẩn cấp, mức quan trọng.
Bây giờ là {{TODAY}} (giờ Việt Nam, UTC+7).

Hãy phân tích và trả về JSON gồm:
- "summary": nhận định tổng quan ngắn gọn (2-3 câu) về tình trạng khối lượng công việc hiện tại
- "recommendations": mảng 2-5 khuyến nghị hành động cụ thể (mỗi cái là 1 câu ngắn, hành động rõ ràng, vd "Xử lý việc X trước vì...", "Có thể hoãn/ủy quyền việc Y vì...")
- "risks": mảng 0-3 rủi ro/cảnh báo nếu có (vd quá tải, nhiều việc quan trọng dồn cùng ngày, việc quan trọng bị bỏ quên vì không khẩn cấp)

Chỉ trả JSON, không thêm chữ nào khác. Văn phong tiếng Việt, ngắn gọn, không sáo rỗng.
XƯNG HÔ: gọi người dùng là "anh", tuyệt đối không dùng "bạn". Toàn bộ giao diện đang xưng "anh",
lệch xưng hô ở đây làm phần khuyến nghị đọc như của một hệ thống khác.

Danh sách công việc:
{{TASKS}}`;

export type TaskAnalysis = {
  summary: string;
  recommendations: string[];
  risks: string[];
};

export async function analyzeTasks(tasks: unknown[]): Promise<TaskAnalysis> {
  const { iso } = nowInVietnam();
  // Thay {{TODAY}} trước để placeholder không bị dò trúng bên trong dữ liệu task.
  // {{TASKS}} dùng function replacer: nếu truyền chuỗi, các mẫu $$, $&, $', $`
  // trong tiêu đề công việc sẽ bị String.replace diễn giải và làm hỏng prompt.
  const prompt = ANALYSIS_PROMPT.replace("{{TODAY}}", iso).replace(
    "{{TASKS}}",
    () => JSON.stringify(tasks, null, 2)
  );

  const parsed = await sinhJson(prompt);

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((r: unknown): r is string => typeof r === "string")
      : [],
    risks: Array.isArray(parsed.risks)
      ? parsed.risks.filter((r: unknown): r is string => typeof r === "string")
      : []
  };
}
