"use client";
import { useState } from "react";
import Linkify from "./Linkify";
import { phanTichGhiChu, daoBuoc, suaBuoc, xoaBuoc, themMotBuoc } from "@/lib/checklist";
import { rung } from "@/lib/client-api";

// Hiển thị ghi chú: dòng "- [ ]" thành ô đánh dấu bấm được, các dòng còn lại
// là văn bản thuần với đường link bấm được. Vẫn đi qua Linkify nên không có
// đường nào dựng HTML từ chuỗi người dùng nhập (xem chú thích trong Linkify).
//
// Có onDoi thì tick được. Thêm choSua thì từng bước sửa/xóa được tại chỗ:
// bấm vào chữ để sửa (Enter lưu, Escape hủy, xóa sạch chữ nghĩa là xóa bước),
// nút ✕ xóa thẳng, và có nút thêm bước mới ở cuối.
export default function NotesView({
  text,
  onDoi,
  choSua = false
}: {
  text: string;
  onDoi?: (moi: string) => void;
  choSua?: boolean;
}) {
  const dongs = phanTichGhiChu(text);
  const suaDuoc = choSua && Boolean(onDoi);
  const [dangSuaDong, setDangSuaDong] = useState<number | null>(null);
  const [nhapDong, setNhapDong] = useState("");
  const [dangThem, setDangThem] = useState(false);
  const [nhapMoi, setNhapMoi] = useState("");

  function luuSua(viTri: number) {
    setDangSuaDong(null);
    onDoi?.(suaBuoc(text, viTri, nhapDong));
  }

  function luuThem() {
    const nd = nhapMoi.trim();
    setNhapMoi("");
    if (!nd) {
      setDangThem(false);
      return;
    }
    // Giữ ô nhập mở để gõ tiếp bước sau, nhập liên tục đỡ phải bấm lại
    onDoi?.(themMotBuoc(text, nd));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {dongs.map((d, i) =>
        d.loai === "buoc" ? (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, minHeight: suaDuoc ? 36 : 28 }}>
            <input
              type="checkbox"
              checked={d.xong}
              disabled={!onDoi}
              aria-label={`Đánh dấu bước: ${d.noiDung}`}
              onChange={() => {
                rung(8);
                onDoi?.(daoBuoc(text, i));
              }}
              style={{ marginTop: suaDuoc ? 8 : 4, width: 16, height: 16, accentColor: "var(--teal)", flexShrink: 0, cursor: onDoi ? "pointer" : "default" }}
            />

            {dangSuaDong === i ? (
              <input
                value={nhapDong}
                autoFocus
                onChange={(e) => setNhapDong(e.target.value)}
                onBlur={() => luuSua(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") luuSua(i);
                  if (e.key === "Escape") setDangSuaDong(null);
                }}
                aria-label="Sửa nội dung bước"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "var(--navy)",
                  border: "1px solid var(--amber)",
                  borderRadius: 6,
                  padding: "5px 8px",
                  color: "var(--cream)",
                  fontSize: "inherit",
                  fontFamily: "var(--font-body)"
                }}
              />
            ) : suaDuoc ? (
              <button
                onClick={() => {
                  setNhapDong(d.noiDung);
                  setDangSuaDong(i);
                }}
                title="Bấm để sửa bước này"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "none",
                  border: "none",
                  padding: "4px 0",
                  textAlign: "left",
                  color: "inherit",
                  fontSize: "inherit",
                  fontFamily: "inherit",
                  lineHeight: "inherit",
                  textDecoration: d.xong ? "line-through" : "none",
                  opacity: d.xong ? 0.55 : 1,
                  wordBreak: "break-word",
                  cursor: "text"
                }}
              >
                <Linkify text={d.noiDung} />
              </button>
            ) : (
              <span
                style={{
                  textDecoration: d.xong ? "line-through" : "none",
                  opacity: d.xong ? 0.55 : 1,
                  wordBreak: "break-word",
                  padding: "2px 0"
                }}
              >
                <Linkify text={d.noiDung} />
              </span>
            )}

            {suaDuoc && dangSuaDong !== i && (
              <button
                onClick={() => onDoi?.(xoaBuoc(text, i))}
                aria-label={`Xóa bước: ${d.noiDung}`}
                title="Xóa bước"
                className="tap"
                style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 12, flexShrink: 0, margin: "-6px -10px" }}
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div
            key={i}
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              minHeight: d.noiDung ? undefined : 10
            }}
          >
            <Linkify text={d.noiDung} />
          </div>
        )
      )}

      {suaDuoc &&
        (dangThem ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span aria-hidden="true" style={{ width: 16, textAlign: "center", color: "var(--slate)" }}>+</span>
            <input
              value={nhapMoi}
              autoFocus
              placeholder="Bước mới..."
              onChange={(e) => setNhapMoi(e.target.value)}
              onBlur={luuThem}
              onKeyDown={(e) => {
                if (e.key === "Enter") luuThem();
                if (e.key === "Escape") {
                  setNhapMoi("");
                  setDangThem(false);
                }
              }}
              aria-label="Nội dung bước mới"
              style={{
                flex: 1,
                minWidth: 0,
                background: "var(--navy)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "5px 8px",
                color: "var(--cream)",
                fontSize: "inherit",
                fontFamily: "var(--font-body)"
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setDangThem(true)}
            style={{
              alignSelf: "flex-start",
              background: "none",
              border: "none",
              color: "var(--slate)",
              fontSize: 12.5,
              padding: "8px 0",
              minHeight: 36,
              textDecoration: "underline",
              textUnderlineOffset: 3
            }}
          >
            + Thêm bước
          </button>
        ))}
    </div>
  );
}
