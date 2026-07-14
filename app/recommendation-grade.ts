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

export function dataStatusFor(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined): DataStatus {
  return hasMissingPackage(packageDimensionsCm, packageGrossKg) || hasSuspiciousPackage(packageDimensionsCm, packageGrossKg)
    ? "needs_data"
    : "complete";
}

export function dataWarningFor(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined) {
  if (hasMissingPackage(packageDimensionsCm, packageGrossKg)) {
    return "数据待补：缺少完整包装重量或尺寸，等级最高为 C";
  }
  if (hasSuspiciousPackage(packageDimensionsCm, packageGrossKg)) {
    return "数据待补：包装尺寸疑似单位错误，等级最高为 C";
  }
  return "";
}
