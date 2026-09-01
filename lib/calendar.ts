import ical from "node-ical";
import { getIcsUrls } from "./db";
import { kiemTraUrlIcs } from "./ics-url";

// Đọc lịch họp qua đường liên kết iCal bí mật (secret ICS link) mà cả Outlook
// lẫn Google Calendar đều xuất được. Chọn cách này thay vì OAuth: một cơ chế
// chạy cho cả hai nhà cung cấp, chỉ đọc, không xin thêm quyền nào.
//
// Cấu hình: mỗi người tự dán liên kết trong app, lưu ở user_settings.ics_urls.
// Biến môi trường ICS_URLS vẫn được đọc nhưng CHỈ cho chủ sở hữu (OWNER_EMAIL),
// để bản đã cài từ trước không mất lịch. Không dùng chung cho tài khoản khác.

export type SuKien = {
  tieuDe: string;
  batDau: string; // ISO
  ketThuc: string; // ISO
  caNgay: boolean;
};

// Bộ đệm trong bộ nhớ của instance serverless: lịch họp không cần tươi từng
// giây, đỡ gọi Outlook/Google mỗi lần mở app.
//
// PHẢI khóa theo email. Bản trước dùng một biến chung cho cả tiến trình, nên
// dù có đọc đúng liên kết của từng người thì người vào sau vẫn nhận lịch của
// người vào trước còn trong bộ đệm.
const dem = new Map<string, { luc: number; data: SuKien[] }>();
const DEM_MS = 10 * 60 * 1000;
const DEM_TOI_DA = 200;

function cuaSoHomNay() {
  // Từ 0h hôm nay đến 24h ngày mai theo giờ Việt Nam (+7, không có giờ mùa hè)
  const t7 = Date.now() + 7 * 3600e3;
  const dauNgayVN = new Date(Math.floor(t7 / 86400000) * 86400000 - 7 * 3600e3);
  return { tu: dauNgayVN, den: new Date(dauNgayVN.getTime() + 2 * 86400000) };
}

// Bóc sự kiện trong cửa sổ thời gian từ dữ liệu iCal đã parse.
// Tách riêng để kiểm thử được bằng chuỗi ICS dựng sẵn, không cần mạng.
export function bocSuKien(duLieu: Record<string, any>, tu: Date, den: Date): SuKien[] {
  const kq: SuKien[] = [];

  for (const ev of Object.values(duLieu)) {
    try {
      if (!ev || (ev as any).type !== "VEVENT") continue;
      const e: any = ev;
      const tieuDe = String(e.summary ?? "(không có tiêu đề)").slice(0, 200);
      const caNgay = e.datetype === "date";
      const thoiLuong =
        e.end && e.start ? new Date(e.end).getTime() - new Date(e.start).getTime() : 3600e3;

      if (e.rrule) {
        // Sự kiện lặp: nhờ rrule tính các lần xảy ra trong cửa sổ.
        // Đây là phần dễ sai nhất của iCal, nên bọc kỹ và bỏ qua khi trục trặc.
        const cacLan: Date[] = e.rrule.between(tu, den, true) ?? [];
        for (const lan of cacLan) {
          // exdate: các lần đã bị hủy riêng lẻ
          if (e.exdate) {
            const biHuy = Object.values(e.exdate as Record<string, Date>).some(
              (d) => Math.abs(new Date(d).getTime() - lan.getTime()) < 60e3
            );
            if (biHuy) continue;
          }
          kq.push({
            tieuDe,
            batDau: lan.toISOString(),
            ketThuc: new Date(lan.getTime() + thoiLuong).toISOString(),
            caNgay
          });
        }
      } else if (e.start) {
        const batDau = new Date(e.start);
        if (batDau >= tu && batDau < den) {
          kq.push({
            tieuDe,
            batDau: batDau.toISOString(),
            ketThuc: new Date(batDau.getTime() + thoiLuong).toISOString(),
            caNgay
          });
        }
      }
    } catch {
      // Một sự kiện lỗi không được làm rơi cả lịch
    }
  }

  return kq.sort((a, b) => a.batDau.localeCompare(b.batDau)).slice(0, 30);
}

// Liên kết lịch của riêng một người. Ưu tiên bản người đó tự dán trong app;
// chỉ khi người đó là chủ sở hữu mới ngó tới biến môi trường cũ.
async function urlsCuaNguoi(userEmail: string): Promise<string[]> {
  let urls: string[] = [];
  try {
    urls = await getIcsUrls(userEmail);
  } catch (err) {
    console.error("Đọc ics_urls lỗi:", (err as any)?.message ?? err);
  }

  if (urls.length === 0) {
    const owner = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
    if (owner && owner === userEmail.trim().toLowerCase()) {
      urls = (process.env.ICS_URLS ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
    }
  }

  // Kiểm lại ngay trước khi tải, không chỉ lúc lưu: dữ liệu cũ trong database
  // và biến môi trường chưa từng đi qua bộ kiểm tra nào.
  const sach: string[] = [];
  for (const u of urls) {
    const kq = kiemTraUrlIcs(u);
    if (kq.ok) sach.push(kq.url);
    else console.error("Bỏ qua liên kết lịch không hợp lệ:", kq.loi);
  }
  return sach;
}

export async function suKienSapToi(userEmail: string): Promise<{ cauHinh: boolean; suKien: SuKien[] }> {
  const urls = await urlsCuaNguoi(userEmail);
  if (urls.length === 0) return { cauHinh: false, suKien: [] };

  const cu = dem.get(userEmail);
  if (cu && Date.now() - cu.luc < DEM_MS) return { cauHinh: true, suKien: cu.data };

  const { tu, den } = cuaSoHomNay();
  const tatCa: SuKien[] = [];

  for (const url of urls) {
    try {
      // Outlook/Google có lúc chậm; một lịch treo không được giữ cả app
      const duLieu = await Promise.race([
        ical.async.fromURL(url),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))
      ]);
      tatCa.push(...bocSuKien(duLieu as any, tu, den));
    } catch (err) {
      console.error("ICS fetch error:", (err as any)?.message ?? err);
    }
  }

  const data = tatCa.sort((a, b) => a.batDau.localeCompare(b.batDau)).slice(0, 30);
  // Chặn trần để một instance sống lâu không phình bộ nhớ vì nhiều tài khoản
  if (dem.size >= DEM_TOI_DA) dem.clear();
  dem.set(userEmail, { luc: Date.now(), data });
  return { cauHinh: true, suKien: data };
}

// Người dùng vừa đổi liên kết thì phải thấy lịch mới ngay, không đợi hết 10 phút
export function xoaDemLich(userEmail: string) {
  dem.delete(userEmail);
}

// Dòng mô tả lịch hôm nay cho prompt của Bé iu và điểm tin sáng.
export function moTaLichChoAI(suKien: SuKien[]): string {
  const { tu } = cuaSoHomNay();
  const cuoiNgay = new Date(tu.getTime() + 86400000);
  const homNay = suKien.filter((s) => new Date(s.batDau) < cuoiNgay);
  if (homNay.length === 0) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return homNay
    .map((s) => {
      if (s.caNgay) return `- cả ngày: ${s.tieuDe}`;
      const d = new Date(new Date(s.batDau).getTime() + 7 * 3600e3);
      return `- ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}: ${s.tieuDe}`;
    })
    .join("\n");
}
