import https from "node:https";
import dns from "node:dns";
import { kiemTraUrlIcs } from "./ics-url";

// Tải nội dung lịch ICS thay cho node-ical.fromURL.
//
// Vì sao phải tự tải: URL này do người dùng nhập mà MÁY CHỦ đi gọi. Chặn ở
// tầng tên miền là chưa đủ, còn hai đường vòng:
//   1. Chuyển hướng (redirect): địa chỉ công khai trả về 302 trỏ vào
//      http://169.254.169.254 rồi thư viện ngoan ngoãn đi theo.
//   2. Tên miền công khai trỏ thẳng về IP nội bộ, hoặc đổi bản ghi DNS ngay
//      giữa lúc kiểm và lúc kết nối (DNS rebinding).
//
// Nên ở đây tự đi từng chặng chuyển hướng và kiểm lại URL mỗi chặng, đồng
// thời kiểm ĐỊA CHỈ IP THẬT ngay lúc mở kết nối bằng hàm lookup riêng. Địa
// chỉ đã kiểm cũng chính là địa chỉ được nối tới, nên không còn khe hở giữa
// lúc kiểm và lúc dùng.
//
// Chứng thư TLS vẫn được kiểm theo tên miền như thường: ta chỉ can thiệp vào
// bước phân giải tên, không tắt xác thực.

const TOI_DA_CHUYEN_HUONG = 5;
const TOI_DA_BYTE = 5 * 1024 * 1024;
const HAN_MS = 8000;

// --- Nhận diện địa chỉ nội bộ ------------------------------------------------

function v4ThanhSo(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) {
    if (!/^\d{1,3}$/.test(o)) return null;
    const v = Number(o);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// Các dải IPv4 không được phép đi tới: mạng riêng, loopback, link-local
// (gồm 169.254.169.254 của nhà cung cấp đám mây), CGNAT, tài liệu, multicast.
const DAI_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
];

function laIpv4NoiBo(ip: string): boolean {
  const n = v4ThanhSo(ip);
  if (n === null) return true; // không hiểu thì coi như nguy hiểm
  for (const [goc, bit] of DAI_V4) {
    const g = v4ThanhSo(goc)!;
    const mask = bit === 0 ? 0 : (0xffffffff << (32 - bit)) >>> 0;
    if ((n & mask) >>> 0 === (g & mask) >>> 0) return true;
  }
  return false;
}

function laIpv6NoiBo(ip: string): boolean {
  const s = ip.split("%")[0]; // bỏ đuôi vùng kiểu fe80::1%eth0
  if (s === "::" || s === "::1") return true;

  const dau = s.split(":")[0];
  const h = dau === "" ? 0 : parseInt(dau, 16);
  if (Number.isNaN(h)) return true;

  if ((h & 0xfe00) === 0xfc00) return true; // fc00::/7 mạng riêng
  if ((h & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (h === 0x2001 && /^2001:0?db8:/i.test(s)) return true; // dải tài liệu
  if (h === 0x64 && /^64:ff9b:/i.test(s)) return true; // NAT64, nhét IPv4 vào trong
  if (s.startsWith("::")) return true; // các dạng nhúng IPv4 cũ

  return false;
}

// Dùng chung cho cả kiểm trước khi nối lẫn kiểm tại lookup.
export function laIpNoiBo(ip: string): boolean {
  const s = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!s) return true;
  const boc = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (boc) return laIpv4NoiBo(boc[1]);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return laIpv4NoiBo(s);
  return laIpv6NoiBo(s);
}

// --- Phân giải tên có kiểm ---------------------------------------------------

// Thay cho dns.lookup mặc định của Node. Trả về đúng địa chỉ đã kiểm, nên
// địa chỉ được nối tới chính là địa chỉ vừa kiểm, không có khe hở ở giữa.
const lookupAnToan: any = (hostname: string, options: any, callback: any) => {
  const opt = typeof options === "function" ? {} : options ?? {};
  const cb = typeof options === "function" ? options : callback;

  dns.lookup(hostname, { ...opt, all: true, verbatim: true }, (err, dsRaw) => {
    if (err) return cb(err);
    const ds = dsRaw as unknown as Array<{ address: string; family: number }>;
    if (!ds || ds.length === 0) return cb(new Error(`Không phân giải được ${hostname}`));

    // Chặn nếu BẤT KỲ địa chỉ nào là nội bộ, không chỉ địa chỉ được chọn:
    // một tên miền vừa trỏ ra ngoài vừa trỏ vào trong là dấu hiệu cố tình.
    for (const a of ds) {
      if (laIpNoiBo(a.address)) {
        return cb(new Error(`Tên miền ${hostname} trỏ vào địa chỉ nội bộ ${a.address}`));
      }
    }

    if (opt.all) return cb(null, ds);
    return cb(null, ds[0].address, ds[0].family);
  });
};

// Kiểm tên miền NGAY LÚC LƯU, không đợi tới lúc tải.
//
// Lọc theo chuỗi trong ics-url.ts không bắt được tên miền công khai trỏ về
// địa chỉ nội bộ (localtest.me chẳng hạn). Lớp lookup bên dưới vẫn chặn nên
// máy chủ không bao giờ gọi vào trong, nhưng nếu chỉ chặn ở đó thì người dùng
// lưu xong thấy báo "Đã lưu" rồi lịch im lặng không bao giờ hiện. Kiểm sớm để
// báo lỗi ngay tại chỗ nhập.
//
// Trả về lý do từ chối, hoặc null nếu tên miền dùng được.
export function kiemTenMien(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, dsRaw) => {
      if (err) {
        return resolve(`không phân giải được tên miền ${hostname}`);
      }
      const ds = dsRaw as unknown as Array<{ address: string }>;
      if (!ds || ds.length === 0) return resolve(`không phân giải được tên miền ${hostname}`);
      for (const a of ds) {
        if (laIpNoiBo(a.address)) {
          return resolve(`tên miền ${hostname} trỏ vào địa chỉ nội bộ ${a.address}`);
        }
      }
      resolve(null);
    });
  });
}

// --- Tải một chặng -----------------------------------------------------------

type Chang =
  | { loai: "xong"; noiDung: string }
  | { loai: "chuyen"; den: string };

function taiMotChang(url: string, conLai: number): Promise<Chang> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        lookup: lookupAnToan,
        timeout: conLai,
        headers: {
          // Máy chủ lịch hay từ chối khách không khai tên
          "User-Agent": "HPPrio/1.0 (+lich)",
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5"
        }
      },
      (res) => {
        const ma = res.statusCode ?? 0;

        if ([301, 302, 303, 307, 308].includes(ma)) {
          res.resume(); // xả dữ liệu để giải phóng kết nối
          const den = res.headers.location;
          if (!den) return reject(new Error("Chuyển hướng nhưng không nói đi đâu"));
          try {
            return resolve({ loai: "chuyen", den: new URL(den, url).toString() });
          } catch {
            return reject(new Error("Địa chỉ chuyển hướng không đọc được"));
          }
        }

        if (ma < 200 || ma >= 300) {
          res.resume();
          const goiY =
            ma === 401 || ma === 403
              ? "Liên kết có thể đã bị thu hồi, anh lấy lại liên kết mới giúp em"
              : ma === 404
                ? "Không tìm thấy lịch ở địa chỉ này"
                : "Máy chủ lịch không trả về dữ liệu";
          return reject(new Error(`${goiY} (mã ${ma})`));
        }

        let tong = 0;
        const phan: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          tong += c.length;
          if (tong > TOI_DA_BYTE) {
            res.destroy();
            return reject(new Error("Tệp lịch quá lớn"));
          }
          phan.push(c);
        });
        res.on("end", () => resolve({ loai: "xong", noiDung: Buffer.concat(phan).toString("utf8") }));
        res.on("error", reject);
      }
    );

    req.on("timeout", () => req.destroy(new Error("Máy chủ lịch trả lời quá chậm")));
    req.on("error", reject);
    req.end();
  });
}

// --- Cửa vào -----------------------------------------------------------------

export async function taiIcs(urlBanDau: string): Promise<string> {
  const het = Date.now() + HAN_MS;
  let url = urlBanDau;

  for (let i = 0; i <= TOI_DA_CHUYEN_HUONG; i++) {
    // Kiểm lại MỖI chặng, không chỉ chặng đầu: đích chuyển hướng là địa chỉ
    // do máy chủ bên kia tự chọn nên đáng ngờ y như địa chỉ người dùng nhập.
    const kq = kiemTraUrlIcs(url);
    if (!kq.ok) throw new Error(`Chặng ${i + 1}: ${kq.loi}`);

    const conLai = het - Date.now();
    if (conLai <= 0) throw new Error("Tải lịch quá lâu");

    const chang = await taiMotChang(kq.url, conLai);
    if (chang.loai === "xong") return chang.noiDung;
    url = chang.den;
  }

  throw new Error("Chuyển hướng vòng vo quá nhiều lần");
}
