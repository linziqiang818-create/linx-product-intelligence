import type * as XLSX from "xlsx";

const imageHeader = /主图|主图片|商品图片|图片地址|图片链接|缩略图|\bimage\b|thumbnail|picture/i;

export function imageUrl(value: unknown) {
  const raw = String(value ?? "").trim().replaceAll("&amp;", "&");
  if (!raw) return "";
  const match = raw.match(/https?:\/\/[^\s"'<>]+/i) || raw.match(/\/\/[^\s"'<>]+/);
  return match ? `${match[0].startsWith("//") ? "https:" : ""}${match[0].replace(/[),;]+$/, "")}` : "";
}

export function imageFromRow(row: Record<string, unknown>) {
  const direct = imageUrl(row.__imageUrl);
  if (direct) return direct;
  for (const [key, value] of Object.entries(row)) {
    if (imageHeader.test(key)) {
      const found = imageUrl(value);
      if (found) return found;
    }
  }
  return "";
}

export function attachSheetImageUrls(sheet: XLSX.WorkSheet, rows: Record<string, unknown>[], xlsx: typeof XLSX) {
  const grid = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headers = (grid[0] ?? []).map(String);
  const imageColumns = headers.map((header, index) => imageHeader.test(header) ? index : -1).filter((index) => index >= 0);
  rows.forEach((row, rowIndex) => {
    for (const column of imageColumns) {
      const cell = sheet[xlsx.utils.encode_cell({ r: rowIndex + 1, c: column })] as (XLSX.CellObject & { l?: { Target?: string } }) | undefined;
      const found = [row[headers[column]], cell?.l?.Target, cell?.f, cell?.v, cell?.w].map(imageUrl).find(Boolean);
      if (found) {
        row.__imageUrl = found;
        break;
      }
    }
  });
}
