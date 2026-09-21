import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildWorkbook, parseWorkbook, toCsv } from "../server/importer.mjs";

function sellerSpriteBuffer() {
  const rows = [
    { ASIN: "B0TEST00001", 商品标题: "Fluted Sideboard Cabinet", 小类目: "Buffets & Sideboards", "价格($)": "$219.99", 月销量: "100-199", 上架天数: 120, 销量环比增长率: "35%", "包装重量（单位换算）": "31.5 kg", "包装尺寸（单位换算）": "120 x 45 x 20 cm", 评分: 4.6, 评分数: 88, 小类BSR: 1200, 详细参数: "Material: Engineered Wood", 品牌: "METOTI", 商品详情页链接: "https://www.amazon.com/dp/B0TEST00001", 主图: "https://m.media-amazon.com/images/I/test.jpg" },
    { ASIN: "", 商品标题: "no asin row" },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Sheet1");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

test("识别卖家精灵表并映射列名，跳过缺 ASIN 的行", () => {
  const parsed = parseWorkbook(sellerSpriteBuffer(), "sprite.xlsx");
  assert.equal(parsed.kind, "seller-sprite");
  assert.equal(parsed.rows.length, 1);
  const row = parsed.rows[0];
  assert.equal(row.asin, "B0TEST00001");
  assert.equal(row.category, "Buffets & Sideboards");
  assert.equal(row.price, 219.99);
  assert.equal(row.monthlySales, "100-199");
  assert.equal(row.packageGrossKg, 31.5);
  assert.equal(row.imageUrl, "https://m.media-amazon.com/images/I/test.jpg");
  assert.equal(row.brand, "METOTI");
  assert.equal(row.sourceRow, 2);
});

test("导出工作簿包含关键列并可转 CSV", () => {
  const { header, data } = buildWorkbook([{ asin: "B0X", titleZh: "测试", title: "Test", tags: ["可改款"], reasons: ["理由"], favorite: true, placement: "removed", removeReason: "含玻璃", convertible: "玻璃 → 亚克力" }]);
  assert.ok(header.includes("清除原因"));
  assert.ok(header.includes("月销区间"));
  const csv = toCsv(header, data);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("玻璃 → 亚克力"));
});
