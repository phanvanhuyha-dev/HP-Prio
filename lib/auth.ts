import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";

// Chỉ email của anh Hà Phan mới được đăng nhập — chặn hết các Google account khác.
const ALLOWED_EMAIL = process.env.OWNER_EMAIL;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ],
  callbacks: {
    async signIn({ user }) {
      // Chặn mặc định: nếu quên set OWNER_EMAIL trên Vercel thì KHÔNG cho ai vào,
      // tuyệt đối không mở cửa cho mọi tài khoản Google.
      if (!ALLOWED_EMAIL) {
        console.error("Chưa cấu hình OWNER_EMAIL — từ chối mọi lượt đăng nhập.");
        return false;
      }
      return user.email?.toLowerCase() === ALLOWED_EMAIL.trim().toLowerCase();
    },
    async session({ session }) {
      return session;
    }
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  session: { strategy: "jwt" }
};
