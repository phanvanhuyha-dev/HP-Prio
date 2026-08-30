"use client";
import Linkify from "./Linkify";
import { phanTichGhiChu, daoBuoc } from "@/lib/checklist";

// Hiển thị ghi chú: dòng "- [ ]" thành ô đánh dấu bấm được, các dòng còn lại
// là văn bản thuần với đường link bấm được. Vẫn đi qua Linkify nên không có
// đường nào dựng HTML từ chuỗi người dùng nhập (xem chú thích trong Linkify).
export default function NotesView({
  text,
  onDoi
}: {
  text: string;
  // Có mặt thì các ô đánh dấu bấm được và trả về toàn bộ ghi chú sau khi đảo.
  onDoi?: (moi: string) => void;
}) {
  const dongs = phanTichGhiChu(text);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {dongs.map((d, i) =>
        d.loai === "buoc" ? (
          <label
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              cursor: onDoi ? "pointer" : "default",
              // Vùng chạm đủ cao cho ngón tay, khớp chuẩn 44px của các nút khác
              minHeight: 28,
              padding: "2px 0"
            }}
          >
            <input
              type="checkbox"
              checked={d.xong}
              disabled={!onDoi}
              onChange={() => onDoi?.(daoBuoc(text, i))}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--teal)", flexShrink: 0 }}
            />
            <span
              style={{
                textDecoration: d.xong ? "line-through" : "none",
                opacity: d.xong ? 0.55 : 1,
                wordBreak: "break-word"
              }}
            >
              <Linkify text={d.noiDung} />
            </span>
          </label>
        ) : (
          <div
            key={i}
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              // Dòng trống vẫn chiếm chỗ để giữ khoảng cách người dùng đã gõ
              minHeight: d.noiDung ? undefined : 10
            }}
          >
            <Linkify text={d.noiDung} />
          </div>
        )
      )}
    </div>
  );
}
