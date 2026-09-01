"use client";
import { createContext, useContext } from "react";
import { TEN_TRO_LY_MAC_DINH } from "@/lib/branding";

// Tên trợ lý xuất hiện ở gần chục chỗ trên màn hình. Trước đây mỗi chỗ nhập
// thẳng hằng số TEN_TRO_LY, nên tên chỉ đổi được bằng cách sửa mã nguồn.
// Nay tên nằm ở một ngữ cảnh (context) do Dashboard cấp, đổi trong Cài đặt là
// mọi chỗ cùng đổi ngay, không phải tải lại trang.

const NguCanhTroLy = createContext<string>(TEN_TRO_LY_MAC_DINH);

export function TroLyProvider({ ten, children }: { ten: string; children: React.ReactNode }) {
  return <NguCanhTroLy.Provider value={ten || TEN_TRO_LY_MAC_DINH}>{children}</NguCanhTroLy.Provider>;
}

export function useTenTroLy(): string {
  return useContext(NguCanhTroLy);
}
