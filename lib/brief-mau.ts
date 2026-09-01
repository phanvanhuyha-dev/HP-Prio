import { TEN_TRO_LY_MAC_DINH } from "./branding";

// Điểm tin sáng dựng theo mẫu từ chính dữ liệu, KHÔNG gọi AI.
// Dùng khi Gemini hết hạn mức, mất kết nối, hoặc chưa cấu hình khóa.
// Kém sắc hơn bản AI viết, nhưng thông tin thì đủ và luôn có.

function ke(ds: string[], toiDa = 2): string {
  const l = ds.slice(0, toiDa).map((t) => `“${t}”`);
  const con = ds.length - l.length;
  return l.join(", ") + (con > 0 ? ` và ${con} việc nữa` : "");
}

export function briefTheoMau(
  d: {
    quaHan: string[];
    homNay: string[];
    lamNgay: string[];
    namIm: string[];
    tong: number;
    lich?: string;
  },
  troLy: string = TEN_TRO_LY_MAC_DINH
): string {
  const cau: string[] = [];

  if (d.quaHan.length > 0) {
    cau.push(`Anh đang có ${d.quaHan.length} việc quá hạn: ${ke(d.quaHan)}.`);
  }
  if (d.homNay.length > 0) {
    cau.push(`Hôm nay đến hạn ${d.homNay.length} việc: ${ke(d.homNay)}.`);
  }

  // Gợi ý bắt đầu từ đâu, ưu tiên: quá hạn > đến hạn hôm nay > làm ngay
  const batDau = d.quaHan[0] ?? d.homNay[0] ?? d.lamNgay[0];
  if (batDau) {
    const viCo = d.quaHan[0]
      ? "vì đã trễ hạn"
      : d.homNay[0]
        ? "vì đến hạn trong hôm nay"
        : "vì vừa khẩn cấp vừa quan trọng";
    cau.push(`Em đề nghị anh bắt đầu với “${batDau}” ${viCo}.`);
  } else if (d.tong > 0) {
    cau.push(`Không việc nào gấp hôm nay, anh chủ động được lịch. Tổng ${d.tong} việc đang mở.`);
  } else {
    return `Hôm nay anh chưa có việc nào đang mở. Nhẹ nhàng nhé.`;
  }

  if (d.namIm.length > 0) {
    cau.push(`Còn ${ke(d.namIm, 1)} nằm im hơn hai tuần chưa đụng tới, anh xem còn cần không.`);
  }

  if (d.lich?.trim()) {
    const soHop = d.lich.split("\n").filter(Boolean).length;
    cau.push(`Lịch hôm nay có ${soHop} mục, anh xem dải lịch phía dưới để chọn khung giờ làm việc sâu.`);
  }

  // Nói rõ đây là bản rút gọn, không giả vờ là bản AI viết
  cau.push(`(${troLy} đang tạm dùng bản tóm tắt rút gọn.)`);
  return cau.join(" ");
}

export function tomTatTuanTheoMau(d: {
  phut: number;
  phien: number;
  xong: number;
  tao: number;
  quaHan: number;
  dangMo: number;
}): string {
  const cau: string[] = [];
  cau.push(
    d.phut > 0
      ? `Tuần qua anh tập trung ${d.phut} phút qua ${d.phien} phiên.`
      : `Tuần qua chưa có phiên tập trung nào được ghi nhận.`
  );
  cau.push(`Hoàn thành ${d.xong} việc, thêm mới ${d.tao} việc.`);

  if (d.tao > d.xong && d.tao - d.xong >= 3) {
    cau.push(`Việc vào nhiều hơn việc ra ${d.tao - d.xong}, tồn đọng đang tăng dần.`);
  } else if (d.xong >= d.tao && d.xong > 0) {
    cau.push(`Nhịp xử lý theo kịp nhịp việc đến.`);
  }

  if (d.quaHan > 0) {
    cau.push(`Đang có ${d.quaHan} việc quá hạn, nên dọn trước khi bắt việc mới.`);
  }
  cau.push(`Hiện còn ${d.dangMo} việc đang mở. (Bản tóm tắt rút gọn, không dùng AI.)`);
  return cau.join(" ");
}
