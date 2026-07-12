export type OpportunityInput = {
  asin: string; title: string; category: string; price: number; monthlySales: number;
  launchDays: number; salesGrowth: number; rating: number; reviews: number;
  packageGrossKg: number; packageDimensionsCm: string; material: string;
  estimatedMargin: number; priceUplift: number; sourceUrl: string;
};

export type Decision = "优先跟进" | "有条件跟进" | "需要优化" | "暂不建议" | "待核算";

const glassTerms = /\bglass\b|玻璃/i;
const elements: Array<[RegExp, string]> = [
  [/fluted|wave|ripple/i, "波纹门板"], [/charging|usb|outlet/i, "充电模块"],
  [/led|lighted|light/i, "氛围灯"], [/lift.?top|lift up/i, "升降结构"],
  [/rotat|swivel/i, "旋转功能"], [/extendable|expandable/i, "伸缩结构"],
  [/storage|drawer|cabinet/i, "隐藏收纳"], [/arched|arch/i, "拱形造型"],
  [/adjustable/i, "可调节"], [/motion sensor/i, "感应功能"], [/charging station/i, "充电站"],
];
const companyAffinity: Array<[RegExp, string]> = [
  [/lift.?top|lift up|adjustable/i, "功能结构"], [/storage|drawer|cabinet|pantry/i, "收纳系统"],
  [/workstation|workbench|craft|sewing|nail|coffee/i, "场景工作台"], [/fluted|wave|ripple/i, "外观识别元素"],
];
const coreCategory = /reception|manicure|aquarium stand|furniture.style dog crate|craft|sewing|workstation|podium|coffee station|pet furniture|cat cabinet/i;
const edgeCategory = /laundry.*sink|dog house|conference room/i;
const commodityCategory = /utility rack|ceiling mounted|overhead.*rack|metal locker|tool utility shelf|machine cart/i;

function dimensions(value: string) {
  const nums = (value.match(/[\d.]+/g) ?? []).map(Number).filter(Boolean);
  if (nums.length < 3) return null;
  const cm = /inch|inches|\bin\b/i.test(value) ? nums.map(n => n * 2.54) : nums;
  return cm.sort((a, b) => b - a).slice(0, 3);
}

export function assess(input: OpportunityInput) {
  const text = `${input.title} ${input.material}`;
  const categoryText = `${input.category} ${input.title}`;
  const isGlass = glassTerms.test(text);
  const categoryVerdict = commodityCategory.test(categoryText) ? "非核心：偏纯金属/标准品" : coreCategory.test(categoryText) ? "优先赛道：家具化机会" : edgeCategory.test(categoryText) ? "边缘赛道：需验证供应链" : "待验证赛道";
  const d = dimensions(input.packageDimensionsCm);
  const longestIn = d ? d[0] / 2.54 : 0;
  const secondIn = d ? d[1] / 2.54 : 0;
  const girthIn = d ? longestIn + 2 * (secondIn + d[2] / 2.54) : 0;
  const weightLb = input.packageGrossKg * 2.205;
  const volumeM3 = d ? (d[0] * d[1] * d[2]) / 1_000_000 : 0;
  const cannotShip = Boolean(d && (longestIn >= 108 || girthIn >= 165 || weightLb >= 150));
  const freightTriggers = [
    input.packageGrossKg > 22 ? "超过 22 kg 成本节点" : "",
    input.packageGrossKg > 49 ? "超过 49 kg，优先压重或双包" : "",
    weightLb > 50 ? "超过 50 lb 附加费" : "",
    longestIn > 48 ? "最长边超过 48 in" : "",
    secondIn > 30 ? "第二长边超过 30 in" : "",
    girthIn >= 105 ? "围长达到 105 in" : "",
  ].filter(Boolean);
  // Initial company model calibrated from supplied furniture cost sheets.
  // It is deliberately a range forecast, not a replacement for final quotation.
  const featureCost = /led|electric|massage|fireplace|motor|lift|adjustable/i.test(text) ? .035 : 0;
  const estimatedLogistics = input.packageGrossKg && d ? 10 + input.packageGrossKg * .28 + volumeM3 * 72 + (input.packageGrossKg > 22 ? 5 : 0) + (input.packageGrossKg > 49 ? 13 : 0) : 0;
  const modelMargin = input.packageGrossKg && d ? Math.round(((input.price * .77 - input.price * (.245 + featureCost) - estimatedLogistics) / input.price) * 1000) / 10 : 0;
  const effectiveMargin = input.estimatedMargin > 0 ? input.estimatedMargin : modelMargin;
  const marginKnown = effectiveMargin > 0;
  const exception = input.monthlySales >= 100 || input.launchDays <= 180 || input.priceUplift >= 3;
  let decision: Decision = "待核算";
  if (isGlass || cannotShip || input.price < 100 || categoryVerdict.startsWith("非核心")) decision = "暂不建议";
  else if (marginKnown && effectiveMargin >= 20 && input.packageGrossKg <= 49) decision = "优先跟进";
  else if (marginKnown && effectiveMargin >= 17 && exception) decision = "有条件跟进";
  else if (input.packageGrossKg > 49) decision = "需要优化";
  else if (marginKnown && effectiveMargin < 17) decision = "暂不建议";
  const demand = Math.min(100, Math.round(Math.log10(input.monthlySales + 1) * 26 + Math.max(0, input.salesGrowth) * 28 + (input.launchDays <= 180 ? 20 : 0)));
  const development = Math.max(0, 100 - (input.packageGrossKg > 49 ? 42 : input.packageGrossKg > 22 ? 20 : 5) - (freightTriggers.length - (input.packageGrossKg > 22 ? 1 : 0)) * 12 - (isGlass ? 100 : 0));
  const margin = !marginKnown ? 50 : Math.min(100, Math.max(0, effectiveMargin * 5));
  const affinity = companyAffinity.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  const categoryAdjustment = categoryVerdict.startsWith("优先") ? 6 : categoryVerdict.startsWith("非核心") ? -16 : categoryVerdict.startsWith("边缘") ? -6 : 0;
  const score = Math.min(100, Math.max(0, Math.round(demand * .35 + development * .35 + margin * .3 + affinity.length * 2 + categoryAdjustment)));
  const trendElements = elements.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  const reasons = [isGlass ? "含玻璃，超出公司可开发范围" : "", cannotShip ? "包装围长/尺寸超过当前渠道可发范围" : "", input.price < 100 ? "售价低于 100 美元目标线" : "", !marginKnown ? "缺少包装重量/尺寸，无法自动估算利润" : "", ...freightTriggers].filter(Boolean);
  return { decision, score, demand, development, margin, freightTriggers, trendElements, affinity, categoryVerdict, reasons, longestIn, secondIn, girthIn, cannotShip, isGlass, exception, estimatedMargin: effectiveMargin, marginConfidence: input.estimatedMargin > 0 ? "高" : input.packageGrossKg && d ? "中" : "低" };
}
