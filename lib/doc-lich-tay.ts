import type { SuKien } from "./calendar";

// Đọc lịch họp từ văn bản người dùng dán vào.
//
// Dùng khi công ty chặn cả xuất bản lịch (Shared calendars) lẫn đăng ký ứng
// dụng Microsoft, tức là mọi đường tự động đều tắc. Anh copy lịch trong
// Outlook hoặc trong email Agenda mail rồi dán vào đây.
//
// Nguyên tắc giống bộ đọc ngày: THÀ BỎ QUA CÒN HƠN ĐOÁN SAI. Dòng nào không
// chắc là cuộc họp thì bỏ, đừng dựng ra một cuộc họp không có thật.
//
// GIỜ KHÔNG CÓ SA/CH THÌ ĐỌC THEO 24 GIỜ, không tự suy ra buổi. "2:00" là 2
// giờ sáng chứ không phải 2 giờ chiều. Đoán buổi hộ người dùng là cách chắc
// chắn nhất để xếp nhầm một cuộc họp quan trọng sang khung giờ khác.

const BUOI = "sa|ch|am|pm";

// "8:30", "08h30", "14h", "9 SA", "2:00 CH", "14:00"
// Nhóm: 1 giờ, 2 dấu ngăn, 3 phút, 4 buổi
const RE_GIO = new RegExp(`(\\d{1,2})\\s*(?:([:h])\\s*(\\d{2})?)?\\s*(${BUOI})?`, "i");

const RE_CA_NGAY = /\b(cả ngày|ca ngay|all\s*day)\b/i;

// Dòng chỉ chứa ngày tháng, tiêu đề cột, hoặc rác quen thuộc của Outlook
const RE_BO_QUA =
  /^(thứ|chủ nhật|hôm nay|ngày mai|tháng|lịch|calendar|agenda|today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\b/i;

// Đuôi hay dính theo khi copy từ Outlook, cắt đi cho tiêu đề gọn
const RE_RAC_CUOI =
  /\s*[|·•]\s*(microsoft teams|teams meeting|cuộc họp trên microsoft teams|phòng họp.*|online|trực tuyến)\s*$/i;

type Gio = { gio: number; phut: number; het: number };

function docGio(s: string): Gio | null {
  const m = RE_GIO.exec(s);
  if (!m || m.index === undefined) return null;

  // Phải có phút, hoặc có SA/CH, hoặc có chữ "h" kiểu "14h" thì mới chắc đây
  // là giờ. Một con số trần như "3" trong "Phòng 3" không được hiểu thành 3
  // giờ. Riêng dấu hai chấm trần thì KHÔNG tính, vì "Phòng 3:" rất dễ gặp.
  const sep = m[2]?.toLowerCase();
  if (m[3] === undefined && !m[4] && sep !== "h") return null;

  let gio = Number(m[1]);
  const phut = m[3] === undefined ? 0 : Number(m[3]);
  if (gio > 23 || phut > 59) return null;

  const buoi = m[4]?.toLowerCase();
  if (buoi === "ch" || buoi === "pm") {
    if (gio < 12) gio += 12;
  } else if (buoi === "sa" || buoi === "am") {
    if (gio === 12) gio = 0;
  }
  if (gio > 23) return null;

  return { gio, phut, het: m.index + m[0].length };
}

function lamSachTieuDe(s: string): string {
  return s
    .replace(/^[\s\-–—>→:|.,]+/, "")
    .replace(RE_RAC_CUOI, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

// Mốc thời gian UTC cho giờ Việt Nam của một ngày cụ thể (VN không có giờ mùa hè)
function mocUTC(ngayISO: string, gio: number, phut: number): string {
  const [y, m, d] = ngayISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, gio - 7, phut, 0, 0)).toISOString();
}

/**
 * ngayISO: ngày của lịch này theo giờ Việt Nam, dạng "2026-09-01".
 */
export function docLichTay(vanBan: string, ngayISO: string): SuKien[] {
  const dong = vanBan
    .split(/\r?\n/)
    .map((d) => d.trim())
    .filter(Boolean);

  const kq: SuKien[] = [];

  for (let i = 0; i < dong.length; i++) {
    const d = dong[i];

    if (RE_CA_NGAY.test(d)) {
      const ten = lamSachTieuDe(d.replace(RE_CA_NGAY, ""));
      // Không có tên trên cùng dòng thì mượn dòng kế tiếp
      const tieuDe = ten || lamSachTieuDe(dong[i + 1] ?? "");
      if (tieuDe) {
        if (!ten) i++;
        kq.push({
          tieuDe,
          batDau: mocUTC(ngayISO, 0, 0),
          ketThuc: mocUTC(ngayISO, 23, 59),
          caNgay: true
        });
      }
      continue;
    }

    const g1 = docGio(d);
    if (!g1) continue;
    if (RE_BO_QUA.test(d)) continue;

    // Phần còn lại sau giờ đầu tiên
    let con = d.slice(g1.het);

    // Có giờ kết thúc thì bỏ nó ra khỏi tiêu đề
    let ketThuc: Gio | null = null;
    const nganCach = /^\s*(?:-|–|—|to|đến|den|>|→)\s*/i.exec(con);
    if (nganCach) {
      const sau = con.slice(nganCach[0].length);
      const g2 = docGio(sau);
      if (g2 && g2.het > 0 && sau.slice(0, g2.het).trim().length <= 8) {
        ketThuc = g2;
        con = sau.slice(g2.het);
      }
    }

    let tieuDe = lamSachTieuDe(con);
    // Outlook Agenda mail để giờ một dòng, tên cuộc họp ở dòng dưới
    if (!tieuDe) {
      const ke = dong[i + 1];
      if (ke && !docGio(ke) && !RE_BO_QUA.test(ke)) {
        tieuDe = lamSachTieuDe(ke);
        i++;
      }
    }
    if (!tieuDe) continue;

    const batDau = mocUTC(ngayISO, g1.gio, g1.phut);
    // Không có giờ kết thúc thì mặc định một tiếng, đủ để vẽ dải lịch
    const ket = ketThuc
      ? mocUTC(ngayISO, ketThuc.gio, ketThuc.phut)
      : new Date(new Date(batDau).getTime() + 3600e3).toISOString();

    kq.push({
      tieuDe,
      batDau,
      // Giờ kết thúc sớm hơn giờ bắt đầu là dấu hiệu đọc sai, thà lấy một tiếng
      ketThuc: ket > batDau ? ket : new Date(new Date(batDau).getTime() + 3600e3).toISOString(),
      caNgay: false
    });
  }

  // Bỏ trùng theo giờ bắt đầu và tiêu đề, rồi xếp theo giờ
  const thay = new Set<string>();
  return kq
    .filter((s) => {
      const khoa = s.batDau + "|" + s.tieuDe.toLowerCase();
      if (thay.has(khoa)) return false;
      thay.add(khoa);
      return true;
    })
    .sort((a, b) => a.batDau.localeCompare(b.batDau))
    .slice(0, 30);
}
