"use client";
import { useState, useEffect } from "react";
import Linkify from "./Linkify";
import {
  phanTichGhiChu,
  daoBuoc,
  suaBuoc,
  xoaBuoc,
  themMotBuoc,
  diChuyenBuocLen,
  diChuyenBuocXuong,
  chuyenViTriBuoc,
  capNhatVanBanTrongGhiChu
} from "@/lib/checklist";
import { IcArrowUp, IcArrowDown, IcGrip, IcPen } from "./icons";
import { rung } from "@/lib/client-api";

// Hiển thị ghi chú: dòng "- [ ]" thành ô đánh dấu bấm được, các dòng còn lại
// là văn bản thuần với đường link bấm được. Vẫn đi qua Linkify nên không có
// đường nào dựng HTML từ chuỗi người dùng nhập (xem chú thích trong Linkify).
//
// Có onDoi thì tick được. Thêm choSua thì:
// - Từng bước sửa/xóa/đổi thứ tự được tại chỗ
// - Khối Ghi chú & Liên kết có thể bấm trực tiếp vào để chỉnh sửa ngay tại chỗ
export default function NotesView({
  text,
  onDoi,
  choSua = false,
  dangSuaVanBanMoRong,
  onDangSuaVanBanDoi
}: {
  text: string;
  onDoi?: (moi: string) => void;
  choSua?: boolean;
  dangSuaVanBanMoRong?: boolean;
  onDangSuaVanBanDoi?: (dangSua: boolean) => void;
}) {
  const dongs = phanTichGhiChu(text);
  const suaDuoc = choSua && Boolean(onDoi);
  const [dangSuaDong, setDangSuaDong] = useState<number | null>(null);
  const [nhapDong, setNhapDong] = useState("");
  const [dangThem, setDangThem] = useState(false);
  const [nhapMoi, setNhapMoi] = useState("");

  // Trạng thái sửa trực tiếp phần văn bản ghi chú
  const [dangSuaVanBanLocal, setDangSuaVanBanLocal] = useState(false);
  const dangSuaVanBan = dangSuaVanBanMoRong !== undefined ? dangSuaVanBanMoRong : dangSuaVanBanLocal;

  function setDangSuaVanBan(val: boolean) {
    setDangSuaVanBanLocal(val);
    onDangSuaVanBanDoi?.(val);
  }

  const [nhapVanBan, setNhapVanBan] = useState("");

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

  // Phân tách các bước và các dòng văn bản
  const cacBuoc = dongs
    .map((d, idx) => ({ dong: d, viTriGoc: idx }))
    .filter((item): item is { dong: { loai: "buoc"; xong: boolean; noiDung: string }; viTriGoc: number } => item.dong.loai === "buoc");

  const cacVanBan = dongs
    .map((d, idx) => ({ dong: d, viTriGoc: idx }))
    .filter((item): item is { dong: { loai: "van-ban"; noiDung: string }; viTriGoc: number } => item.dong.loai === "van-ban");

  const coBuoc = cacBuoc.length > 0;
  const noiDungVanBan = cacVanBan.map((item) => item.dong.noiDung).join("\n").trim();
  const coVanBan = noiDungVanBan.length > 0;

  useEffect(() => {
    if (dangSuaVanBan) {
      setNhapVanBan(noiDungVanBan);
    }
  }, [dangSuaVanBan, noiDungVanBan]);

  function batDauSuaVanBan() {
    setNhapVanBan(noiDungVanBan);
    setDangSuaVanBan(true);
    rung(6);
  }

  function luuSuaVanBan() {
    setDangSuaVanBan(false);
    onDoi?.(capNhatVanBanTrongGhiChu(text, nhapVanBan));
  }

  // Lược bỏ dòng trống thừa ở đầu và cuối phần văn bản
  let startIdx = 0;
  while (startIdx < cacVanBan.length && !cacVanBan[startIdx].dong.noiDung.trim()) {
    startIdx++;
  }
  let endIdx = cacVanBan.length - 1;
  while (endIdx >= startIdx && !cacVanBan[endIdx].dong.noiDung.trim()) {
    endIdx--;
  }
  const cacVanBanHienThi = cacVanBan.slice(startIdx, endIdx + 1);

  const soXong = cacBuoc.filter((b) => b.dong.xong).length;
  const tongBuoc = cacBuoc.length;

  if (!coBuoc && !coVanBan && !dangSuaVanBan) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 1. KHỐI CÁC BƯỚC THỰC HIỆN - chỉ hiện khi có bước */}
      {coBuoc && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: "var(--slate)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6
              }}
            >
              Các bước thực hiện
              <span
                style={{
                  color: soXong === tongBuoc ? "var(--teal)" : "var(--slate)",
                  fontWeight: 500,
                  textTransform: "none"
                }}
              >
                ({soXong}/{tongBuoc})
              </span>
            </span>
          </div>

          <div
            style={{
              background: "var(--field)",
              borderRadius: 8,
              padding: "6px 8px",
              maxHeight: 260,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 2
            }}
          >
            {cacBuoc.map(({ dong: d, viTriGoc: i }) => {
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
                  type="button"
                  onClick={() => setDangThem(true)}
                  style={{
                    alignSelf: "flex-start",
                    background: "none",
                    border: "none",
                    color: "var(--slate)",
                    fontSize: 12.5,
                    padding: "6px 0 2px",
                    minHeight: 30,
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    cursor: "pointer"
                  }}
                >
                  + Thêm bước
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 2. KHỐI GHI CHÚ & LIÊN KẾT - hiện khi có văn bản hoặc đang trong chế độ sửa */}
      {(coVanBan || dangSuaVanBan) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: "var(--slate)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600
              }}
            >
              Ghi chú & liên kết
            </span>

            {suaDuoc && !dangSuaVanBan && (
              <button
                type="button"
                onClick={batDauSuaVanBan}
                title="Bấm để chỉnh sửa ghi chú"
                aria-label="Chỉnh sửa ghi chú và liên kết"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--slate)",
                  fontSize: 11,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 6px",
                  borderRadius: 4,
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--cream)";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--slate)";
                  e.currentTarget.style.background = "none";
                }}
              >
                <IcPen size={11} />
                <span>Sửa trực tiếp</span>
              </button>
            )}
          </div>

          {dangSuaVanBan ? (
            <div
              style={{
                background: "var(--field)",
                borderRadius: 8,
                padding: "8px 10px",
                border: "1px solid var(--amber)",
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}
            >
              <textarea
                value={nhapVanBan}
                autoFocus
                rows={Math.min(12, Math.max(5, nhapVanBan.split("\n").length + 1))}
                onChange={(e) => setNhapVanBan(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    luuSuaVanBan();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setDangSuaVanBan(false);
                  }
                }}
                placeholder="Nhập ghi chú, tài liệu, đường link liên kết..."
                style={{
                  width: "100%",
                  background: "var(--navy)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "var(--cream)",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  fontFamily: "var(--font-body)",
                  resize: "vertical",
                  boxSizing: "border-box"
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 6
                }}
              >
                <span style={{ fontSize: 11, color: "var(--slate)" }}>
                  Phím tắt: <kbd style={{ background: "rgba(255, 255, 255, 0.08)", padding: "1px 4px", borderRadius: 3 }}>Ctrl+Enter</kbd> lưu, <kbd style={{ background: "rgba(255, 255, 255, 0.08)", padding: "1px 4px", borderRadius: 3 }}>Esc</kbd> hủy
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={luuSuaVanBan}
                    style={{
                      background: "var(--amber)",
                      color: "var(--navy)",
                      border: "none",
                      borderRadius: 6,
                      padding: "5px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Lưu
                  </button>
                  <button
                    type="button"
                    onClick={() => setDangSuaVanBan(false)}
                    style={{
                      background: "transparent",
                      color: "var(--slate)",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 12,
                      cursor: "pointer"
                    }}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={(e) => {
                if (!suaDuoc) return;
                // Nếu click trúng thẻ liên kết <a> hoặc nút bấm, không kích hoạt sửa trực tiếp
                const target = e.target as HTMLElement | null;
                if (target?.closest("a") || target?.closest("button")) return;
                batDauSuaVanBan();
              }}
              title={suaDuoc ? "Bấm vào để chỉnh sửa trực tiếp" : undefined}
              style={{
                background: "var(--field)",
                borderRadius: 8,
                padding: "8px 10px",
                maxHeight: 220,
                overflowY: "auto",
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--cream)",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                cursor: suaDuoc ? "text" : "default",
                border: "1px solid transparent",
                transition: "border-color 0.15s ease"
              }}
              onMouseEnter={(e) => {
                if (suaDuoc) {
                  e.currentTarget.style.borderColor = "var(--line)";
                }
              }}
              onMouseLeave={(e) => {
                if (suaDuoc) {
                  e.currentTarget.style.borderColor = "transparent";
                }
              }}
            >
              {cacVanBanHienThi.map(({ dong: d, viTriGoc: i }) => (
                <div
                  key={i}
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    minHeight: d.noiDung ? undefined : 8
                  }}
                >
                  <Linkify text={d.noiDung} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
