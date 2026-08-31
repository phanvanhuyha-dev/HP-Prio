// Tiện ích gọi API dùng chung cho phía trình duyệt.

// Đọc thông báo lỗi từ một Response.
// Bắt buộc phải chống được body KHÔNG phải JSON: khi hạ tầng Vercel trả 503,
// body là text/plain "Service Unavailable". Gọi res.json() sẽ ném SyntaxError
// và lỗi JS thô đó lọt thẳng ra màn hình người dùng.
export async function docLoi(res: Response): Promise<string> {
  let data: any = null;
  try {
    data = await res.clone().json();
  } catch {
    // Không phải JSON, rơi xuống nhánh phân loại theo mã HTTP bên dưới
  }
  if (typeof data?.error === "string" && data.error.trim()) return data.error;

  if (res.status === 401) return "Phiên đăng nhập đã hết hạn, anh đăng nhập lại giúp.";
  if (res.status === 403) return "Anh không có quyền thực hiện thao tác này.";
  if (res.status === 404) return "Không tìm thấy việc này, có thể đã bị xóa.";
  if (res.status === 413) return "Nội dung quá lớn, anh rút gọn bớt giúp.";
  if (res.status === 429) return "Hệ thống đang quá tải, anh chờ một lát rồi thử lại.";
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return "Máy chủ AI đang quá tải hoặc tạm gián đoạn, anh thử lại sau ít phút.";
  }
  if (res.status >= 500) return "Máy chủ gặp sự cố, anh thử lại. Nếu vẫn lỗi, mở /api/health để xem chi tiết.";
  return "Thao tác không thành công, anh thử lại.";
}

// Dịch lỗi ném ra từ fetch (không phải lỗi HTTP) sang câu người dùng hiểu được.
export function loiThanThien(e: any): string {
  if (e?.name === "AbortError") {
    return "Đã dừng theo yêu cầu. Anh thử lại, hoặc bấm “Bỏ qua AI” để tự nhập.";
  }
  if (e?.name === "TimeoutError" || e?.quaHan) {
    return "AI phản hồi quá lâu nên đã dừng. Anh thử lại, hoặc bấm “Bỏ qua AI” để tự nhập.";
  }
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(e?.message))) {
    return "Mất kết nối mạng. Anh kiểm tra đường truyền rồi thử lại, nội dung vừa gõ vẫn được giữ.";
  }
  if (e instanceof SyntaxError) {
    return "Máy chủ trả về dữ liệu không đọc được, anh thử lại sau ít phút.";
  }
  return e?.message || "Có lỗi xảy ra, anh thử lại.";
}

// Rung nhẹ khi hoàn thành một thao tác (điện thoại hỗ trợ thì rung, không thì thôi).
export function rung(ms = 12) {
  try {
    (navigator as any).vibrate?.(ms);
  } catch {}
}

// Định dạng ngày giờ kiểu Việt Nam. Ô <input type="datetime-local"> hiển thị
// theo ngôn ngữ của trình duyệt (ra "01-Aug-2026 09:00 AM") và không ép được,
// nên hiện thêm một dòng phụ bằng tiếng Việt ngay dưới ô.
export function ngayVN(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} lúc ${p(d.getHours())}:${p(d.getMinutes())}`;
}
