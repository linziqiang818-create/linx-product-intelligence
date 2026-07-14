import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { attachSheetImageUrls, imageFromRow, imageUrl } from "../app/import-images.ts";

test("recognizes common Chinese and English main-image columns", () => {
  assert.equal(imageFromRow({ "商品主图": "https://cdn.example.com/a.jpg" }), "https://cdn.example.com/a.jpg");
  assert.equal(imageFromRow({ "Image URL": "//cdn.example.com/b.png" }), "https://cdn.example.com/b.png");
  assert.equal(imageFromRow({ "缩略图": '=IMAGE("https://cdn.example.com/c.webp")' }), "https://cdn.example.com/c.webp");
});

test("extracts a URL from an Excel image formula", () => {
  assert.equal(imageUrl('=IMAGE("https://cdn.example.com/formula.jpg", 1)'), "https://cdn.example.com/formula.jpg");
});

test("reads image hyperlinks stored on Excel cells", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["ASIN", "商品图片"], ["B000TEST", "查看主图"]]);
  sheet.B2.l = { Target: "https://cdn.example.com/hyperlink.jpg" };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  attachSheetImageUrls(sheet, rows, XLSX);
  assert.equal(rows[0].__imageUrl, "https://cdn.example.com/hyperlink.jpg");
});
