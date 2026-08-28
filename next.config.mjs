// next-auth v4 đọc NEXTAUTH_URL ngay lúc nạp module và gọi new URL() với giá trị đó.
// Một biến được KHAI BÁO nhưng ĐỂ TRỐNG (rất dễ xảy ra trên Vercel khi chưa biết domain)
// sẽ thành new URL("") và làm hỏng bước prerender với lỗi khó hiểu "TypeError: Invalid URL",
// không hề nhắc tới NEXTAUTH_URL. Toán tử ?? của next-auth chỉ bỏ qua undefined,
// không bỏ qua chuỗi rỗng, nên phải tự dọn ở đây.
const rawAuthUrl = process.env.NEXTAUTH_URL;
if (rawAuthUrl !== undefined) {
  const trimmed = rawAuthUrl.trim();
  if (!trimmed) {
    console.warn(
      "[HPPrio] NEXTAUTH_URL đang để trống nên được bỏ qua. " +
        "Sau khi có domain thật, hãy đặt lại biến này trên Vercel."
    );
    delete process.env.NEXTAUTH_URL;
  } else if (trimmed !== rawAuthUrl) {
    // Khoảng trắng thừa cũng làm hỏng new URL()
    process.env.NEXTAUTH_URL = trimmed;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      }
    ];
  }
};

export default nextConfig;
