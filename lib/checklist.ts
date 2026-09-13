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

// Phân tích ghi chú xem có các bước (checklist) hay văn bản thường (link, mô tả),
// giúp giao diện tách bạch hai phần và ẩn phần không có thông tin.
export function phanTichNotesTongQuat(text: string | null | undefined): {
  coBuoc: boolean;
  coVanBan: boolean;
  vanBan: string;
  tongBuoc: number;
  soXong: number;
} {
  if (!text || !text.trim()) {
    return { coBuoc: false, coVanBan: false, vanBan: "", tongBuoc: 0, soXong: 0 };
  }
  const dongs = phanTichGhiChu(text);
  const buocs = dongs.filter((d) => d.loai === "buoc");
  const vanBanDongs = dongs.filter((d) => d.loai === "van-ban").map((d) => d.noiDung);
  const vanBan = vanBanDongs.join("\n").trim();
  const soXong = buocs.filter((b) => b.loai === "buoc" && b.xong).length;

  return {
    coBuoc: buocs.length > 0,
    coVanBan: vanBan.length > 0,
    vanBan,
    tongBuoc: buocs.length,
    soXong
  };
}

// Cập nhật phần văn bản thường (link, mô tả) trong ghi chú mà giữ nguyên các bước thực hiện.
export function capNhatVanBanTrongGhiChu(text: string | null | undefined, vanBanMoi: string): string {
  const buocDongs = (text ?? "").split("\n").filter((d) => d.match(DONG_BUOC));
  const vb = vanBanMoi.trim();
  if (buocDongs.length === 0) return vb;
  if (!vb) return buocDongs.join("\n");
  return `${vb}\n\n${buocDongs.join("\n")}`;
}

// Lấy riêng các dòng checklist để hiển thị danh sách bước
export function layCacDongBuoc(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split("\n")
    .filter((d) => d.match(DONG_BUOC))
    .join("\n");
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

// Di chuyển một bước lên trên (đổi chỗ với bước liền trước nó)
export function diChuyenBuocLen(text: string, viTriDong: number): string {
  const dongs = text.split("\n");
  if (!dongs[viTriDong]?.match(DONG_BUOC)) return text;

  let viTriTruoc = -1;
  for (let i = viTriDong - 1; i >= 0; i--) {
    if (dongs[i].match(DONG_BUOC)) {
      viTriTruoc = i;
      break;
    }
  }

  if (viTriTruoc === -1) return text;

  const tam = dongs[viTriDong];
  dongs[viTriDong] = dongs[viTriTruoc];
  dongs[viTriTruoc] = tam;
  return dongs.join("\n");
}

// Di chuyển một bước xuống dưới (đổi chỗ với bước liền sau nó)
export function diChuyenBuocXuong(text: string, viTriDong: number): string {
  const dongs = text.split("\n");
  if (!dongs[viTriDong]?.match(DONG_BUOC)) return text;

  let viTriSau = -1;
  for (let i = viTriDong + 1; i < dongs.length; i++) {
    if (dongs[i].match(DONG_BUOC)) {
      viTriSau = i;
      break;
    }
  }

  if (viTriSau === -1) return text;

  const tam = dongs[viTriDong];
  dongs[viTriDong] = dongs[viTriSau];
  dongs[viTriSau] = tam;
  return dongs.join("\n");
}

// Chuyển một bước từ dòng nguồn sang vị trí dòng đích (dùng cho kéo thả)
export function chuyenViTriBuoc(text: string, viTriDongNguon: number, viTriDongDich: number): string {
  if (viTriDongNguon === viTriDongDich) return text;
  const dongs = text.split("\n");
  if (!dongs[viTriDongNguon]?.match(DONG_BUOC) || !dongs[viTriDongDich]?.match(DONG_BUOC)) return text;

  const [dongKeo] = dongs.splice(viTriDongNguon, 1);
  dongs.splice(viTriDongDich, 0, dongKeo);
  return dongs.join("\n");
}
