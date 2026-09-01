import crypto from "node:crypto";
import { getMsToken, saveMsToken, xoaMsToken } from "./db";
import { maHoa, giaiMa } from "./ma-hoa";
import type { SuKien } from "./calendar";

// Đọc lịch Microsoft 365 qua Microsoft Graph.
//
// Vì sao cần: nhiều công ty tắt tính năng xuất bản lịch (Shared calendars) ở
// cấp tenant, nên nhân viên không lấy được đường liên kết ICS. Graph là đường
// chính thức còn lại, xin quyền CHỈ ĐỌC lịch (Calendars.Read).
//
// Đây KHÔNG phải cách đăng nhập vào app. App vẫn đăng nhập bằng Google, còn
// tài khoản Microsoft chỉ được nối thêm để đọc lịch. Tách như vậy để cổng
// OWNER_EMAIL không phải hiểu hai nhà cung cấp danh tính.

const SCOPE = "offline_access Calendars.Read User.Read";

export function cauHinhMs(): { clientId: string; clientSecret: string; tenant: string } | null {
  const clientId = process.env.MS_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  // "common" nhận cả tài khoản công ty lẫn cá nhân; đặt MS_TENANT thành mã
  // tenant cụ thể nếu muốn chỉ cho phép đúng công ty đăng nhập.
  return { clientId, clientSecret, tenant: process.env.MS_TENANT?.trim() || "common" };
}

export function duongDanChuyenHuong(): string {
  const goc = process.env.NEXTAUTH_URL?.trim().replace(/\/+$/, "");
  if (!goc) throw new Error("Thiếu NEXTAUTH_URL nên không dựng được địa chỉ quay lại");
  return `${goc}/api/ms/callback`;
}

// --- Bước 1: đưa người dùng sang trang đăng nhập Microsoft -------------------

export function taoPkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function urlDangNhap(state: string, challenge: string): string {
  const c = cauHinhMs();
  if (!c) throw new Error("Chưa cấu hình MS_CLIENT_ID và MS_CLIENT_SECRET");
  const q = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: duongDanChuyenHuong(),
    response_mode: "query",
    scope: SCOPE,
    state,
    // PKCE: dù đây là client có secret, thêm PKCE vẫn chặn được trường hợp mã
    // code bị chộp giữa đường rồi đem đi đổi token ở nơi khác.
    code_challenge: challenge,
    code_challenge_method: "S256"
  });
  return `https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/authorize?${q}`;
}

// --- Bước 2: đổi mã lấy token ------------------------------------------------

type PhanHoiToken = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

async function goiToken(than: Record<string, string>): Promise<PhanHoiToken> {
  const c = cauHinhMs();
  if (!c) throw new Error("Chưa cấu hình MS_CLIENT_ID và MS_CLIENT_SECRET");
  const res = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: SCOPE,
      ...than
    })
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Microsoft trả lý do trong error_description, giữ nguyên để dịch sang
    // tiếng Việt ở lớp trên chứ đừng nuốt mất.
    const err: any = new Error(d?.error_description || d?.error || `Microsoft trả lỗi ${res.status}`);
    err.maMs = d?.error;
    err.moTaMs = d?.error_description;
    throw err;
  }
  return d as PhanHoiToken;
}

async function emailMicrosoft(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.mail || d?.userPrincipalName || null;
  } catch {
    return null;
  }
}

export async function doiMaLayToken(userEmail: string, code: string, verifier: string): Promise<string | null> {
  const t = await goiToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: duongDanChuyenHuong(),
    code_verifier: verifier
  });
  if (!t.refresh_token) {
    throw new Error("Microsoft không cấp refresh token, thiếu quyền offline_access");
  }
  const msEmail = await emailMicrosoft(t.access_token);
  await saveMsToken(userEmail, {
    refreshToken: maHoa(t.refresh_token),
    accessToken: maHoa(t.access_token),
    hetHan: new Date(Date.now() + t.expires_in * 1000),
    msEmail
  });
  return msEmail;
}

// --- Bước 3: giữ access token còn hạn ----------------------------------------

const DEM_HAN_MS = 60_000; // làm mới sớm một phút, tránh hết hạn giữa lúc gọi

async function accessTokenConHan(userEmail: string): Promise<string | null> {
  const ban = await getMsToken(userEmail);
  if (!ban) return null;

  if (ban.access_token && ban.het_han && new Date(ban.het_han).getTime() - Date.now() > DEM_HAN_MS) {
    try {
      return giaiMa(ban.access_token);
    } catch {
      // Giải mã hỏng (đổi NEXTAUTH_SECRET chẳng hạn) thì đi làm mới như thường
    }
  }

  let refresh: string;
  try {
    refresh = giaiMa(ban.refresh_token);
  } catch {
    // Không giải mã nổi refresh token thì bản ghi này vô dụng, dọn đi để giao
    // diện hiện lại nút nối tài khoản thay vì báo lỗi mãi.
    await xoaMsToken(userEmail);
    throw new Error("Không đọc được token đã lưu, anh nối lại tài khoản Microsoft giúp em");
  }

  try {
    const t = await goiToken({ grant_type: "refresh_token", refresh_token: refresh });
    await saveMsToken(userEmail, {
      // Microsoft xoay vòng refresh token; không có cái mới thì giữ cái cũ
      refreshToken: maHoa(t.refresh_token ?? refresh),
      accessToken: maHoa(t.access_token),
      hetHan: new Date(Date.now() + t.expires_in * 1000),
      msEmail: ban.ms_email
    });
    return t.access_token;
  } catch (err: any) {
    // invalid_grant nghĩa là người dùng đã thu hồi quyền, hoặc công ty đổi mật
    // khẩu. Xóa bản ghi để không thử lại vô ích mỗi lần mở app.
    if (err?.maMs === "invalid_grant") {
      await xoaMsToken(userEmail);
      throw new Error("Quyền đọc lịch đã hết hiệu lực, anh nối lại tài khoản Microsoft giúp em");
    }
    throw err;
  }
}

// --- Bước 4: đọc lịch --------------------------------------------------------

export async function suKienMicrosoft(userEmail: string, tu: Date, den: Date): Promise<SuKien[]> {
  const token = await accessTokenConHan(userEmail);
  if (!token) return [];

  // calendarView tự khai triển sự kiện lặp thành từng lần, đỡ phải tự tính
  // rrule như bên ICS. Giờ trả về theo UTC vì không gửi header Prefer.
  const q = new URLSearchParams({
    startDateTime: tu.toISOString(),
    endDateTime: den.toISOString(),
    $select: "subject,start,end,isAllDay,showAs",
    $orderby: "start/dateTime",
    $top: "50"
  });

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error?.message || `Graph trả lỗi ${res.status}`);
  }
  const d = await res.json();
  const ds: any[] = Array.isArray(d?.value) ? d.value : [];

  return ds
    // Khoảng đã nhận là rảnh thì không phải cuộc họp, đừng làm rối dải lịch
    .filter((e) => e?.showAs !== "free")
    .map((e) => {
      // Graph trả "2026-09-01T08:30:00.0000000" không kèm múi giờ, đó là UTC
      const iso = (x: string) => new Date(`${x.replace(/\.\d+$/, "")}Z`).toISOString();
      return {
        tieuDe: String(e?.subject ?? "(không có tiêu đề)").slice(0, 200),
        batDau: iso(e?.start?.dateTime),
        ketThuc: iso(e?.end?.dateTime),
        caNgay: Boolean(e?.isAllDay)
      } as SuKien;
    })
    .filter((s) => !Number.isNaN(new Date(s.batDau).getTime()));
}

export async function daNoiMicrosoft(userEmail: string): Promise<{ noi: boolean; msEmail: string | null }> {
  try {
    const ban = await getMsToken(userEmail);
    return { noi: Boolean(ban), msEmail: ban?.ms_email ?? null };
  } catch {
    return { noi: false, msEmail: null };
  }
}
