import { hasKnownCategory, hasRecognizedMaterial } from "./selection-policy.ts";

export type Grade = "A" | "B" | "C" | "D";
export type RecommendationDecision = "优先跟进" | "有条件跟进" | "需要优化" | "待核算" | "暂不建议";
export type DataStatus = "complete" | "needs_data";

export const gradeOrder: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 };
export const gradeLabels: Record<Grade, string> = {
  A: "值得开发",
  B: "继续调研",
  C: "暂缓",
  D: "不推荐",
};

export function gradeFromDecision(decision: RecommendationDecision): Grade {
  if (decision === "优先跟进") return "A";
  if (decision === "有条件跟进") return "B";
  if (decision === "需要优化" || decision === "待核算") return "C";
  return "D";
}

export function gradeWithDataStatus(decision: RecommendationDecision, dataStatus: DataStatus): Grade {
  if (gradeFromDecision(decision) === "D") return "D";
  return dataStatus === "needs_data" ? "C" : gradeFromDecision(decision);
}

function packageNumbers(packageDimensionsCm: string | undefined) {
  return (String(packageDimensionsCm ?? "").match(/[\d.]+/g) ?? [])
    .map(Number)
    .filter((value) => value > 0);
}

export function hasMissingPackage(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined) {
  return packageNumbers(packageDimensionsCm).length < 3 || Number(packageGrossKg ?? 0) <= 0;
}

export function hasSuspiciousPackage(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined) {
  const dimensions = packageNumbers(packageDimensionsCm);
  return dimensions.length >= 3 && Math.max(...dimensions.slice(0, 3)) < 30 && Number(packageGrossKg ?? 0) > 15;
}

export type SelectionDataContext = { category?: string; material?: string; price?: number };

export function dataStatusFor(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined, context?: SelectionDataContext): DataStatus {
  return dataIssuesFor(packageDimensionsCm, packageGrossKg, context).length
    ? "needs_data"
    : "complete";
}

export function dataIssuesFor(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined, context?: SelectionDataContext) {
  const issues: string[] = [];
  if (Number(packageGrossKg ?? 0) <= 0) issues.push("缺少包装重量");
  if (packageNumbers(packageDimensionsCm).length < 3) issues.push("缺少包装尺寸");
  else if (hasSuspiciousPackage(packageDimensionsCm, packageGrossKg)) issues.push("包装尺寸疑似单位错误");
  if (context && !hasKnownCategory(context.category ?? "")) issues.push("类目待确认");
  if (context && !hasRecognizedMaterial(context.material ?? "")) issues.push("材质待确认");
  if (context && Number(context.price ?? 0) <= 0) issues.push("售价待确认");
  return issues;
}

export function dataWarningFor(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined, context?: SelectionDataContext) {
  const issues = dataIssuesFor(packageDimensionsCm, packageGrossKg, context);
  return issues.length ? `数据待补：${issues.join("、")}；补齐前不参与推荐或不推荐分类` : "";
}
