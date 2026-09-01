import crypto from "node:crypto";

// Mã hóa token Microsoft trước khi cất vào database.
//
// Vì sao cần: refresh token của Microsoft là chìa khóa đọc lịch công ty, hạn
// dùng tính bằng tháng. Ai đọc được database, dù chỉ là một bản sao lưu bị
// bỏ quên, cũng đọc được lịch họp. Mã hóa ở tầng ứng dụng nên kẻ có database
// mà không có biến môi trường thì cầm về một chuỗi vô nghĩa.
//
// Khóa suy ra từ NEXTAUTH_SECRET nên không phải thêm biến môi trường mới.
// Đổi NEXTAUTH_SECRET đồng nghĩa với mất token đã lưu, lúc đó chỉ cần nối lại
// tài khoản Microsoft một lần.

function khoa(): Buffer {
  const bi = process.env.NEXTAUTH_SECRET?.trim();
  if (!bi || bi.length < 16) {
    throw new Error("Thiếu NEXTAUTH_SECRET nên không mã hóa được token Microsoft");
  }
  // Thêm tiền tố để khóa này không trùng với khóa NextAuth dùng cho cookie
  return crypto.createHash("sha256").update("hpprio-ms-token:" + bi).digest();
}

export function maHoa(vanBan: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", khoa(), iv);
  const ct = Buffer.concat([c.update(vanBan, "utf8"), c.final()]);
  return [
    iv.toString("base64url"),
    ct.toString("base64url"),
    c.getAuthTag().toString("base64url")
  ].join(".");
}

export function giaiMa(goi: string): string {
  const phan = goi.split(".");
  if (phan.length !== 3) throw new Error("Gói mã hóa sai định dạng");
  const [iv, ct, tag] = phan.map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", khoa(), iv);
  d.setAuthTag(tag);
  // GCM tự kiểm toàn vẹn: sửa một byte trong database là chỗ này ném lỗi,
  // không có chuyện giải ra dữ liệu rác mà vẫn chạy tiếp.
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
