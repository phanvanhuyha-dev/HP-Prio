"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

// Đọc bằng window thay vì useSearchParams để trang này vẫn được dựng sẵn tĩnh
// mà không cần bọc Suspense.
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Tài khoản Google này không có quyền truy cập. App chỉ mở cho email chủ sở hữu.",
  Configuration: "Máy chủ chưa được cấu hình đúng. Kiểm tra lại biến môi trường trên Vercel.",
  Verification: "Liên kết đăng nhập đã hết hạn, anh thử lại.",
  Default: "Đăng nhập không thành công, anh thử lại."
};

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(ERROR_MESSAGES[code] || ERROR_MESSAGES.Default);
  }, []);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 24,
        textAlign: "center"
      }}
    >
      <div>
        <div
          className="mono"
          style={{ color: "var(--teal)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 10 }}
        >
          KHẨN CẤP × QUAN TRỌNG
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(36px, 8vw, 56px)",
            fontWeight: 600,
            margin: 0,
            color: "var(--cream)"
          }}
        >
          HPPrio
        </h1>
        <p style={{ color: "var(--slate)", maxWidth: 340, margin: "14px auto 0", lineHeight: 1.5 }}>
          Nói ra việc cần làm. AI phân loại khẩn cấp và quan trọng. Anh duyệt và hành động.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            color: "var(--coral)",
            fontSize: 13,
            maxWidth: 340,
            margin: 0,
            lineHeight: 1.5,
            background: "rgba(217, 99, 75, 0.1)",
            border: "1px solid var(--coral)",
            borderRadius: 10,
            padding: "10px 14px"
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        style={{
          background: "var(--cream)",
          color: "var(--navy)",
          border: "none",
          borderRadius: 10,
          padding: "14px 28px",
          fontSize: 15,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}
      >
        Đăng nhập bằng Google
      </button>
    </main>
  );
}
