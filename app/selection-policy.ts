export const selectionPolicy = {
  newProductMaxDays: 180,
  minimumPriceUsd: 100,
  potential: {
    minimumMonthlySales: 50,
    maximumMonthlySales: 300,
    maximumReviewsExclusive: 100,
  },
  margin: {
    centerPercent: 20,
    modelWeight: 0.06,
    quotedWeight: 0.12,
    curveWidth: 12,
  },
  score: {
    companyFit: 0.4,
    hiddenOpportunity: 0.38,
    demand: 0.22,
  },
  decision: {
    minimumCompanyFit: 58,
    priorityCompanyFit: 80,
    priorityHiddenOpportunity: 80,
    priorityScore: 76,
    conditionalHiddenOpportunity: 48,
    conditionalScore: 55,
  },
} as const;

export const panelMaterialTerms = /mdf|particle board|engineered wood|fiberboard|melamine|laminate|刨花板|密度板|人造板|三聚氰胺/i;
export const solidWoodTerms = /solid wood|solid oak|solid pine|solid walnut|solid hardwood|solid rubberwood|solid rubber wood|solid fir|solid acacia|solid mango|纯实木|全实木/i;
const explicitWholeSolidWoodMaterial = /^(?:100%\s*)?(?:reclaimed\s+)?solid\s+(?:wood|oak|pine|walnut|hardwood|(?:malaysian\s+)?rubberwood|rubber wood|fir|acacia|mango(?:\s+wood)?)(?:\s+hardwood)?$|^(?:纯实木|全实木)$/i;
const partialSolidWood = /\bsolid\s+(?:wood|wooden|oak|pine|walnut|rubberwood|rubber wood|fir|acacia|mango(?:\s+wood)?)\s+(?:legs?|feet|foot|frames?|slats?|handles?|knobs?|tops?|countertops?|tabletops?|shelves?|shelving|rods?|planks?|posts?|headboards?|footboards?|drawers?|drawer\s+fronts?|doors?|bases?|trim|supports?|branches?|cores?)\b/i;
const nonPureWoodMaterial = /mdf|particle board|engineered wood|fiberboard|plywood|composite wood|wood veneer|veneered|melamine|laminate|multilayer board|密度板|刨花板|人造板|胶合板|贴木皮/i;
const genericWoodMaterial = /^(?:wood|wooden|pine|pine wood|oak|oak wood|walnut|walnut wood|fir|fir wood|hardwood|rubberwood|rubber wood|acacia|acacia wood)$/i;
const solidLookOnly = /\bsolid wood\s+(?:look|finish|color|colour|style|effect|grain)\b/i;
export const glassTerms = /\bglass\b|tempered|mirror|mirrored|玻璃|镜面/i;
export const metalTerms = /\bmetal\b|steel|iron|alloy|铝|铁|钢/i;
export const plasticTerms = /\bplastic\b|polypropylene|\bpp\b|nylon|塑料|尼龙/i;
export const upholsteryMaterialTerms = /fabric|linen|velvet|leather|foam|upholster|布艺|亚麻|绒|皮革|海绵|软包/i;

export type SolidWoodEvidenceStatus = "none" | "conflicting" | "local-component" | "confirmed-whole-product" | "ambiguous";
export type SolidWoodEvidence = { status: SolidWoodEvidenceStatus; hardReject: boolean; needsMaterialReview: boolean; reason: string };

export function classifySolidWoodEvidence(title: string, material: string): SolidWoodEvidence {
  const titleText = String(title ?? "").trim();
  const materialText = String(material ?? "").trim();
  const titleClaim = solidWoodTerms.test(titleText) && !solidLookOnly.test(titleText);
  const materialClaim = solidWoodTerms.test(materialText);
  const partialClaim = partialSolidWood.test(titleText) || partialSolidWood.test(materialText);
  const panelConflict = nonPureWoodMaterial.test(materialText);
  if (panelConflict && (titleClaim || materialClaim)) return { status: "conflicting", hardReject: false, needsMaterialReview: true, reason: "标题实木说法与板材或木皮材质字段冲突" };
  if (partialClaim) {
    const compositionKnown = panelConflict || /metal|steel|iron|glass|acrylic|fabric|linen|velvet|leather|foam|polyester/i.test(materialText);
    return { status: "local-component", hardReject: false, needsMaterialReview: !compositionKnown || genericWoodMaterial.test(materialText), reason: "仅确认局部实木或混合材质，不能判定整件纯实木" };
  }
  if (explicitWholeSolidWoodMaterial.test(materialText)) return { status: "confirmed-whole-product", hardReject: true, needsMaterialReview: false, reason: "材质字段明确确认整件纯实木" };
  if (titleClaim || materialClaim || genericWoodMaterial.test(materialText)) return { status: "ambiguous", hardReject: false, needsMaterialReview: true, reason: "只有营销标题或泛化木材名称，尚不能确认整件纯实木" };
  return { status: "none", hardReject: false, needsMaterialReview: false, reason: "" };
}

const knownCategoryTerms = /furniture|cabinet|table|desk|stand|console|shelf|bookcase|bookshelf|pantry|dresser|nightstand|bed|chair|sofa|couch|recliner|crate|cage|rack|storage|podium|lectern|家具|柜|桌|架|床|椅|沙发|收纳/i;
const strongDifferentiationTerms = /motorized|electric lift|lift.?top|height.?adjustable|rotat|swivel|extendable|expandable|fold(?:ing|able)|modular|convertible|transform|hidden compartment|corner tv|pet crate|cat litter|reception|manicure|sewing|craft station|壁挂|升降|旋转|伸缩|折叠|模块|隐藏空间|宠物|前台|美甲|缝纫/i;
const standardizedMetalRackTerms = /\brack\b|shelving|shoulder pad rack|helmet rack|sports equipment (?:storage )?rack|locker room (?:equipment )?rack|utility rack|wire shelving|ceiling mounted|overhead.*rack|metal locker|metal (?:storage )?cabinet|steel wardrobe|metal armoire|metal pantry|tool cart|machine cart|普通铁床架|器材架|装备架|护肩架|头盔架|更衣室货架|金属柜|铁柜/i;
const standardMetalBedTerms = /(?:metal|steel|iron).{0,24}bed frame|bed frame.{0,24}(?:metal|steel|iron)|铁床架|钢制床架/i;

export function hasRecognizedMaterial(material: string) {
  const value = String(material ?? "").trim();
  return Boolean(value && (
    panelMaterialTerms.test(value) || solidWoodTerms.test(value) || glassTerms.test(value) || metalTerms.test(value) ||
    plasticTerms.test(value) || upholsteryMaterialTerms.test(value) || /acrylic|bamboo|rattan|cane|wood|木|竹|藤/i.test(value)
  ));
}

export function hasKnownCategory(category: string) {
  const value = String(category ?? "").trim();
  return Boolean(value && !/^(unknown|other|n\/a|furniture|未分类|其他|家具)$/i.test(value) && knownCategoryTerms.test(value));
}

export function hasStrongDifferentiation(text: string) {
  return strongDifferentiationTerms.test(text);
}

export function isStandardizedMetalCommodity(text: string, hasFurnitureMaterial: boolean) {
  return !hasFurnitureMaterial && metalTerms.test(text) && (standardizedMetalRackTerms.test(text) || standardMetalBedTerms.test(text)) && !hasStrongDifferentiation(text);
}

export function marginScoreFor(marginPercent: number) {
  if (!Number.isFinite(marginPercent) || marginPercent <= 0) return 50;
  const { centerPercent, curveWidth } = selectionPolicy.margin;
  return Math.round(50 + 45 * Math.tanh((marginPercent - centerPercent) / curveWidth));
}
