import "./globals.css";
import Providers from "./providers";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "HPPrio",
  description:
    "Trợ lý ưu tiên hóa công việc cá nhân: nói ra việc cần làm, AI tự phân loại khẩn cấp/quan trọng, bạn duyệt và hành động.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HPPrio"
  }
};

// Next 14 yêu cầu themeColor nằm ở viewport, để trong metadata sẽ bị cảnh báo khi build.
export const viewport: Viewport = {
  themeColor: "#0F1B2A",
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
