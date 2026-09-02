import { GoogleGenAI } from "@google/genai";
import { normalizeDeadline } from "./db";
import { TEN_TRO_LY_MAC_DINH } from "./branding";

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

let tenModelDangDung: string | null = null;

// Các model dòng 2.5 trở lên BẬT SẴN chế độ suy luận (thinking), thứ ngốn phần
// lớn trong 23-49 giây mỗi lượt gọi. App này chỉ cần trích xuất vài trường JSON
// từ một câu tiếng Việt, không cần suy luận nhiều bước, nên tắt đi.
// Model nào không cho tắt sẽ trả 400, khi đó tự bỏ tham số này và nhớ luôn.
let tatDuocThinking = true;

export function modelDangDung() {
  return process.env.GEMINI_MODEL?.trim() || tenModelDangDung || BI_DANH_MAC_DINH;
}

function taoClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Thiếu GEMINI_API_KEY");
  return new GoogleGenAI({ apiKey });
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

function maLoi(err: any): number | undefined {
  const msg = String(err?.message ?? err);
  return err?.status ?? (msg.match(/\[?(\d{3})[\s\]]/)?.[1] ? Number(msg.match(/\[?(\d{3})[\s\]]/)![1]) : undefined);
}

function laLoiKhongCoModel(err: any) {
  const msg = String(err?.message ?? err);
  return maLoi(err) === 404 || /is not found for API version|models\/.* not found|NOT_FOUND/i.test(msg);
}

// Model từ chối tham số thinkingConfig
function laLoiKhongTatDuocThinking(err: any) {
  const msg = String(err?.message ?? err);
  return maLoi(err) === 400 && /thinking|thinkingBudget|thinkingConfig|INVALID_ARGUMENT/i.test(msg);
}

// Thời gian của lượt gọi Gemini gần nhất, tính bằng mili giây.
// Đo trực tiếp quanh lệnh gọi để tách bạch phần Gemini với phần hạ tầng
// (mạng, khởi động serverless, truy vấn database). Không có số này thì chỉ
// suy ra được bằng phép trừ, không đủ tin để tối ưu.
let msGoiGanNhat: number | null = null;

export function thoiGianGoiGanNhat() {
  return msGoiGanNhat;
}

async function goiModel(model: string, prompt: string, tatThinking: boolean) {
  const batDau = Date.now();
  try {
    const res = await taoClient().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        ...(tatThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    });
    return res.text ?? "";
  } finally {
    msGoiGanNhat = Date.now() - batDau;
    // Xem trong Vercel Logs để đối chiếu với thời gian tổng của request.
    console.log(
      `[HPPrio] Gemini ${model} ${tatThinking ? "(tắt suy luận)" : "(mặc định)"}: ` +
        `${msGoiGanNhat}ms, prompt ${prompt.length} ký tự`
    );
  }
}

// Dù đã đặt responseMimeType JSON, model vẫn có thể bọc kết quả trong ```json.
function parseJsonResponse(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

// Gọi Gemini với hai lớp tự phục hồi:
//  1. Model từ chối tắt thinking  -> gọi lại không kèm tham số đó, nhớ để lần sau
//  2. Model không tồn tại (404)   -> hỏi Google model nào dùng được rồi đổi sang
async function sinhJson(prompt: string): Promise<any> {
  const goi = async (model: string) => {
    try {
      return await goiModel(model, prompt, tatDuocThinking);
    } catch (err) {
      if (tatDuocThinking && laLoiKhongTatDuocThinking(err)) {
        console.warn(`[HPPrio] Model "${model}" không cho tắt thinking, gọi lại theo mặc định.`);
        tatDuocThinking = false;
        return await goiModel(model, prompt, false);
      }
      throw err;
    }
  };

  try {
    return parseJsonResponse(await goi(modelDangDung()));
  } catch (err) {
    // GEMINI_MODEL do người dùng chỉ định thì tôn trọng, không tự đổi.
    if (!laLoiKhongCoModel(err) || process.env.GEMINI_MODEL?.trim()) throw err;

    const chon = chonModelTot(await listAvailableModels());
    if (!chon) throw err;

    console.warn(`[HPPrio] Model "${modelDangDung()}" không dùng được, chuyển sang "${chon}".`);
    tenModelDangDung = chon;
    return parseJsonResponse(await goi(chon));
  }
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

const SYSTEM_PROMPT = `Bạn là "{{TRO_LY}}", trợ lý phân tích công việc cho một Trưởng phòng Nhân sự cấp cao tại Việt Nam.
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
- "reasoning": giải thích ngắn gọn (1-2 câu, tiếng Việt, xưng "em" và gọi người dùng là "anh") vì sao suy luận như vậy

Chỉ trả JSON, không thêm chữ nào khác.`;

export async function parseTaskInput(
  rawInput: string,
  troLy: string = TEN_TRO_LY_MAC_DINH
): Promise<ParsedTask> {
  const { iso, weekday } = nowInVietnam();
  const prompt =
    SYSTEM_PROMPT.replace("{{TRO_LY}}", () => troLy).replace("{{TODAY}}", iso).replace("{{WEEKDAY}}", weekday) +
    `\n\nCâu nhập của người dùng: "${rawInput}"`;

  const parsed = await sinhJson(prompt);

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
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

const BREAKDOWN_PROMPT = `Bạn là "{{TRO_LY}}", trợ lý công việc cho một Trưởng phòng Nhân sự cấp cao tại Việt Nam.
Nhiệm vụ: chia công việc dưới đây thành các bước hành động cụ thể, theo đúng thứ tự nên làm.

Trả về JSON: {"steps": ["...", "..."]}
- 3 đến 7 bước, mỗi bước dưới 90 ký tự, bắt đầu bằng động từ, đủ cụ thể để bắt tay làm ngay.
- KHÔNG đánh số thứ tự trong nội dung bước, giao diện sẽ tự hiển thị.
- Nếu ghi chú hiện có đã liệt kê sẵn một số bước, chỉ đề xuất các bước còn thiếu, đừng lặp lại.
- Tiếng Việt.

Công việc: {{TITLE}}
Hạn chót: {{DEADLINE}}
Ghi chú hiện có:
{{NOTES}}

Chỉ trả JSON, không thêm chữ nào khác.`;

// Chia một việc thành danh sách bước. Trả về mảng chuỗi đã lọc sạch,
// route chỉ việc đưa thẳng cho giao diện.
export async function breakdownTask(
  t: {
    title: string;
    deadline: string | null;
    notes: string | null;
  },
  troLy: string = TEN_TRO_LY_MAC_DINH
): Promise<string[]> {
  // QUAN TRỌNG: driver Postgres trả cột TIMESTAMPTZ về dạng ĐỐI TƯỢNG Date chứ
  // không phải chuỗi (kiểu Task chỉ đúng sau khi qua JSON). Gọi .slice() thẳng
  // trên t.deadline từng làm route này chết với TypeError cho mọi việc có hạn.
  const han = (() => {
    if (!t.deadline) return "chưa có";
    const d = new Date(t.deadline as any);
    return Number.isNaN(d.getTime()) ? "chưa có" : d.toISOString().slice(0, 16);
  })();

  // Tiêu đề và ghi chú là dữ liệu người dùng nhập, dùng function replacer để
  // các mẫu $&, $' trong đó không bị String.replace diễn giải (xem routerBeIu).
  const prompt = BREAKDOWN_PROMPT.replace("{{TRO_LY}}", () => troLy)
    .replace("{{TITLE}}", () => t.title)
    .replace("{{DEADLINE}}", han)
    .replace("{{NOTES}}", () => (t.notes?.trim() ? t.notes.slice(0, 2000) : "(trống)"));

  const parsed = await sinhJson(prompt);
  const steps: unknown[] = Array.isArray(parsed?.steps) ? parsed.steps : [];
  return steps
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    // Model hay tự đánh số dù đã dặn không, cắt tiền tố "1." / "2)" đi.
    .map((s) => s.trim().replace(/^\d+[.)]\s*/, "").slice(0, 160))
    .filter(Boolean)
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// Điểm tin sáng: một đoạn ngắn Bé iu viết lúc 8h, tổng hợp việc đến hạn, quá
// hạn và việc nằm im lâu ngày. Đây là tấm lưới chống quên chủ động của app.
const BRIEF_PROMPT = `Bạn là "{{TRO_LY}}", trợ lý công việc riêng cho một Trưởng phòng Nhân sự cấp cao tại Việt Nam. Xưng "em", gọi người dùng là "anh". Giọng chuyên môn thẳng thắn, không sáo rỗng, không nũng nịu.
Hôm nay là {{WEEKDAY}}, {{TODAY}} (giờ Việt Nam).

Dữ liệu công việc của anh:
- Quá hạn: {{QUA_HAN}}
- Đến hạn hôm nay: {{HOM_NAY}}
- Khẩn cấp + quan trọng (làm ngay): {{LAM_NGAY}}
- Nằm im quá 14 ngày không đụng tới (không có hạn): {{NAM_IM}}
- Tổng việc đang mở: {{TONG}}

Lịch họp hôm nay của anh:
{{LICH}}

Viết một ĐIỂM TIN SÁNG ngắn (3-5 câu, tối đa 600 ký tự) theo thứ tự: (1) việc quá hạn nếu có, nêu đích danh; (2) việc đến hạn hôm nay; (3) gợi ý nên bắt đầu với việc nào và vì sao, chỉ MỘT việc; (4) nếu có việc nằm im, nhắc đúng một câu hỏi anh còn cần nó không. Không liệt kê lại toàn bộ, chỉ nêu thứ đáng chú ý. Không mở đầu bằng "Chào anh" (giao diện đã chào rồi).

Trả về JSON: {"brief":"..."}`;

export async function briefDaily(
  duLieu: {
    quaHan: string[];
    homNay: string[];
    lamNgay: string[];
    namIm: string[];
    tong: number;
    lich?: string;
  },
  troLy: string = TEN_TRO_LY_MAC_DINH
): Promise<string> {
  const { iso, weekday } = nowInVietnam();
  const ke = (ds: string[]) => (ds.length ? ds.map((t) => `"${t}"`).join(", ") : "(không có)");
  const prompt = BRIEF_PROMPT.replace("{{TRO_LY}}", () => troLy)
    .replace("{{TODAY}}", iso.slice(0, 10))
    .replace("{{WEEKDAY}}", weekday)
    .replace("{{QUA_HAN}}", () => ke(duLieu.quaHan))
    .replace("{{HOM_NAY}}", () => ke(duLieu.homNay))
    .replace("{{LAM_NGAY}}", () => ke(duLieu.lamNgay))
    .replace("{{NAM_IM}}", () => ke(duLieu.namIm))
    .replace("{{TONG}}", String(duLieu.tong))
    .replace("{{LICH}}", () => (duLieu.lich?.trim() ? duLieu.lich : "(trống hoặc chưa kết nối lịch)"));

  const parsed = await sinhJson(prompt);
  const brief = typeof parsed?.brief === "string" ? parsed.brief.trim() : "";
  if (!brief) throw new Error("Điểm tin trống");
  return brief.slice(0, 1200);
}

// ---------------------------------------------------------------------------
// Tóm tắt tuần: gọi theo yêu cầu từ tab Nhìn lại, không chạy nền.
const TOM_TAT_TUAN_PROMPT = `Bạn là "{{TRO_LY}}", trợ lý công việc riêng cho một Trưởng phòng Nhân sự cấp cao tại Việt Nam. Xưng "em", gọi người dùng là "anh". Giọng chuyên môn thẳng thắn, không sáo rỗng.

Số liệu 7 ngày qua của anh:
- Tổng thời gian tập trung: {{PHUT}} phút, {{PHIEN}} phiên
- Việc hoàn thành: {{XONG}} (gồm: {{DS_XONG}})
- Việc mới thêm: {{TAO}}
- Đang quá hạn: {{QUA_HAN}}
- Đang mở: {{DANG_MO}}

Viết TÓM TẮT TUẦN 3-5 câu, tối đa 700 ký tự: (1) nhận định thẳng về nhịp làm việc tuần qua dựa trên số liệu, khen chê có căn cứ; (2) một điểm đáng chú ý (vd thêm nhiều hơn xong, hay quá hạn tăng); (3) MỘT gợi ý cụ thể cho tuần tới. Không lặp lại số liệu dạng liệt kê, hãy diễn giải.

Trả về JSON: {"tomTat":"..."}`;

export async function tomTatTuan(
  d: {
    phut: number;
    phien: number;
    xong: number;
    dsXong: string[];
    tao: number;
    quaHan: number;
    dangMo: number;
  },
  troLy: string = TEN_TRO_LY_MAC_DINH
): Promise<string> {
  const prompt = TOM_TAT_TUAN_PROMPT.replace("{{TRO_LY}}", () => troLy)
    .replace("{{PHUT}}", String(d.phut))
    .replace("{{PHIEN}}", String(d.phien))
    .replace("{{XONG}}", String(d.xong))
    .replace("{{DS_XONG}}", () => (d.dsXong.length ? d.dsXong.map((t) => `"${t}"`).join(", ") : "không có"))
    .replace("{{TAO}}", String(d.tao))
    .replace("{{QUA_HAN}}", String(d.quaHan))
    .replace("{{DANG_MO}}", String(d.dangMo));

  const parsed = await sinhJson(prompt);
  const kq = typeof parsed?.tomTat === "string" ? parsed.tomTat.trim() : "";
  if (!kq) throw new Error("Tóm tắt trống");
  return kq.slice(0, 1400);
}

// ---------------------------------------------------------------------------
// Tổng hợp nhật ký nhìn lại theo khoảng thời gian, gọi theo yêu cầu.
const TONG_HOP_NHAT_KY_PROMPT = `Bạn là "{{TRO_LY}}", trợ lý công việc riêng cho một Trưởng phòng Nhân sự cấp cao tại Việt Nam. Xưng "em", gọi người dùng là "anh". Giọng chuyên môn thẳng thắn, không sáo rỗng.

Nhật ký nhìn lại cuối ngày của anh trong {{NHAN}} (mỗi dòng: ngày | thành tựu | điều cần cải thiện):
{{NHAT_KY}}

Viết TỔNG HỢP 4-6 câu, tối đa 900 ký tự:
(1) các thành tựu nổi bật và MẪU HÌNH lặp lại (không liệt kê từng ngày);
(2) chủ đề "cần cải thiện" xuất hiện nhiều lần nhất, nói thẳng;
(3) MỘT khuyến nghị cụ thể cho giai đoạn tới.
Diễn giải, không lặp lại nguyên văn nhật ký.

Trả về JSON: {"tomTat":"..."}`;

export async function tongHopNhatKy(
  nhan: string,
  entries: { ngay: string; thanhTuu: string | null; caiThien: string | null }[],
  troLy: string = TEN_TRO_LY_MAC_DINH
): Promise<string> {
  const dong = entries
    .slice(0, 120)
    .map((e) => `${e.ngay} | ${e.thanhTuu ?? ""} | ${e.caiThien ?? ""}`)
    .join("\n")
    .slice(0, 12000);

  const prompt = TONG_HOP_NHAT_KY_PROMPT.replace("{{TRO_LY}}", () => troLy)
    .replace("{{NHAN}}", nhan)
    .replace("{{NHAT_KY}}", () => dong);
  const parsed = await sinhJson(prompt);
  const kq = typeof parsed?.tomTat === "string" ? parsed.tomTat.trim() : "";
  if (!kq) throw new Error("Tổng hợp trống");
  return kq.slice(0, 1800);
}

// ---------------------------------------------------------------------------
// Bộ định tuyến ý định của trợ lý: một câu người dùng nói có thể là thêm việc,
// báo xong, sửa việc, hoặc một câu hỏi/nhờ phân tích. AI chỉ ĐỀ XUẤT hành động
// kèm dữ liệu; việc đối chiếu taskId với danh sách thật nằm ở route, còn xác
// nhận cuối cùng nằm ở người dùng. Vai trò này thay luôn tính năng "Phân tích
// & khuyến nghị" cũ: hỏi "hôm nay nên làm gì trước" là ra phân tích.
const ROUTER_PROMPT = `Bạn là "{{TRO_LY}}", trợ lý công việc riêng cho một Trưởng phòng Nhân sự cấp cao tại Việt Nam. Xưng "em", gọi người dùng là "anh". Giọng chuyên môn thẳng thắn, không nũng nịu.
Bây giờ là {{WEEKDAY}}, {{TODAY}} (giờ Việt Nam, UTC+7).

Danh sách việc đang mở của anh (JSON: id, title, category, deadline, urgent, important):
{{TASKS}}

Lịch họp hôm nay của anh (để cân nhắc khi tư vấn, KHÔNG phải việc trong danh sách):
{{LICH}}

Người dùng vừa nói: "{{TEXT}}"

Xác định ý định và trả về ĐÚNG MỘT JSON theo một trong bốn dạng:

1) Thêm việc mới (mặc định khi câu mô tả một việc cần làm):
{"hanhDong":"them","viec":{"title":"...","category":"work|personal","deadline":"ISO 8601 kèm +07:00 hoặc null","urgent":true/false,"important":true/false,"reasoning":"1-2 câu, xưng em gọi anh"}}
- title dưới 80 ký tự, GIỮ NGUYÊN tiền tố/mã người dùng cố ý gõ ([TEST], [GẤP], #DA01...).
- deadline chỉ điền khi người dùng nói rõ hoặc gần như chắc chắn; mơ hồ thì null, TUYỆT ĐỐI không đoán bừa.

2) Báo xong một việc trong danh sách (vd "xong việc X rồi", "đã gửi email đề án"):
{"hanhDong":"xong","taskId":"<id lấy đúng từ danh sách>"}

3) Sửa một việc trong danh sách (vd "dời hạn X sang thứ 6", "việc Y không gấp nữa", "thêm ghi chú ... vào việc Z"):
{"hanhDong":"sua","taskId":"<id>","thayDoi":{...}}
- thayDoi CHỈ chứa trường cần đổi: "title", "deadline" (ISO hoặc null nếu bỏ hạn), "category" ("work"/"personal"), "urgent" (true/false), "important" (true/false), "ghiChuThem" (chuỗi cần THÊM vào ghi chú).

4) Trả lời câu hỏi / phân tích (vd "hôm nay nên làm gì trước?", "tuần này có rủi ro gì?"):
{"hanhDong":"tra-loi","traLoi":"..."}
- Trả lời ngắn gọn, hành động rõ, dựa trên danh sách việc ở trên. Được dùng xuống dòng và gạch đầu dòng "- ".
- Viết văn xuôi thuần, KHÔNG dùng markdown: không **in đậm**, không *nghiêng*, không ### tiêu đề. Giao diện hiện nguyên ký tự đó ra màn hình.

Khi báo xong/sửa mà không xác định chắc chắn được việc nào khớp, dùng dạng 4 nói rõ em không tìm thấy và kể tên vài việc gần giống.
Chỉ trả JSON, không thêm chữ nào khác.`;

export type KetQuaRouter =
  | { hanhDong: "them"; viec: ParsedTask }
  | { hanhDong: "xong"; taskId: string }
  | { hanhDong: "sua"; taskId: string; thayDoi: Record<string, unknown> }
  | { hanhDong: "tra-loi"; traLoi: string };

export async function routerBeIu(
  text: string,
  tasks: unknown[],
  lichHomNay?: string,
  troLy: string = TEN_TRO_LY_MAC_DINH
): Promise<KetQuaRouter> {
  const { iso, weekday } = nowInVietnam();
  // Nội dung người dùng và danh sách việc đi qua function replacer để các mẫu
  // $& $' không bị String.replace diễn giải (đã từng dính lỗi này ở analyze).
  const prompt = ROUTER_PROMPT.replace("{{TRO_LY}}", () => troLy)
    .replace("{{TODAY}}", iso)
    .replace("{{WEEKDAY}}", weekday)
    .replace("{{TASKS}}", () => JSON.stringify(tasks))
    .replace("{{LICH}}", () => (lichHomNay?.trim() ? lichHomNay : "(trống hoặc chưa kết nối lịch)"))
    .replace("{{TEXT}}", () => text);

  const parsed = await sinhJson(prompt);

  switch (parsed?.hanhDong) {
    case "them": {
      const v = parsed.viec ?? {};
      return {
        hanhDong: "them",
        viec: {
          title:
            typeof v.title === "string" && v.title.trim()
              ? v.title.trim().slice(0, 200)
              : text.slice(0, 80),
          category: v.category === "personal" ? "personal" : "work",
          deadline: normalizeDeadline(v.deadline),
          urgent: Boolean(v.urgent),
          important: Boolean(v.important),
          reasoning: typeof v.reasoning === "string" ? v.reasoning : ""
        }
      };
    }
    case "xong":
      if (typeof parsed.taskId === "string") return { hanhDong: "xong", taskId: parsed.taskId };
      break;
    case "sua":
      if (typeof parsed.taskId === "string") {
        return {
          hanhDong: "sua",
          taskId: parsed.taskId,
          thayDoi: typeof parsed.thayDoi === "object" && parsed.thayDoi ? parsed.thayDoi : {}
        };
      }
      break;
    case "tra-loi":
      if (typeof parsed.traLoi === "string" && parsed.traLoi.trim()) {
        return { hanhDong: "tra-loi", traLoi: parsed.traLoi.trim().slice(0, 4000) };
      }
      break;
  }
  // Model trả dạng lạ thì lùi về câu trả lời an toàn thay vì ném lỗi
  return {
    hanhDong: "tra-loi",
    traLoi:
      "Em chưa hiểu rõ ý anh. Anh nói lại giúp em: thêm việc, báo xong, sửa việc, hay hỏi về công việc?"
  };
}
