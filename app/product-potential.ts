import { selectionPolicy } from "./selection-policy.ts";

export type PotentialProduct = {
  title: string;
  material?: string;
  launchDays?: number;
  monthlySales?: number;
  salesGrowth?: number;
  reviews?: number;
  rating?: number;
};

export type MarketStage = "尚未验证" | "早期验证成功" | "爆款";

export function marketStageFor(monthlySales: number | undefined): MarketStage {
  const sales = Number(monthlySales ?? 0);
  if (sales > selectionPolicy.potential.maximumMonthlySales) return "爆款";
  if (sales >= selectionPolicy.potential.minimumMonthlySales) return "早期验证成功";
  return "尚未验证";
}

const noveltyTerms = /fluted|wave|ripple|arched|curved|rotat|swivel|fold|expand|extend|hidden|charging|usb|outlet|lift.?top|modular|convertible|rattan|cane|farmhouse|asymmetr|波纹|拱形|旋转|折叠|伸缩|隐藏|充电|模块/i;

function normalizedGrowth(value: number | undefined) {
  const growth = Number(value ?? 0);
  return Math.abs(growth) > 2 ? growth / 100 : growth;
}

export function potentialReasons(product: PotentialProduct) {
  const reasons: string[] = [];
  const launchDays = Number(product.launchDays ?? 0);
  const sales = Number(product.monthlySales ?? 0);
  const reviews = Number(product.reviews ?? 0);
  const growth = normalizedGrowth(product.salesGrowth);
  const text = `${product.title} ${product.material ?? ""}`;

  if (launchDays > 0 && launchDays <= selectionPolicy.newProductMaxDays) reasons.push("上架不超过 180 天");
  if (marketStageFor(sales) === "早期验证成功") reasons.push("月销 50–300，早期验证成功");
  if (reviews >= 0 && reviews < selectionPolicy.potential.maximumReviewsExclusive) reasons.push("单 Listing 评论少于 100");
  if (growth >= 0.15) reasons.push("销量增长明显");
  if (noveltyTerms.test(text)) reasons.push("造型或功能有新颖信号");
  if (sales >= 40 && Number(product.rating ?? 0) > 0 && Number(product.rating) < 4.3) reasons.push("有需求但评价仍有改款空间");
  return reasons;
}

export function isPotentialProduct(product: PotentialProduct) {
  const reasons = potentialReasons(product);
  const isRecent = Number(product.launchDays ?? 0) > 0 && Number(product.launchDays) <= selectionPolicy.newProductMaxDays;
  const hasEarlyDemand = marketStageFor(product.monthlySales) === "早期验证成功";
  const lowReviewBarrier = Number(product.reviews ?? 0) < selectionPolicy.potential.maximumReviewsExclusive;
  const hasDifferentiationSignal = reasons.includes("销量增长明显") || reasons.includes("造型或功能有新颖信号") || reasons.includes("有需求但评价仍有改款空间");
  return isRecent && hasEarlyDemand && lowReviewBarrier && hasDifferentiationSignal;
}
