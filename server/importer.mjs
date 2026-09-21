// Excel / CSV 导入：识别卖家精灵导出表并映射中文列名；也兼容旧版模板列名。
import * as XLSX from "xlsx";

const imageHeader = /主图|主图片|商品图片|图片地址|图片链接|缩略图|\bimage\b|thumbnail|picture/i;

export function imageUrlFrom(value) {
  const raw = String(value ?? "").trim().replaceAll("&amp;", "&");
  if (!raw) return "";
  const match = raw.match(/https?:\/\/[^\s"'<>]+/i) || raw.match(/\/\/[^\s"'<>]+/);
  return match ? `${match[0].startsWith("//") ? "https:" : ""}${match[0].replace(/[),;]+$/, "")}` : "";
}

function imageFromRow(row) {
  const direct = imageUrlFrom(row.__imageUrl);
  if (direct) return direct;
  for (const [key, value] of Object.entries(row)) {
    if (imageHeader.test(key)) {
      const found = imageUrlFrom(value);
      if (found) return found;
    }
  }
  return "";
}

// 单元格里的超链接（卖家精灵主图列通常是超链接而非纯文本）
function attachSheetImageUrls(sheet, rows) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headers = (grid[0] ?? []).map(String);
  const imageColumns = headers.map((header, index) => (imageHeader.test(header) ? index : -1)).filter((index) => index >= 0);
  rows.forEach((row, rowIndex) => {
    for (const column of imageColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: column })];
      const found = [row[headers[column]], cell?.l?.Target, cell?.f, cell?.v, cell?.w].map(imageUrlFrom).find(Boolean);
      if (found) {
        row.__imageUrl = found;
        break;
      }
    }
  });
}

const num = (v) => {
  const match = String(v ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return Number(match?.[0]) || 0;
};
const text = (v) => String(v ?? "").trim();
const pick = (row, keys) => {
  for (const key of keys) if (row[key] !== undefined && text(row[key]) !== "") return row[key];
  return "";
};

function chineseTitle(row) {
  return text(pick(row, ["中文标题", "商品中文标题", "标题中文", "中文翻译", "titleZh"]));
}

// 卖家精灵导出表
function sellerSpriteRow(r) {
  const packageKg = num(pick(r, ["包装重量（单位换算）", "包装重量(单位换算)", "包装重量"]));
  return {
    asin: text(pick(r, ["ASIN", "asin"])),
    title: text(pick(r, ["商品标题", "标题"])),
    titleZh: chineseTitle(r),
    imageUrl: imageFromRow(r),
    category: text(pick(r, ["小类目", "类目路径", "大类目"])),
    price: num(pick(r, ["价格($)", "价格", "售价"])),
    monthlySales: text(pick(r, ["月销量", "近30天销量", "月销"])),
    launchDays: num(pick(r, ["上架天数"])),
    dateFirstAvailable: text(pick(r, ["上架时间", "上架日期"])),
    salesGrowth: num(pick(r, ["销量环比增长率", "销量增长率"])),
    packageGrossKg: packageKg,
    packageDimensionsCm: text(pick(r, ["包装尺寸（单位换算）", "包装尺寸(单位换算)", "包装尺寸"])),
    rating: num(pick(r, ["评分"])),
    reviews: num(pick(r, ["评分数", "评论数"])),
    bsr: num(pick(r, ["小类BSR", "大类BSR", "BSR"])),
    dimensions: text(pick(r, ["商品尺寸（单位换算）", "商品尺寸(单位换算)", "商品尺寸"])),
    weight: packageKg * 2.205,
    material: text(pick(r, ["详细参数", "材质"])),
    variants: text(pick(r, ["SKU", "变体数"])),
    sellingPoints: text(pick(r, ["标签", "卖点"])),
    sourceUrl: text(pick(r, ["商品详情页链接", "链接", "URL"])),
    brand: text(pick(r, ["品牌"])),
    note: "",
    estimatedMargin: num(pick(r, ["毛利率"])),
    sourceDataProvider: "SellerSprite",
  };
}

// 旧版模板（中文标签列名）与英文字段名
const templateLabels = {
  asin: "ASIN", title: "英文标题", titleZh: "中文标题", imageUrl: "商品主图链接", category: "类目", price: "价格(USD)", monthlySales: "月销量",
  launchDays: "上架天数", salesGrowth: "销量环比增长率", estimatedMargin: "已报价利润率(可选覆盖)", packageGrossKg: "单箱包装毛重(kg)",
  packageDimensionsCm: "包装尺寸(cm)", priceUplift: "改款提价潜力(可选覆盖)", rating: "评分", reviews: "评论数", bsr: "BSR", dimensions: "尺寸",
  weight: "重量(lb)", material: "材质", variants: "颜色/变体", sellingPoints: "卖点", painPoints: "差评痛点", sourceUrl: "来源链接", note: "中文备注",
  complexity: "结构复杂度(1-5)", differentiation: "差异化空间(1-5)", returnRisk: "退货风险", brand: "品牌",
};

function templateRow(r) {
  const out = {};
  for (const [field, label] of Object.entries(templateLabels)) out[field] = r[label] ?? r[field] ?? "";
  out.imageUrl = imageFromRow(r) || out.imageUrl;
  return out;
}

export function parseWorkbook(buffer, fileName = "") {
  const wb = XLSX.read(buffer, { type: "buffer", cellHTML: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], kind: "empty" };
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!raw.length) return { rows: [], kind: "empty" };
  attachSheetImageUrls(sheet, raw);
  const first = raw[0];
  const isSellerSprite = Object.prototype.hasOwnProperty.call(first, "商品标题") || Object.prototype.hasOwnProperty.call(first, "小类目");
  const mapped = (isSellerSprite ? raw.map(sellerSpriteRow) : raw.map(templateRow))
    .map((row, index) => ({ ...row, sourceWorkbook: fileName, sourceRow: index + 2 }))
    .filter((row) => text(row.asin) && text(row.title));
  return { rows: mapped, kind: isSellerSprite ? "seller-sprite" : "template", total: raw.length };
}

export function buildWorkbook(rows, sheetName = "选品清单") {
  const header = [
    "ASIN", "中文标题", "英文标题", "类目", "价格(USD)", "月销量", "月销区间", "销量环比增长率", "评分", "评论数", "BSR", "上架天数", "包装毛重(kg)", "包装尺寸",
    "材质", "材质分组", "品牌", "所在空间", "清除原因", "可改款", "标签", "推荐分", "基础分", "偏好分", "预估利润率", "推荐理由", "收藏", "商品链接", "主图链接", "导入时间",
  ];
  const placementLabel = (p) => (p.placement === "removed" ? "已清除" : p.interest === "not_interested" ? "空间2·不感兴趣" : "空间2");
  const data = rows.map((p) => [
    p.asin, p.titleZh, p.title, p.category, p.price, p.monthlySales, p.monthlySalesRange, p.salesGrowth, p.rating, p.reviews, p.bsr, p.launchDays, p.packageGrossKg, p.packageDimensionsCm,
    p.material, p.materialGroup, p.brand, placementLabel(p), p.removeReason, p.convertible, (p.tags ?? []).join("、"), p.finalScore, p.baseScore, p.prefScore,
    p.marginEst, (p.reasons ?? []).join("；"), p.favorite ? "是" : "否", p.sourceUrl, p.imageUrl, p.importedAt,
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ...data]), sheetName);
  return { book, header, data };
}

export function workbookToBuffer(book) {
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

export function toCsv(header, data) {
  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return "\uFEFF" + [header, ...data].map((row) => row.map(escape).join(",")).join("\n");
}
