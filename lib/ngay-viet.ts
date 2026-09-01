// Đọc mốc thời gian trong câu tiếng Việt bằng luật, không cần AI.
// Dùng cho lớp dự phòng khi Gemini không sẵn sàng, và cho nút "Bỏ qua AI".
//
// Nguyên tắc: THÀ TRẢ NULL CÒN HƠN ĐOÁN SAI. Một hạn chót bịa ra tệ hơn nhiều
// so với không có hạn chót, vì nó khiến người dùng tin nhầm rồi lỡ việc thật.

const GIO_MAC_DINH = 9; // "ngày mai" không kèm giờ thì hẹn 9h sáng

// Mọi phép tính đều làm trên "đồng hồ Việt Nam" rồi mới đổi về UTC ở bước cuối.
function nowVN(luc: Date) {
  return new Date(luc.getTime() + 7 * 3600e3);
}

function veUTC(vn: Date): string {
  return new Date(vn.getTime() - 7 * 3600e3).toISOString();
}

function datGio(vn: Date, gio: number, phut: number) {
  const d = new Date(vn);
  d.setUTCHours(gio, phut, 0, 0);
  return d;
}

// Buổi có thể đứng trước hoặc sau giờ: "tối 8h", "3h chiều". Bắt cả hai phía
// để còn cắt gọn khỏi tiêu đề.
const BUOI = "sáng|trưa|chiều|tối|đêm";
// "5 rưỡi chiều", "9 giờ rưỡi". Phải thử TRƯỚC mẫu giờ thường, nếu không
// "9 giờ rưỡi" sẽ khớp "9 giờ" rồi mất mất 30 phút.
const RE_RUOI = new RegExp(`(?:(${BUOI})\\s+)?(\\d{1,2})\\s*(?:giờ\\s*|h\\s*)?rưỡi(?:\\s*(${BUOI}))?`);
// "14:00", "14h30", "9h", "9 giờ sáng"
const RE_GIO = new RegExp(`(?:(${BUOI})\\s+)?(\\d{1,2})\\s*(?:h|giờ|:)\\s*(\\d{1,2})?(?:\\s*(${BUOI}))?`);

function docGio(s: string): { gio: number; phut: number; khop: string } | null {
  let gio: number;
  let phut: number;
  let buoi: string | undefined;
  let khop: string;

  const mRuoi = s.match(RE_RUOI);
  if (mRuoi) {
    gio = Number(mRuoi[2]);
    phut = 30;
    buoi = mRuoi[3] ?? mRuoi[1];
    khop = mRuoi[0];
  } else {
    const m = s.match(RE_GIO);
    if (!m) return null;
    gio = Number(m[2]);
    phut = m[3] ? Number(m[3]) : 0;
    buoi = m[4] ?? m[1];
    khop = m[0];
  }
  if (gio > 23 || phut > 59) return null;

  // Buổi không dính liền giờ thì vẫn tính, chỉ là không cắt khỏi tiêu đề
  if (!buoi) buoi = s.match(new RegExp(`\\b(${BUOI})\\b`))?.[1];

  // Quy đổi 12 tiếng sang 24 tiếng
  if ((buoi === "chiều" || buoi === "tối" || buoi === "đêm") && gio < 12) gio += 12;
  else if (buoi === "trưa" && gio < 11) gio += 12;
  else if (buoi === "sáng" && gio === 12) gio = 0;

  return { gio, phut, khop };
}

// Thứ trong tuần: 0 = Chủ nhật. "thứ 2".."thứ 7", "chủ nhật"
function docThu(s: string): number | null {
  if (/\b(chủ nhật|cn)\b/.test(s)) return 0;
  const m = s.match(/\bthứ\s*(hai|ba|tư|bốn|năm|sáu|bảy|[2-7])\b/);
  if (!m) return null;
  const bang: Record<string, number> = {
    hai: 1, "2": 1,
    ba: 2, "3": 2,
    tư: 3, bốn: 3, "4": 3,
    năm: 4, "5": 4,
    sáu: 5, "6": 5,
    bảy: 6, "7": 6
  };
  return bang[m[1]] ?? null;
}

export type KetQuaNgay = {
  iso: string;
  // Phần chữ đã dùng để suy ra ngày, giúp cắt khỏi tiêu đề
  khop: string;
  // Phần chữ chỉ giờ (nếu tách rời phần ngày), cũng cần cắt khỏi tiêu đề
  khopGio?: string;
};

/**
 * Tìm mốc thời gian trong câu. Trả null khi không đủ chắc chắn.
 * Chỉ nhận các mẫu rõ ràng: hôm nay/mai/mốt, thứ trong tuần, ngày/tháng cụ thể.
 * Cố ý KHÔNG đoán với "tuần sau", "sớm", "khi nào rảnh".
 */
export function docNgayViet(cau: string, luc = new Date()): KetQuaNgay | null {
  const s = cau.toLowerCase();
  const homNayVN = datGio(nowVN(luc), 0, 0);
  const gioRieng = docGio(s);
  const apGio = (d: Date) =>
    gioRieng ? datGio(d, gioRieng.gio, gioRieng.phut) : datGio(d, GIO_MAC_DINH, 0);

  // 1. Ngày tháng cụ thể: "15/9", "15/9/2026", "ngày 15 tháng 9"
  const mSo = s.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{4}|\d{2}))?\b/);
  const mChu = s.match(/\bngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\b/);
  const mNgayThang = mSo ?? mChu;
  if (mNgayThang) {
    const ngay = Number(mNgayThang[1]);
    const thang = Number(mNgayThang[2]);
    if (ngay >= 1 && ngay <= 31 && thang >= 1 && thang <= 12) {
      let nam = mNgayThang[3] ? Number(mNgayThang[3]) : homNayVN.getUTCFullYear();
      if (nam < 100) nam += 2000;
      const d = new Date(Date.UTC(nam, thang - 1, ngay));
      // Ngày/tháng không kèm năm mà đã trôi qua thì hiểu là năm sau
      if (!mNgayThang[3] && d < homNayVN) d.setUTCFullYear(nam + 1);
      // Chặn ngày không tồn tại (31/2 thành 3/3)
      if (d.getUTCDate() !== ngay || d.getUTCMonth() !== thang - 1) return null;
      return { iso: veUTC(apGio(d)), khop: mNgayThang[0], khopGio: gioRieng?.khop };
    }
  }

  // 2. Hôm nay / ngày mai / ngày kia
  if (/\b(hôm nay|nay)\b/.test(s)) {
    const m = s.match(/\b(hôm nay|nay)\b/)!;
    return { iso: veUTC(apGio(homNayVN)), khop: m[0], khopGio: gioRieng?.khop };
  }
  if (/\b(ngày mai|mai)\b/.test(s)) {
    const d = new Date(homNayVN.getTime() + 86400000);
    return { iso: veUTC(apGio(d)), khop: s.match(/\b(ngày mai|mai)\b/)![0], khopGio: gioRieng?.khop };
  }
  if (/\b(ngày kia|mốt)\b/.test(s)) {
    const d = new Date(homNayVN.getTime() + 2 * 86400000);
    return { iso: veUTC(apGio(d)), khop: s.match(/\b(ngày kia|mốt)\b/)![0], khopGio: gioRieng?.khop };
  }

  // 3. Thứ trong tuần. "thứ 6" = thứ 6 gần nhất CÒN TỚI; "thứ 6 tuần sau" = +7 ngày
  const thu = docThu(s);
  if (thu !== null) {
    const hienTai = homNayVN.getUTCDay();
    let lech = (thu - hienTai + 7) % 7;
    if (lech === 0) lech = 7; // "thứ 6" nói vào đúng thứ 6 thì hiểu là tuần tới
    if (/\btuần\s*(sau|tới)\b/.test(s)) lech += 7;
    const d = new Date(homNayVN.getTime() + lech * 86400000);
    return { iso: veUTC(apGio(d)), khop: s.match(/\b(thứ\s*\S+|chủ nhật|cn)\b/)![0], khopGio: gioRieng?.khop };
  }

  // 4. Chỉ có giờ, không có ngày: hiểu là hôm nay, hoặc mai nếu giờ đó đã qua
  if (gioRieng) {
    let d = datGio(homNayVN, gioRieng.gio, gioRieng.phut);
    if (d <= nowVN(luc)) d = new Date(d.getTime() + 86400000);
    return { iso: veUTC(d), khop: gioRieng.khop };
  }

  // Không đủ chắc chắn ("tuần sau", "sớm", "khi nào rảnh"): trả null
  return null;
}

// Từ khóa suy ra mức khẩn cấp / quan trọng. Cố tình giữ danh sách ngắn và
// rõ nghĩa: đoán sai mức ưu tiên còn dễ sửa hơn đoán sai hạn chót.
const TU_KHAN = /\b(gấp|khẩn|ngay|liền|hôm nay|deadline|trễ|muộn|kịp|sớm nhất)\b/;
const TU_QUAN_TRONG =
  /\b(quan trọng|chiến lược|hội đồng|ban giám đốc|bgđ|tổng giám đốc|tgđ|sếp|lãnh đạo|báo cáo|kpi|okr|ngân sách|hợp đồng|tuyển dụng|đánh giá)\b/;
const TU_CA_NHAN =
  /\b(gia đình|vợ|chồng|con|bố|mẹ|ba|má|khám|bệnh viện|sinh nhật|cưới|du lịch|nghỉ|tập gym|cá nhân|nhà)\b/;

export type ViecDoanDuoc = {
  title: string;
  category: "work" | "personal";
  deadline: string | null;
  urgent: boolean;
  important: boolean;
  reasoning: string;
};

/**
 * Dựng một việc từ câu nhập bằng luật thuần, không gọi AI.
 * Dùng khi AI không sẵn sàng, và cho nút "Bỏ qua AI".
 */
export function doanViecTuCau(cau: string, luc = new Date()): ViecDoanDuoc {
  const raw = cau.trim();
  const s = raw.toLowerCase();
  const ngay = docNgayViet(raw, luc);

  // Tiêu đề: lấy dòng đầu, cắt cả phần ngày lẫn phần giờ đã dùng làm hạn chót.
  // Không cắt thì tiêu đề còn sót kiểu "họp 3h chiều" dù hạn đã lưu riêng.
  let title = raw.split("\n")[0].trim();
  if (ngay) {
    const thoat = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const phan of [ngay.khop, ngay.khopGio]) {
      if (!phan) continue;
      title = title
        .replace(new RegExp(`\\s*\\b(trước|vào|lúc|hạn)?\\s*${thoat(phan)}`, "i"), " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    // Dọn dấu câu lửng lơ còn lại ở cuối, vd "Gửi báo cáo," -> "Gửi báo cáo"
    title = title.replace(/[\s,;:.\-]+$/, "").trim();
  }
  if (!title) title = raw.slice(0, 80);
  if (title.length > 80) title = title.slice(0, 80).trim();

  const urgent = TU_KHAN.test(s) || (ngay ? new Date(ngay.iso).getTime() - luc.getTime() < 2 * 86400000 : false);
  const important = TU_QUAN_TRONG.test(s);
  const category: "work" | "personal" = TU_CA_NHAN.test(s) ? "personal" : "work";

  const lyDo: string[] = [];
  if (ngay) lyDo.push("em đọc được mốc thời gian trong câu");
  else lyDo.push("em không thấy mốc thời gian rõ ràng nên để trống hạn chót");
  if (urgent) lyDo.push("có dấu hiệu gấp");
  if (important) lyDo.push("có từ khóa quan trọng");

  return {
    title,
    category,
    deadline: ngay?.iso ?? null,
    urgent,
    important,
    reasoning: `Em tự đọc câu này không dùng AI: ${lyDo.join(", ")}. Anh sửa lại giúp em nếu chưa đúng.`
  };
}
