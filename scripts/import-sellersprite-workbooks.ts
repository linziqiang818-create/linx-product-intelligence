import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { minimumFormalAdmission } from "../app/formal-admission.ts";
import { opportunityFamily } from "../app/opportunity-diversity.ts";
import { classifyFormalProduct } from "../app/product-placement.ts";

type JsonRecord = Record<string, unknown>;
type SourceRow = { workbook: string; rowNumber: number; lane: string; values: JsonRecord };

const projectRoot = path.resolve(import.meta.dirname, "..");
const realPath = path.join(projectRoot, "app", "real-products.json");
const candidatePath = path.join(projectRoot, "app", "candidate-pool.json");
const rejectedPath = path.join(projectRoot, "app", "rejected-products.json");
const statePath = path.join(projectRoot, "app", "acquisition-state.json");
const argumentsWithoutFlags = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const ranAtFlag = process.argv.find((arg) => arg.startsWith("--ran-at="));
const ranAt = ranAtFlag?.slice("--ran-at=".length) || new Date().toISOString();

if (!argumentsWithoutFlags.length) throw new Error("Pass one or more SellerSprite XLSX paths.");

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8")) as JsonRecord[];
const text = (value: unknown) => String(value ?? "").trim();
const numeric = (value: unknown) => {
  const parsed = Number(text(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};
const positive = (value: unknown) => {
  const parsed = numeric(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};
const nonNegative = (value: unknown) => {
  const parsed = numeric(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
};
const fieldFrom = (detail: string, field: string) => detail.match(new RegExp(`(?:^|\\|)\\s*${field}:\\s*([^|]+)`, "i"))?.[1]?.trim() ?? "";
const materialFrom = (detail: string) => detail.match(/(?:^|\|)\s*(?:Material|Top Material Type|Frame Material):\s*([^|]+)/i)?.[1]?.trim() ?? "";
const kgFrom = (value: unknown) => {
  const raw = text(value);
  const kg = raw.match(/([\d.]+)\s*kg/i);
  const lb = raw.match(/([\d.]+)\s*(?:lb|pound)/i);
  return kg ? Number(kg[1]) : lb ? Math.round(Number(lb[1]) / 2.205 * 100) / 100 : undefined;
};
const lbFrom = (value: unknown) => {
  const raw = text(value);
  const lb = raw.match(/([\d.]+)\s*(?:lb|pound)/i);
  const kg = raw.match(/([\d.]+)\s*kg/i);
  return lb ? Number(lb[1]) : kg ? Math.round(Number(kg[1]) * 2.205 * 100) / 100 : undefined;
};
const monthlySalesEstimate = (value: unknown, source: string) => {
  const observed = positive(value);
  if (!observed) return undefined;
  const bands = [[1, 49], [50, 99], [100, 199], [200, 499], [500, 999], [1000, 1999], [2000, 4999], [5000, 9999], [10000, 19999], [20000, 49999], [50000, 99999], [100000, 999999]];
  const [min, max] = bands.find(([, upper]) => observed <= upper) ?? [1000000, 9999999];
  return { min, max, evidence: "SellerSprite 月销量列，仅按区间保存", source, confidence: "third-party-estimate" };
};

let worksheetDataRowsScanned = 0;
function sourceRows(file: string): SourceRow[] {
  const workbook = XLSX.readFile(file, { cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => name === "Product-US-Last-30-days") ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const usedRange = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  worksheetDataRowsScanned += Math.max(0, usedRange.e.r - usedRange.s.r);
  const rows = XLSX.utils.sheet_to_json<JsonRecord>(sheet, { defval: null });
  const lane = /Arts,Crafts&Sewing/i.test(path.basename(file)) ? "arts-crafts-sewing" : "home-kitchen";
  return rows.map((values, index) => ({ workbook: path.basename(file), rowNumber: index + 2, lane, values }));
}

function normalizedSource(row: SourceRow) {
  const values = row.values;
  const asin = text(values.ASIN).toUpperCase();
  const title = text(values["商品标题"]);
  const detail = text(values["详细参数"]);
  const sourceUrl = `https://www.amazon.com/dp/${asin}`;
  const sourceReference = `${row.workbook}#row=${row.rowNumber}`;
  const parent = text(values["父ASIN"]).toUpperCase();
  const itemWeight = lbFrom(values["商品重量"] || values["商品重量（单位换算）"] || fieldFrom(detail, "Item Weight"));
  const packageGrossKg = kgFrom(values["包装重量（单位换算）"] || values["包装重量"]);
  const product = {
    asin,
    title,
    ...(text(values["商品主图"]) ? { imageUrl: text(values["商品主图"]) } : {}),
    imageEvidence: { kind: "amazon-media-main-image", sourceUrl, asin },
    category: text(values["类目路径"] || values["小类目"]),
    ...(positive(values["价格($)"]) !== undefined ? { price: positive(values["价格($)"]) } : {}),
    ...(positive(values["评分"]) !== undefined ? { rating: positive(values["评分"]) } : {}),
    ...(nonNegative(values["评分数"]) !== undefined ? { reviews: nonNegative(values["评分数"]) } : {}),
    ...(positive(values["大类BSR"]) !== undefined ? { bsr: positive(values["大类BSR"]) } : {}),
    ...(positive(values["小类BSR"]) !== undefined ? { subcategoryBsr: positive(values["小类BSR"]) } : {}),
    ...(positive(values["上架天数"]) !== undefined ? { launchDays: positive(values["上架天数"]) } : {}),
    ...(text(values["上架时间"]) ? { dateFirstAvailable: text(values["上架时间"]) } : {}),
    ...(numeric(values["销量环比增长率"]) !== undefined ? { salesGrowth: numeric(values["销量环比增长率"]) } : {}),
    ...(monthlySalesEstimate(values["月销量"], sourceReference) ? { monthlySalesEstimate: monthlySalesEstimate(values["月销量"], sourceReference) } : {}),
    ...(text(values["商品尺寸（单位换算）"] || values["商品尺寸"] || fieldFrom(detail, "Product Dimensions")) ? { dimensions: text(values["商品尺寸（单位换算）"] || values["商品尺寸"] || fieldFrom(detail, "Product Dimensions")) } : {}),
    ...(itemWeight !== undefined ? { weight: itemWeight } : {}),
    ...(text(values["包装尺寸（单位换算）"] || values["包装尺寸"]) ? { packageDimensionsCm: text(values["包装尺寸（单位换算）"] || values["包装尺寸"]) } : {}),
    ...(packageGrossKg !== undefined ? { packageGrossKg } : {}),
    ...(materialFrom(detail) ? { material: materialFrom(detail) } : {}),
    ...(text(values.SKU) ? { variants: text(values.SKU) } : {}),
    ...(text(values["品牌"]) ? { brand: text(values["品牌"]) } : {}),
    parentAsin: /^[A-Z0-9]{10}$/.test(parent) ? parent : asin,
    sourceUrl,
    amazonUrl: sourceUrl,
    sourceDataProvider: "SellerSprite",
    sourceWorkbook: row.workbook,
    sourceRow: row.rowNumber,
    sourceObservedWindow: "US last 30 days export",
    observedAt: ranAt,
    importedAt: ranAt,
    admissionEvidence: { kind: "user-provided-sellersprite-export", sourceUrl, observedAt: ranAt },
    note: "用户提供的卖家精灵美国站近30天数据导入。字段按源表保存；月销量仅保存区间、来源与第三方估算可信度，未保存为伪精确销量。",
    lane: row.lane,
    sourceReference,
    rawMonthlySales: positive(values["月销量"]),
  };
  return product;
}

const formalBeforeRows = readJson(realPath);
const candidateBeforeRows = readJson(candidatePath);
const rejectedBeforeRows = readJson(rejectedPath);
const formal = new Map(formalBeforeRows.map((row) => [text(row.asin).toUpperCase(), row]));
const candidates = new Map(candidateBeforeRows.map((row) => [text(row.asin).toUpperCase(), row]));
const rejected = new Map(rejectedBeforeRows.map((row) => [text(row.asin).toUpperCase(), row]));
const allSourceRows = argumentsWithoutFlags.flatMap(sourceRows).map(normalizedSource);
const invalidRows = allSourceRows.filter((row) => !/^[A-Z0-9]{10}$/.test(row.asin) || row.title.length <= 10);
const unique = new Map<string, ReturnType<typeof normalizedSource>>();
let sourceExactDuplicates = 0;
for (const row of allSourceRows) {
  if (!/^[A-Z0-9]{10}$/.test(row.asin) || row.title.length <= 10) continue;
  if (unique.has(row.asin)) sourceExactDuplicates++;
  const previous = unique.get(row.asin);
  if (!previous || Number(row.rawMonthlySales ?? 0) > Number(previous.rawMonthlySales ?? 0)) unique.set(row.asin, row);
}
const parentGroups = new Map<string, ReturnType<typeof normalizedSource>[]>();
for (const row of unique.values()) parentGroups.set(row.parentAsin, [...(parentGroups.get(row.parentAsin) ?? []), row]);
const representatives: ReturnType<typeof normalizedSource>[] = [];
let parentVariantsExcluded = 0;
for (const rows of parentGroups.values()) {
  rows.sort((a, b) => Number(formal.has(b.asin) || candidates.has(b.asin) || rejected.has(b.asin)) - Number(formal.has(a.asin) || candidates.has(a.asin) || rejected.has(a.asin)) || Number(b.rawMonthlySales ?? 0) - Number(a.rawMonthlySales ?? 0));
  representatives.push(rows[0]);
  parentVariantsExcluded += rows.length - 1;
}

const report = {
  ranAt,
  action: "user-provided-sellersprite-workbook-import",
  sourceFiles: argumentsWithoutFlags.map((file) => path.basename(file)),
  worksheetDataRowsScanned,
  sourceRowsParsed: allSourceRows.length,
  validUniqueAsins: unique.size,
  invalidIdentityOrTitle: invalidRows.length,
  sourceExactDuplicates,
  parentVariantsExcluded,
  crossPoolDuplicates: 0,
  formalUpdated: 0,
  formalAdded: 0,
  formalRemovedToTrash: 0,
  formalNetNew: 0,
  movedToTrash: 0,
  rejectedExisting: 0,
  pendingGate: 0,
  formalPoolBefore: formal.size,
  formalPoolAfter: 0,
  candidatePoolBefore: candidates.size,
  candidatePoolAfter: 0,
  rejectedPoolBefore: rejected.size,
  rejectedPoolAfter: 0,
  grades: { A: 0, B: 0, C: 0, D: 0 },
  tracks: { "red-ocean-blue": 0, "blue-ocean-red": 0, unmatched: 0 },
  families: {} as Record<string, number>,
  screenedOutReasons: {
    gradeDHardRejection: 0,
    invalidIdentityOrTitle: invalidRows.length,
    parentVariantMerged: parentVariantsExcluded,
    minimumAdmissionPending: 0,
  },
};

function withoutInternalFields(row: ReturnType<typeof normalizedSource>) {
  const product = { ...row };
  Reflect.deleteProperty(product, "lane");
  Reflect.deleteProperty(product, "sourceReference");
  Reflect.deleteProperty(product, "rawMonthlySales");
  return product;
}

for (const raw of representatives) {
  const product = withoutInternalFields(raw);
  const asin = product.asin;
  const existedFormal = formal.get(asin);
  const existedCandidate = candidates.get(asin);
  const existedRejected = rejected.get(asin);
  if (existedFormal || existedCandidate || existedRejected) report.crossPoolDuplicates++;
  const placement = classifyFormalProduct(product, "import");
  report.grades[placement.grade]++;

  if (existedRejected) {
    report.rejectedExisting++;
    rejected.set(asin, { ...product, ...existedRejected, observedAt: ranAt, sourceWorkbook: product.sourceWorkbook, sourceRow: product.sourceRow });
    formal.delete(asin);
    candidates.delete(asin);
    continue;
  }
  if (placement.grade === "D") {
    if (!rejected.has(asin)) report.movedToTrash++;
    if (existedFormal) report.formalRemovedToTrash++;
    report.screenedOutReasons.gradeDHardRejection++;
    formal.delete(asin);
    candidates.delete(asin);
    rejected.set(asin, { ...product, grade: "D", rejectionReason: placement.reasons.join("；"), observedAt: ranAt });
    continue;
  }

  const admission = minimumFormalAdmission(product);
  if (!admission.eligible) {
    report.pendingGate++;
    report.screenedOutReasons.minimumAdmissionPending++;
    candidates.set(asin, {
      asin,
      title: product.title,
      amazonUrl: admission.canonicalAmazonUrl,
      discoveryKeyword: "SellerSprite user workbook import",
      discoverySource: product.sourceUrl,
      category: product.category,
      ...(product.price === undefined ? {} : { price: product.price }),
      ...(product.imageUrl === undefined ? {} : { imageUrl: product.imageUrl, imageEvidence: product.imageEvidence }),
      discoveredAt: ranAt,
      track: placement.opportunityTrack ?? "exploration",
      preliminaryPriority: { score: placement.score, disposition: "queued", reasons: admission.issues },
    });
    formal.delete(asin);
    continue;
  }

  const dataPendingReasons = placement.assessment.dataWarnings;
  const incoming = {
    ...product,
    grade: placement.grade,
    track: placement.opportunityTrack ?? "unmatched",
    dataStatus: placement.needsData ? "needs_data" : "complete",
    dataPendingReasons,
    family: opportunityFamily(product),
  };
  if (existedFormal) {
    formal.set(asin, { ...existedFormal, ...incoming, importedAt: existedFormal.importedAt ?? ranAt, updatedAt: ranAt });
    report.formalUpdated++;
  } else {
    formal.set(asin, incoming);
    report.formalAdded++;
  }
  candidates.delete(asin);
  report.tracks[placement.opportunityTrack ?? "unmatched"]++;
  const family = opportunityFamily(product);
  report.families[family] = (report.families[family] ?? 0) + 1;
}

report.formalPoolAfter = formal.size;
report.formalNetNew = report.formalPoolAfter - report.formalPoolBefore;
report.candidatePoolAfter = candidates.size;
report.rejectedPoolAfter = rejected.size;

if (!dryRun) {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as JsonRecord;
  state.lastExternalWorkbookImport = report;
  state.lastAcquisitionFunnelReport = {
    reportedAt: ranAt,
    action: report.action,
    discovered: report.validUniqueAsins,
    reviewed: representatives.length,
    enteredFormalPool: report.formalAdded,
    formalNetNew: report.formalNetNew,
    screenedOut: report.movedToTrash + report.invalidIdentityOrTitle + report.parentVariantsExcluded + report.pendingGate,
    screenedOutReasons: report.screenedOutReasons,
    duplicates: report.crossPoolDuplicates + report.sourceExactDuplicates,
    dataPending: report.pendingGate,
    formalPoolBefore: report.formalPoolBefore,
    formalPoolAfter: report.formalPoolAfter,
    candidatePoolAfter: report.candidatePoolAfter,
    rejectedPoolAfter: report.rejectedPoolAfter,
    accessRestriction: "None. Import used user-provided local XLSX workbooks; no network access was required.",
  };
  fs.writeFileSync(realPath, `${JSON.stringify([...formal.values()], null, 2)}\n`);
  fs.writeFileSync(candidatePath, `${JSON.stringify([...candidates.values()], null, 2)}\n`);
  fs.writeFileSync(rejectedPath, `${JSON.stringify([...rejected.values()], null, 2)}\n`);
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

console.log(JSON.stringify({ ...report, families: Object.entries(report.families).sort((a, b) => b[1] - a[1]) }, null, 2));
