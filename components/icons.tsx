"use client";
// Bộ icon đơn sắc vẽ bằng SVG, tô theo currentColor nên tự khớp màu chữ ở nơi
// đặt nó và tự đổi theo giao diện sáng/tối. Thay cho emoji nhiều màu vốn phá
// tông tối giản trắng đen của app.
import type { CSSProperties } from "react";

type P = { size?: number; style?: CSSProperties };

function goc(size: number, style?: CSSProperties) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    style: { verticalAlign: "-0.125em", flexShrink: 0, ...style }
  };
}

// Tia sáng 4 cánh: dấu hiệu của Bé iu / AI
export const IcSpark = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)} fill="currentColor" stroke="none">
    <path d="M12 2.5l1.9 7.6 7.6 1.9-7.6 1.9L12 21.5l-1.9-7.6-7.6-1.9 7.6-1.9L12 2.5z" />
  </svg>
);

// Nút tập trung / bắt đầu. Ký tự "▶" không dùng được: iOS vẽ nó thành emoji
// nút play màu xanh thay vì chữ đơn sắc.
export const IcPlay = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)} fill="currentColor" stroke="none">
    <path d="M7.5 4.8c0-1 1.1-1.6 2-1.1l11 6.4c.9.5.9 1.8 0 2.3l-11 6.4c-.9.5-2-.1-2-1.1V4.8z" />
  </svg>
);

export const IcBell = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <path d="M18 16H6c1.2-1.4 1.5-2.7 1.5-5a4.5 4.5 0 019 0c0 2.3.3 3.6 1.5 5z" />
    <path d="M10.3 19a1.8 1.8 0 003.4 0" />
  </svg>
);

export const IcBellOff = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <path d="M18 16H6c1.2-1.4 1.5-2.7 1.5-5 0-.7.1-1.3.4-1.9M9.6 4.4A4.5 4.5 0 0116.5 11c0 2.3.3 3.6 1.5 5" />
    <path d="M10.3 19a1.8 1.8 0 003.4 0" />
    <path d="M4.5 4l15 15" />
  </svg>
);

export const IcSun = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.7v1.8M12 19.5v1.8M2.7 12h1.8M19.5 12h1.8M5.2 5.2l1.3 1.3M17.5 17.5l1.3 1.3M18.8 5.2l-1.3 1.3M6.5 17.5l-1.3 1.3" />
  </svg>
);

export const IcMoon = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)} fill="currentColor" stroke="none">
    <path d="M20.2 14.7A8.7 8.7 0 019.3 3.8a8.7 8.7 0 1010.9 10.9z" />
  </svg>
);

export const IcChart = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)} fill="currentColor" stroke="none">
    <rect x="4" y="12.5" width="3.8" height="8" rx="1" />
    <rect x="10.1" y="7.5" width="3.8" height="13" rx="1" />
    <rect x="16.2" y="3.5" width="3.8" height="17" rx="1" />
  </svg>
);

// Danh sách việc, dùng cho tab Hôm nay
export const IcList = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <path d="M8.5 6h12M8.5 12h12M8.5 18h12" />
    <circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IcMic = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
  </svg>
);

export const IcStop = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)} fill="currentColor" stroke="none">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </svg>
);

// Việc cá nhân
export const IcHome = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6.5 9.7V20h11V9.7" />
  </svg>
);

// Việc cơ quan
export const IcCoQuan = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <rect x="3.5" y="8" width="17" height="11" rx="2" />
    <path d="M9 8V6.5A1.5 1.5 0 0110.5 5h3A1.5 1.5 0 0115 6.5V8M3.5 12.5h17" />
  </svg>
);

// Nhật ký nhìn lại cuối ngày
export const IcJournal = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <path d="M5 4.5A1.5 1.5 0 016.5 3H19v14H6.5A1.5 1.5 0 005 18.5v-14z" />
    <path d="M5 18.5A1.5 1.5 0 016.5 17H19v4H6.5A1.5 1.5 0 015 19.5z" />
    <path d="M9 7.5h6M9 11h4" />
  </svg>
);

// Đổi tên gọi ngay tại lời chào
export const IcPen = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <path d="M14.5 4.5l5 5L8 21H3v-5L14.5 4.5z" />
    <path d="M12.5 6.5l5 5" />
  </svg>
);

// Hoàn thành phiên tập trung
export const IcCheckTron = ({ size = 16, style }: P) => (
  <svg {...goc(size, style)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.4l2.7 2.7 5.6-5.8" />
  </svg>
);
