import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveTenGoi, getCaiDat, saveIcsUrls, saveTenTroLy } from "@/lib/db";
import { chuanHoaTenTroLy, TEN_TRO_LY_MAC_DINH } from "@/lib/branding";
import { tachDanhSachIcs, cheUrlIcs, TOI_DA_LICH } from "@/lib/ics-url";
import { kiemTenMien, taiIcs, laLoiBaoMat } from "@/lib/tai-ics";
import { xoaDemLich } from "@/lib/calendar";
import { describeDbError, loiJson } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
// Lưu lịch có thử tải thật, mỗi liên kết tối đa 8 giây và chạy song song
export const maxDuration = 60;

// Cấu hình của riêng người đang đăng nhập. Lưu máy chủ để mọi thiết bị
// (web, iPhone) cùng thấy, thay vì localStorage theo từng máy như trước.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const cd = await getCaiDat(session.user.email);
    return NextResponse.json({
      tenGoi: cd.tenGoi,
      tenTroLy: chuanHoaTenTroLy(cd.tenTroLy),
      // Trả về nguyên liên kết để người dùng sửa được, kèm bản che sẵn để
      // giao diện hiện ra màn hình mà không phơi phần bí mật.
      icsUrls: cd.icsUrls,
      icsChe: cd.icsUrls.map(cheUrlIcs)
    });
  } catch (err) {
    return loiJson(describeDbError(err), "settings");
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }

  // Chỉ đụng vào trường nào thực sự được gửi lên. Bản trước mặc định coi
  // tenGoi vắng mặt là chuỗi rỗng, nên một gói tin chỉ đổi lịch sẽ xóa mất tên.
  const doiTen = "tenGoi" in body;
  const doiTroLy = "tenTroLy" in body;
  const doiLich = "icsUrls" in body;
  if (!doiTen && !doiTroLy && !doiLich) {
    return NextResponse.json({ error: "Không có gì để cập nhật" }, { status: 400 });
  }

  const ketQua: Record<string, unknown> = { ok: true };

  if (doiTen) {
    if (body.tenGoi !== null && typeof body.tenGoi !== "string") {
      return NextResponse.json({ error: "Tên gọi không hợp lệ" }, { status: 400 });
    }
    const ten = typeof body.tenGoi === "string" ? body.tenGoi.trim().slice(0, 40) : "";
    try {
      await saveTenGoi(session.user.email, ten || null);
      ketQua.tenGoi = ten || null;
    } catch (err) {
      return loiJson(describeDbError(err), "settings");
    }
  }

  if (doiTroLy) {
    if (body.tenTroLy !== null && typeof body.tenTroLy !== "string") {
      return NextResponse.json({ error: "Tên trợ lý không hợp lệ" }, { status: 400 });
    }
    // Để trống là quay về mặc định: lưu null chứ không lưu sẵn chữ "Bé iu",
    // để sau này đổi mặc định thì người chưa đặt tên vẫn đi theo mặc định mới.
    const tho = typeof body.tenTroLy === "string" ? body.tenTroLy : "";
    const sach = chuanHoaTenTroLy(tho);
    const luu = sach === TEN_TRO_LY_MAC_DINH ? null : sach;
    try {
      await saveTenTroLy(session.user.email, luu);
      ketQua.tenTroLy = sach;
    } catch (err) {
      return loiJson(describeDbError(err), "settings");
    }
  }

  if (doiLich) {
    // Nhận cả chuỗi nhiều dòng lẫn mảng, người dùng thường dán thẳng
    const tho = Array.isArray(body.icsUrls)
      ? body.icsUrls.filter((u: unknown) => typeof u === "string").join("\n")
      : typeof body.icsUrls === "string"
        ? body.icsUrls
        : null;
    if (tho === null) {
      return NextResponse.json({ error: "Liên kết lịch không hợp lệ" }, { status: 400 });
    }
    if (tho.length > 3000) {
      return NextResponse.json({ error: "Danh sách lịch quá dài" }, { status: 400 });
    }

    const { hopLe, loi } = tachDanhSachIcs(tho);

    // THỬ TẢI THẬT ngay lúc lưu, chạy song song để không cộng dồn thời gian.
    //
    // Lọc theo chuỗi và kiểm DNS ở trên chỉ soi được đúng địa chỉ người dùng
    // gõ. Một địa chỉ công khai trả về chuyển hướng vào mạng nội bộ thì hai
    // lớp đó đều cho qua, và tuy taiIcs vẫn chặn ở từng chặng nên không có rò
    // rỉ, người dùng lại thấy báo "Đã lưu" rồi lịch im lặng không hiện.
    //
    // Thử tải một lần biến lớp phòng thủ đó thành thứ nhìn thấy được, đồng
    // thời bắt luôn liên kết gõ sai, liên kết đã bị thu hồi, và địa chỉ không
    // phải lịch.
    const canhBao: string[] = [];
    await Promise.all(
      hopLe.map(async (u) => {
        const ten = cheUrlIcs(u);
        try {
          const vd = await kiemTenMien(new URL(u).hostname);
          if (vd) {
            loi.push(`${ten}: ${vd}`);
            return;
          }
        } catch {
          loi.push(`${ten}: không kiểm được tên miền`);
          return;
        }

        try {
          const noiDung = await taiIcs(u);
          if (!noiDung.includes("BEGIN:VCALENDAR")) {
            canhBao.push(`${ten}: tải được nhưng nội dung không phải lịch iCal`);
          }
        } catch (err: any) {
          // Bị chặn vì an toàn thì TỪ CHỐI lưu. Hỏng vì mạng hay máy chủ bên
          // kia thì vẫn lưu và chỉ nhắc, vì lỗi đó có thể chỉ là nhất thời.
          if (laLoiBaoMat(err)) loi.push(`${ten}: ${err.message}`);
          else canhBao.push(`${ten}: ${err?.message ?? "chưa tải được"}`);
        }
      })
    );

    // Có dòng sai thì KHÔNG lưu nửa vời, báo rõ dòng nào sai để sửa
    if (loi.length > 0) {
      return NextResponse.json(
        {
          error: `Có ${loi.length} liên kết không dùng được`,
          khacPhuc: loi.join(" | "),
          maxLich: TOI_DA_LICH
        },
        { status: 400 }
      );
    }

    try {
      await saveIcsUrls(session.user.email, hopLe);
      // Bỏ bộ đệm để lịch mới hiện ngay, không đợi hết 10 phút
      xoaDemLich(session.user.email);
      ketQua.icsUrls = hopLe;
      ketQua.icsChe = hopLe.map(cheUrlIcs);
      // Lưu được nhưng chưa tải được: vẫn báo cho người dùng biết thay vì để
      // họ tưởng xong rồi ngồi đợi lịch không bao giờ hiện.
      if (canhBao.length > 0) ketQua.canhBao = canhBao.join(" | ");
    } catch (err) {
      return loiJson(describeDbError(err), "settings");
    }
  }

  return NextResponse.json(ketQua);
}
