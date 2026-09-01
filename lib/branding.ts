// Tên trợ lý AI. "Bé iu" chỉ còn là mặc định: mỗi người tự đổi trong Cài đặt
// và tên đó lưu ở user_settings.ten_tro_ly, đồng bộ mọi thiết bị.
//
// Phía giao diện đừng nhập hằng số này mà dùng useTenTroLy() trong
// components/TroLy.tsx, để đổi tên là thấy đổi ngay khắp màn hình.
export const TEN_TRO_LY_MAC_DINH = "Bé iu";

export const DAI_TOI_DA_TEN_TRO_LY = 24;

// Tên này được nhúng thẳng vào prompt gửi cho AI, nên phải bỏ ký tự xuống
// dòng và ký tự điều khiển: một cái tên nhiều dòng có thể lợi dụng để chèn
// thêm chỉ dẫn vào prompt. Cắt cả độ dài để prompt không phình ra.
//
// Lọc theo mã ký tự chứ không dùng biểu thức chính quy, vì viết dải điều khiển
// bằng chuỗi thoát dễ bị công cụ soạn thảo ghi nhầm thành ký tự thật.
export function chuanHoaTenTroLy(x: unknown): string {
  if (typeof x !== "string") return TEN_TRO_LY_MAC_DINH;
  // Đổi ký tự điều khiển THÀNH KHOẢNG TRẮNG chứ không xóa hẳn: xóa hẳn thì
  // "Trợ lý\nHà" dính lại thành "Trợ lýHà", sai tên người dùng gõ.
  const sach = Array.from(x)
    .map((c) => {
      const ma = c.codePointAt(0) ?? 0;
      return ma < 32 || ma === 127 ? " " : c;
    })
    .join("");
  // trim lần hai sau khi cắt: cắt đúng vào giữa hai từ sẽ để lại khoảng trắng thừa
  const s = sach.replace(/\s+/g, " ").trim().slice(0, DAI_TOI_DA_TEN_TRO_LY).trim();
  return s || TEN_TRO_LY_MAC_DINH;
}
