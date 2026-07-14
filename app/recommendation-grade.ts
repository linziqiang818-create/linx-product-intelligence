export type Grade = "A" | "B" | "C" | "D";
export type RecommendationDecision = "优先跟进" | "有条件跟进" | "需要优化" | "待核算" | "暂不建议";

export const gradeOrder: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 };

export function gradeFromDecision(decision: RecommendationDecision): Grade {
  if (decision === "优先跟进") return "A";
  if (decision === "有条件跟进") return "B";
  if (decision === "需要优化" || decision === "待核算") return "C";
  return "D";
}

export function hasSuspiciousPackage(packageDimensionsCm: string | undefined, packageGrossKg: number | undefined) {
  const dimensions = (String(packageDimensionsCm ?? "").match(/[\d.]+/g) ?? []).map(Number).filter((value) => value > 0);
  return dimensions.length >= 3 && Math.max(...dimensions.slice(0, 3)) < 30 && Number(packageGrossKg ?? 0) > 15;
}
