import { dataIssuesFor, dataStatusFor } from "./recommendation-grade.ts";

export type OpportunityInput = {
  asin: string;
  title: string;
  category: string;
  price: number;
  monthlySales: number;
  launchDays: number;
  salesGrowth: number;
  rating: number;
  reviews: number;
  packageGrossKg: number;
  packageDimensionsCm: string;
  material: string;
  estimatedMargin: number;
  priceUplift: number;
  sourceUrl: string;
};

export type Decision = "优先跟进" | "有条件跟进" | "需要优化" | "暂不建议" | "待核算";
export type AssessmentDataStatus = "complete" | "needs_data";

const glassTerms = /\bglass\b|tempered|mirror|玻璃|镜面/i;
const upholsteredTerms = /sofa|couch|recliner|accent chair|upholstered|mattress|bed frame|沙发|床垫|软包/i;
const unsupportedTerms = /outdoor|patio|bathroom vanity|sink|faucet|toilet|lighting|chandelier|baby|bunk bed|fireplace|aquarium|户外|浴室柜|水槽|灯具|婴儿/i;
const commodityTerms = /utility rack|wire shelving|ceiling mounted|overhead.*rack|metal locker|tool cart|machine cart|folding chair|纯金属|货架/i;
const panelMaterialTerms = /mdf|particle board|engineered wood|fiberboard|melamine|laminate|刨花板|密度板|人造板|三聚氰胺/i;
const casegoodTerms = /cabinet|sideboard|dresser|nightstand|console table|coffee table|end table|desk|workstation|bookshelf|bookcase|pantry|storage|vanity desk|shoe cabinet|entryway|reception desk|podium|coffee station|craft table|sewing table|pet furniture|dog crate|cat cabinet|橱柜|边柜|斗柜|床头柜|桌|书架|鞋柜|收纳/i;
const structuralTerms = /drawer|door|shelf|hinge|slide|lift.?top|fold|extend|adjustable|charging|usb|outlet|caster|抽屉|柜门|层板|铰链|滑轨|升降|折叠|伸缩|可调|充电/i;
const nicheUseTerms = /reception|manicure|nail|craft|sewing|coffee station|printer stand|record player|vinyl|dog crate|cat litter|entryway|small space|apartment|corner|farmhouse pantry/i;

const elements: Array<[RegExp, string]> = [
  [/fluted|wave|ripple/i, "波纹门板"],
  [/charging|usb|outlet/i, "充电模块"],
  [/led|lighted/i, "氛围灯"],
  [/lift.?top|lift up/i, "升降结构"],
  [/rotat|swivel/i, "旋转功能"],
  [/extendable|expandable/i, "伸缩结构"],
  [/storage|drawer|cabinet/i, "隐藏收纳"],
  [/arched|arch/i, "拱形造型"],
  [/adjustable/i, "可调节"],
  [/motion sensor/i, "感应功能"],
];

const companyAffinity: Array<[RegExp, string]> = [
  [/lift.?top|lift up|adjustable|extendable|folding/i, "功能结构"],
  [/storage|drawer|cabinet|pantry|dresser|sideboard/i, "板式收纳系统"],
  [/workstation|desk|craft|sewing|nail|coffee station|reception|podium/i, "场景工作台"],
  [/fluted|wave|ripple|arched/i, "外观识别元素"],
  [/dog crate|cat litter|pet furniture/i, "宠物家具化"],
];

function dimensions(value: string) {
  const nums = (value.match(/[\d.]+/g) ?? []).map(Number).filter((n) => n > 0);
  if (nums.length < 3) return null;
  const cm = /inch|inches|\bin\b/i.test(value) ? nums.map((n) => n * 2.54) : nums;
  return cm.sort((a, b) => b - a).slice(0, 3);
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function assess(input: OpportunityInput) {
  const text = `${input.category} ${input.title} ${input.material}`;
  const normalizedGrowth = Math.abs(input.salesGrowth) > 2 ? input.salesGrowth / 100 : input.salesGrowth;
  const isGlass = glassTerms.test(text);
  const isUpholstered = upholsteredTerms.test(text);
  const isUnsupported = unsupportedTerms.test(text);
  const isCommodity = commodityTerms.test(text);
  const hasPanelMaterial = panelMaterialTerms.test(text);
  const hasCasegoodForm = casegoodTerms.test(text);
  const hasStructure = structuralTerms.test(text);
  const affinity = companyAffinity.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);

  const d = dimensions(input.packageDimensionsCm);
  const longestIn = d ? d[0] / 2.54 : 0;
  const secondIn = d ? d[1] / 2.54 : 0;
  const girthIn = d ? longestIn + 2 * (secondIn + d[2] / 2.54) : 0;
  const weightLb = input.packageGrossKg * 2.205;
  const volumeM3 = d ? (d[0] * d[1] * d[2]) / 1_000_000 : 0;
  const packageKnown = Boolean(input.packageGrossKg > 0 && d);
  const cannotShip = Boolean(d && (longestIn >= 108 || girthIn >= 165 || weightLb >= 150));
  const freightTriggers = [
    input.packageGrossKg > 22 ? "超过 22 kg 成本节点" : "",
    input.packageGrossKg > 49 ? "超过 49 kg，优先减重或双包" : "",
    weightLb > 50 ? "超过 50 lb 附加费" : "",
    longestIn > 48 ? "最长边超过 48 in" : "",
    secondIn > 30 ? "第二长边超过 30 in" : "",
    girthIn >= 105 ? "围长达到 105 in" : "",
  ].filter(Boolean);

  const hardRejectReasons = [
    isGlass ? "玻璃或镜面产品不在当前开发范围" : "",
    isUpholstered ? "软体家具不匹配现有板式家具供应链" : "",
    isUnsupported ? "类目超出现有室内板式家具能力" : "",
    isCommodity ? "纯金属或标准化商品，缺少公司优势" : "",
    cannotShip ? "包装尺寸或重量超过当前可发范围" : "",
    input.price < 100 ? "售价低于 100 美元目标价格带" : "",
  ].filter(Boolean);
  const fitConcerns = [
    !hasCasegoodForm ? "暂未识别到公司擅长的家具形态" : "",
    !hasPanelMaterial ? "板式家具材质信息不足或不明确" : "",
  ].filter(Boolean);

  let companyFit = 0;
  if (hasCasegoodForm) companyFit += 34;
  if (hasPanelMaterial) companyFit += 24;
  if (hasStructure) companyFit += 14;
  companyFit += Math.min(24, affinity.length * 8);
  if (input.price >= 130) companyFit += 4;
  if (input.packageGrossKg > 49) companyFit -= 18;
  if (freightTriggers.length >= 3) companyFit -= 10;
  if (isGlass || isUpholstered || isUnsupported || isCommodity) companyFit = 0;
  companyFit = clamp(companyFit);

  const featureCost = /led|electric|massage|fireplace|motor|lift|adjustable/i.test(text) ? 0.035 : 0;
  const estimatedLogistics = packageKnown
    ? 10 + input.packageGrossKg * 0.28 + volumeM3 * 72 + (input.packageGrossKg > 22 ? 5 : 0) + (input.packageGrossKg > 49 ? 13 : 0)
    : 0;
  const modelMargin = packageKnown
    ? Math.round(((input.price * 0.77 - input.price * (0.245 + featureCost) - estimatedLogistics) / input.price) * 1000) / 10
    : 0;
  const effectiveMargin = input.estimatedMargin > 0 ? input.estimatedMargin : modelMargin;
  const marginKnown = effectiveMargin > 0;
  if (packageKnown && marginKnown && effectiveMargin < 15) {
    hardRejectReasons.push(`预计利润率 ${effectiveMargin}% 低于 15% 硬门槛`);
  }

  const demand = clamp(
    Math.log10(input.monthlySales + 1) * 24 +
      Math.max(0, normalizedGrowth) * 28 +
      (input.launchDays > 0 && input.launchDays <= 240 ? 16 : 0) -
      (input.monthlySales < 20 ? 18 : 0),
  );
  const reviewVelocity = input.reviews > 0 ? input.monthlySales / Math.max(20, input.reviews) : input.monthlySales / 20;
  const hiddenSignals = [
    input.launchDays > 0 && input.launchDays <= 240 && input.monthlySales >= 40 ? "新品已出现稳定销量" : "",
    normalizedGrowth >= 0.15 ? "销量仍在明显增长" : "",
    input.monthlySales >= 60 && input.reviews < 300 ? "销量高于评论沉淀，可能尚未被多数卖家注意" : "",
    reviewVelocity >= 0.5 ? "销量/评论速度异常突出" : "",
    input.monthlySales >= 50 && input.rating > 0 && input.rating < 4.3 ? "有需求但评分偏低，存在改款窗口" : "",
    nicheUseTerms.test(text) ? "细分场景词明显，适合从相邻类目发现机会" : "",
    input.price >= 150 ? "高客单价为结构或功能升级留出空间" : "",
    input.priceUplift >= 3 ? "改款后具备提价空间" : "",
  ].filter(Boolean);
  const crowdingPenalty = input.reviews >= 3000 ? 20 : input.reviews >= 1000 ? 10 : 0;
  const hiddenOpportunity = clamp(
    demand * 0.34 +
      Math.min(20, Math.max(0, reviewVelocity) * 12) +
      hiddenSignals.length * 5 +
      (input.reviews < 300 ? 6 : 0) -
      crowdingPenalty,
  );

  const development = clamp(
    companyFit -
      (input.packageGrossKg > 49 ? 26 : input.packageGrossKg > 22 ? 10 : 0) -
      Math.max(0, freightTriggers.length - 1) * 6,
  );
  const margin = !marginKnown ? 0 : clamp(effectiveMargin * 4.5);
  const hardRejected = hardRejectReasons.length > 0;
  const qualified = !hardRejected && companyFit >= 58;
  const score = hardRejected ? 0 : clamp(companyFit * 0.35 + hiddenOpportunity * 0.35 + demand * 0.15 + margin * 0.15);

  const dataStatus: AssessmentDataStatus = dataStatusFor(input.packageDimensionsCm, input.packageGrossKg);
  const dataWarnings = dataIssuesFor(input.packageDimensionsCm, input.packageGrossKg);
  let decision: Decision = "需要优化";
  if (hardRejected) decision = "暂不建议";
  else if (!packageKnown || !marginKnown) decision = "需要优化";
  else if (companyFit < 58) decision = "需要优化";
  else if (input.packageGrossKg > 49) decision = "需要优化";
  else if (companyFit >= 80 && hiddenOpportunity >= 80 && score >= 80 && effectiveMargin >= 21) decision = "优先跟进";
  else if (hiddenOpportunity >= 48 && score >= 55 && effectiveMargin >= 16) decision = "有条件跟进";
  else decision = "需要优化";

  const fitReasons = [
    hasPanelMaterial ? "匹配板式家具材料体系" : "",
    hasCasegoodForm ? "产品形态在公司可开发范围" : "",
    hasStructure ? "具备可优化的结构或五金模块" : "",
    ...affinity.map((item) => `匹配${item}`),
  ].filter(Boolean);
  const reasons = [
    ...hardRejectReasons,
    ...fitConcerns,
    dataWarnings.length ? `数据待补：${dataWarnings.join("、")}，补齐前不进入推荐榜` : "",
    ...(!hardRejected ? hiddenSignals : []),
    ...freightTriggers,
  ].filter(Boolean);
  const trendElements = elements.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  const confidence = packageKnown && input.monthlySales > 0 && input.launchDays > 0 ? "高" : packageKnown ? "中" : "低";
  const categoryVerdict = hardRejected ? "已触发硬性淘汰条件" : companyFit < 58 ? "公司适配度待验证" : affinity.length >= 2 ? "核心能力赛道" : "相邻机会赛道";

  return {
    decision,
    dataStatus,
    dataWarnings,
    hardRejected,
    hardRejectReasons,
    fitConcerns,
    qualified,
    score,
    companyFit,
    hiddenOpportunity,
    confidence,
    demand,
    development,
    margin,
    freightTriggers,
    trendElements,
    affinity,
    categoryVerdict,
    fitReasons,
    hiddenSignals,
    blockers: hardRejectReasons,
    reasons,
    longestIn,
    secondIn,
    girthIn,
    cannotShip,
    isGlass,
    exception: hiddenSignals.length >= 2,
    estimatedMargin: effectiveMargin,
    marginConfidence: input.estimatedMargin > 0 ? "高" : packageKnown ? "中" : "低",
  };
}
