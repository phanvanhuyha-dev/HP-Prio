import "./globals.css";
import Providers from "./providers";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "HPPrio",
  description:
    "Trợ lý ưu tiên hóa công việc cá nhân: nói ra việc cần làm, AI tự phân loại khẩn cấp/quan trọng, bạn duyệt và hành động.",
  manifest: "/manifest.json",
  // iOS KHÔNG đọc icon từ manifest.json. Thiếu apple-touch-icon thì khi thêm
  // vào màn hình chính, iPhone lấy ảnh chụp trang làm icon, nhìn rất xấu.
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HPPrio"
  }
};

// Next 14 yêu cầu themeColor nằm ở viewport, để trong metadata sẽ bị cảnh báo khi build.
export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
