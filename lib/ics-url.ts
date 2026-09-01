// Kiểm tra liên kết ICS trước khi lưu và trước khi máy chủ đi tải.
//
// Đây là URL do người dùng nhập mà MÁY CHỦ sẽ tự đi gọi, nên phải chặn các
// địa chỉ nội bộ: nếu không, một tài khoản bất kỳ có thể trỏ vào dịch vụ chạy
// trong mạng riêng hoặc endpoint metadata của nhà cung cấp đám mây và đọc
// những thứ không thuộc về họ (kiểu tấn công SSRF).
//
// Đây mới là lớp chặn THỨ NHẤT, lọc theo tên miền. Nó không đủ một mình: tên
// miền công khai vẫn có thể trỏ về IP nội bộ, hoặc chuyển hướng vòng vào
// trong. Lớp thứ hai nằm ở lib/tai-ics.ts, kiểm lại từng chặng chuyển hướng
// và kiểm địa chỉ IP thật ngay lúc mở kết nối. Sửa chỗ này thì xem cả chỗ đó.

const HOST_CAM: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // gồm cả 169.254.169.254 của các nhà cung cấp đám mây
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localdomain$/i
];

export const TOI_DA_LICH = 5;

export type KetQuaKiemTra = { ok: true; url: string } | { ok: false; loi: string };

// Trả về URL đã chuẩn hóa, hoặc lý do từ chối bằng tiếng Việt để hiện thẳng
// cho người dùng chứ không nuốt vào log.
export function kiemTraUrlIcs(raw: string): KetQuaKiemTra {
  const s = raw.trim();
  if (!s) return { ok: false, loi: "Liên kết trống" };
  if (s.length > 500) return { ok: false, loi: "Liên kết dài bất thường, anh xem lại giúp em" };

  let u: URL;
  try {
    // Outlook hay cho ra dạng webcal://, thực chất là https
    u = new URL(s.replace(/^webcal:\/\//i, "https://"));
  } catch {
    return { ok: false, loi: "Không đọc được liên kết, anh dán lại nguyên vẹn giúp em" };
  }

  // Liên kết ICS bí mật có giá trị như mật khẩu, không cho đi qua http trần
  if (u.protocol !== "https:") {
    return { ok: false, loi: "Chỉ nhận liên kết https, vì liên kết lịch có giá trị như mật khẩu" };
  }

  const host = u.hostname.toLowerCase();
  if (HOST_CAM.some((re) => re.test(host))) {
    return { ok: false, loi: "Liên kết trỏ vào địa chỉ nội bộ nên bị từ chối" };
  }

  return { ok: true, url: u.toString() };
}

// Người dùng dán nhiều lịch: chấp nhận cả xuống dòng lẫn dấu phẩy.
// Trả về danh sách đã kiểm tra, kèm các dòng bị từ chối và lý do.
export function tachDanhSachIcs(text: string): { hopLe: string[]; loi: string[] } {
  const dong = text
    .split(/[\n,]+/)
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, TOI_DA_LICH);

  const hopLe: string[] = [];
  const loi: string[] = [];
  for (const d of dong) {
    const kq = kiemTraUrlIcs(d);
    if (kq.ok) {
      if (!hopLe.includes(kq.url)) hopLe.push(kq.url);
    } else {
      loi.push(`${d.slice(0, 60)}${d.length > 60 ? "…" : ""}: ${kq.loi}`);
    }
  }
  return { hopLe, loi };
}

// Che bớt liên kết khi hiện lại trên màn hình: giữ tên miền cho nhận ra là
// lịch nào, giấu phần bí mật phía sau.
export function cheUrlIcs(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}/…`;
  } catch {
    return "liên kết không đọc được";
  }
}
