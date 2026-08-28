"use client";
import { Fragment } from "react";

// Bắt đường link http/https. Loại các ký tự đóng câu ở cuối để không nuốt
// dấu chấm, dấu ngoặc đứng ngay sau link.
const URL_RE = /(https?:\/\/[^\s<>"'`\]),]+[^\s<>"'`\]),.;:!?])/g;
const LA_URL = /^https?:\/\//i;

// Biến link trong ghi chú thành thẻ bấm được, KHÔNG dùng dangerouslySetInnerHTML.
// Ghi chú là dữ liệu người dùng nhập, dựng HTML từ chuỗi thô là mở đường cho XSS.
// Cách này để React tự thoát ký tự, chỉ những đoạn khớp đúng http/https mới
// thành thẻ a, phần còn lại luôn là văn bản thuần.
export default function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);

  return (
    <>
      {parts.map((part, i) =>
        LA_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--amber)", wordBreak: "break-all" }}
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}
