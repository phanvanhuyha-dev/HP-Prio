"use client";
import { useState } from "react";
import Linkify from "./Linkify";
import {
  phanTichGhiChu,
  daoBuoc,
  suaBuoc,
  xoaBuoc,
  themMotBuoc,
  diChuyenBuocLen,
  diChuyenBuocXuong,
  chuyenViTriBuoc
} from "@/lib/checklist";
import { IcArrowUp, IcArrowDown, IcGrip } from "./icons";
import { rung } from "@/lib/client-api";

// Hiển thị ghi chú: dòng "- [ ]" thành ô đánh dấu bấm được, các dòng còn lại
// là văn bản thuần với đường link bấm được. Vẫn đi qua Linkify nên không có
// đường nào dựng HTML từ chuỗi người dùng nhập (xem chú thích trong Linkify).
//
// Có onDoi thì tick được. Thêm choSua thì từng bước sửa/xóa được tại chỗ:
// bấm vào chữ để sửa (Enter lưu, Escape hủy, xóa sạch chữ nghĩa là xóa bước),
// kéo thả (drag & drop) hoặc bấm mũi tên lên/xuống để đổi thứ tự,
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

  // Trạng thái kéo thả
  const [keoDong, setKeoDong] = useState<number | null>(null);
  const [roiVaoDong, setRoiVaoDong] = useState<number | null>(null);

  // Danh sách chỉ số dòng của các bước để xác định bước đầu / bước cuối
  const chiSoCacBuoc = dongs
    .map((d, idx) => (d.loai === "buoc" ? idx : -1))
    .filter((idx) => idx !== -1);

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
      {dongs.map((d, i) => {
        if (d.loai !== "buoc") {
          return (
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
          );
        }

        const chiSoThu = chiSoCacBuoc.indexOf(i);
        const laBuocDau = chiSoThu === 0;
        const laBuocCuoi = chiSoThu === chiSoCacBuoc.length - 1;

        return (
          <div
            key={i}
            data-step-line={i}
            onDragOver={(e) => {
              if (keoDong !== null && keoDong !== i) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (roiVaoDong !== i) setRoiVaoDong(i);
              }
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as HTMLElement | null;
              if (!e.currentTarget.contains(related) && roiVaoDong === i) {
                setRoiVaoDong(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (keoDong !== null && keoDong !== i) {
                rung(12);
                onDoi?.(chuyenViTriBuoc(text, keoDong, i));
              }
              setKeoDong(null);
              setRoiVaoDong(null);
            }}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              minHeight: suaDuoc ? 36 : 28,
              position: "relative",
              padding: suaDuoc ? "3px 4px" : "1px 0",
              borderRadius: 6,
              opacity: keoDong === i ? 0.35 : 1,
              borderTop: roiVaoDong === i && keoDong !== null && keoDong > i ? "2px solid var(--amber)" : "2px solid transparent",
              borderBottom: roiVaoDong === i && keoDong !== null && keoDong < i ? "2px solid var(--amber)" : "2px solid transparent",
              background: roiVaoDong === i && keoDong !== null && keoDong !== i ? "rgba(34, 211, 238, 0.08)" : undefined,
              transition: "background 0.15s ease, opacity 0.15s ease"
            }}
          >
            {suaDuoc && (
              <div
                draggable={dangSuaDong === null}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", String(i));
                  e.dataTransfer.effectAllowed = "move";
                  setKeoDong(i);
                  rung(8);
                }}
                onDragEnd={() => {
                  setKeoDong(null);
                  setRoiVaoDong(null);
                }}
                onTouchStart={() => {
                  setKeoDong(i);
                  rung(8);
                }}
                onTouchMove={(e) => {
                  const touch = e.touches[0];
                  const elem = document.elementFromPoint(touch.clientX, touch.clientY);
                  const targetRow = elem?.closest("[data-step-line]");
                  if (targetRow) {
                    const targetLine = Number(targetRow.getAttribute("data-step-line"));
                    if (!isNaN(targetLine) && targetLine !== roiVaoDong) {
                      setRoiVaoDong(targetLine);
                    }
                  }
                }}
                onTouchEnd={() => {
                  if (keoDong !== null && roiVaoDong !== null && keoDong !== roiVaoDong) {
                    rung(12);
                    onDoi?.(chuyenViTriBuoc(text, keoDong, roiVaoDong));
                  }
                  setKeoDong(null);
                  setRoiVaoDong(null);
                }}
                onTouchCancel={() => {
                  setKeoDong(null);
                  setRoiVaoDong(null);
                }}
                title="Kéo thả để đổi thứ tự"
                aria-label="Kéo thả để đổi thứ tự"
                style={{
                  cursor: dangSuaDong === null ? (keoDong === i ? "grabbing" : "grab") : "default",
                  touchAction: "none",
                  userSelect: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 28,
                  color: "var(--slate)",
                  opacity: 0.6,
                  flexShrink: 0,
                  marginTop: suaDuoc ? 2 : 0
                }}
              >
                <IcGrip size={14} />
              </div>
            )}

            <input
              type="checkbox"
              checked={d.xong}
              disabled={!onDoi}
              aria-label={`Đánh dấu bước: ${d.noiDung}`}
              onChange={() => {
                rung(8);
                onDoi?.(daoBuoc(text, i));
              }}
              style={{
                marginTop: suaDuoc ? 7 : 4,
                width: 16,
                height: 16,
                accentColor: "var(--teal)",
                flexShrink: 0,
                cursor: onDoi ? "pointer" : "default"
              }}
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
                type="button"
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexShrink: 0,
                  marginLeft: 4,
                  marginTop: 2
                }}
              >
                {/* Nút chuyển lên */}
                <button
                  type="button"
                  disabled={laBuocDau}
                  onClick={(e) => {
                    e.stopPropagation();
                    rung(6);
                    onDoi?.(diChuyenBuocLen(text, i));
                  }}
                  title={laBuocDau ? "Đã ở vị trí đầu tiên" : "Chuyển bước lên trên"}
                  aria-label="Chuyển bước lên trên"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--slate)",
                    padding: "4px 3px",
                    cursor: laBuocDau ? "not-allowed" : "pointer",
                    opacity: laBuocDau ? 0.2 : 0.7,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    transition: "opacity 0.15s, color 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    if (!laBuocDau) {
                      e.currentTarget.style.opacity = "1";
                      e.currentTarget.style.color = "var(--cream)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!laBuocDau) {
                      e.currentTarget.style.opacity = "0.7";
                      e.currentTarget.style.color = "var(--slate)";
                    }
                  }}
                >
                  <IcArrowUp size={13} />
                </button>

                {/* Nút chuyển xuống */}
                <button
                  type="button"
                  disabled={laBuocCuoi}
                  onClick={(e) => {
                    e.stopPropagation();
                    rung(6);
                    onDoi?.(diChuyenBuocXuong(text, i));
                  }}
                  title={laBuocCuoi ? "Đã ở vị trí cuối cùng" : "Chuyển bước xuống dưới"}
                  aria-label="Chuyển bước xuống dưới"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--slate)",
                    padding: "4px 3px",
                    cursor: laBuocCuoi ? "not-allowed" : "pointer",
                    opacity: laBuocCuoi ? 0.2 : 0.7,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    transition: "opacity 0.15s, color 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    if (!laBuocCuoi) {
                      e.currentTarget.style.opacity = "1";
                      e.currentTarget.style.color = "var(--cream)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!laBuocCuoi) {
                      e.currentTarget.style.opacity = "0.7";
                      e.currentTarget.style.color = "var(--slate)";
                    }
                  }}
                >
                  <IcArrowDown size={13} />
                </button>

                {/* Nút xóa */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDoi?.(xoaBuoc(text, i));
                  }}
                  aria-label={`Xóa bước: ${d.noiDung}`}
                  title="Xóa bước"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--slate)",
                    fontSize: 12,
                    padding: "4px 5px",
                    cursor: "pointer",
                    opacity: 0.7,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    transition: "opacity 0.15s, color 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.color = "var(--coral)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "0.7";
                    e.currentTarget.style.color = "var(--slate)";
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );
      })}

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
