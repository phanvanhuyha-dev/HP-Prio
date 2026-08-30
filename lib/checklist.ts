// Các bước của một việc được lưu ngay trong cột notes, dạng checklist markdown:
// "- [ ] việc chưa xong" / "- [x] việc đã xong".
// Chọn cách này thay vì thêm bảng subtasks: không phải đổi cấu trúc dữ liệu,
// người dùng sửa tay trong ô ghi chú vẫn hợp lệ, và xuất/di chuyển dữ liệu dễ.

const DONG_BUOC = /^(\s*)- \[( |x|X)\] ?(.*)$/;

export type DongGhiChu =
  | { loai: "buoc"; xong: boolean; noiDung: string }
  | { loai: "van-ban"; noiDung: string };

export function phanTichGhiChu(text: string): DongGhiChu[] {
  return text.split("\n").map((dong) => {
    const m = dong.match(DONG_BUOC);
    if (m) return { loai: "buoc", xong: m[2].toLowerCase() === "x", noiDung: m[3] };
    return { loai: "van-ban", noiDung: dong };
  });
}

export function demBuoc(text: string | null | undefined): { tong: number; xong: number } {
  if (!text) return { tong: 0, xong: 0 };
  let tong = 0;
  let xong = 0;
  for (const dong of text.split("\n")) {
    const m = dong.match(DONG_BUOC);
    if (m) {
      tong++;
      if (m[2].toLowerCase() === "x") xong++;
    }
  }
  return { tong, xong };
}

// Đảo trạng thái bước ở dòng thứ viTriDong (chỉ số dòng trong toàn bộ ghi chú,
// KHÔNG phải chỉ số bước). Dùng chỉ số dòng để hai bước trùng nội dung không
// bị đảo nhầm lẫn nhau.
export function daoBuoc(text: string, viTriDong: number): string {
  const dongs = text.split("\n");
  const m = dongs[viTriDong]?.match(DONG_BUOC);
  if (!m) return text;
  dongs[viTriDong] = `${m[1]}- [${m[2].toLowerCase() === "x" ? " " : "x"}] ${m[3]}`;
  return dongs.join("\n");
}

// Nối các bước AI đề xuất vào cuối ghi chú hiện có.
export function themBuocVaoGhiChu(ghiChuCu: string | null | undefined, cacBuoc: string[]): string {
  const checklist = cacBuoc.map((b) => `- [ ] ${b}`).join("\n");
  const cu = ghiChuCu?.trim();
  return cu ? `${cu}\n\n${checklist}` : checklist;
}

// Sửa nội dung bước ở một dòng. Nội dung mới rỗng nghĩa là xóa bước đó,
// khớp với thói quen "xóa sạch chữ rồi bấm ra ngoài".
export function suaBuoc(text: string, viTriDong: number, noiDungMoi: string): string {
  const dongs = text.split("\n");
  const m = dongs[viTriDong]?.match(DONG_BUOC);
  if (!m) return text;
  const nd = noiDungMoi.trim();
  if (!nd) {
    dongs.splice(viTriDong, 1);
    return dongs.join("\n");
  }
  dongs[viTriDong] = `${m[1]}- [${m[2]}] ${nd}`;
  return dongs.join("\n");
}

// Xóa hẳn một bước. Chỉ xóa dòng đúng là bước, không đụng dòng văn bản thường.
export function xoaBuoc(text: string, viTriDong: number): string {
  const dongs = text.split("\n");
  if (!dongs[viTriDong]?.match(DONG_BUOC)) return text;
  dongs.splice(viTriDong, 1);
  return dongs.join("\n");
}

// Thêm một bước mới vào cuối ghi chú.
export function themMotBuoc(text: string | null | undefined, noiDung: string): string {
  const nd = noiDung.trim();
  if (!nd) return text ?? "";
  const dong = `- [ ] ${nd}`;
  if (!text?.trim()) return dong;
  return text.replace(/\s+$/, "") + "\n" + dong;
}
