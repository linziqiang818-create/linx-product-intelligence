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
export const solidWoodTerms = /solid wood|solid oak|solid pine|solid walnut|hardwood|rubberwood|纯实木|全实木/i;
export const glassTerms = /\bglass\b|tempered|mirror|mirrored|玻璃|镜面/i;
export const metalTerms = /\bmetal\b|steel|iron|alloy|铝|铁|钢/i;
export const plasticTerms = /\bplastic\b|polypropylene|\bpp\b|nylon|塑料|尼龙/i;
export const upholsteryMaterialTerms = /fabric|linen|velvet|leather|foam|upholster|布艺|亚麻|绒|皮革|海绵|软包/i;

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

export function isStandardizedMetalCommodity(text: string, hasPanelMaterial: boolean) {
  return !hasPanelMaterial && metalTerms.test(text) && (standardizedMetalRackTerms.test(text) || standardMetalBedTerms.test(text)) && !hasStrongDifferentiation(text);
}

export function marginScoreFor(marginPercent: number) {
  if (!Number.isFinite(marginPercent) || marginPercent <= 0) return 50;
  const { centerPercent, curveWidth } = selectionPolicy.margin;
  return Math.round(50 + 45 * Math.tanh((marginPercent - centerPercent) / curveWidth));
}
