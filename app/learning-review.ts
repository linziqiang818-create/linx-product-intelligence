import { opportunityFamily, type DiversityProduct } from "./opportunity-diversity.ts";
import type { LearningEvent, LearningState, ReflectionReport } from "./learning-state.ts";
import type { Grade } from "./recommendation-grade.ts";

export function unreportedLearningEvents(state: LearningState) {
  const reported = new Set(state.reflectionReports.flatMap((report) => report.eventIds));
  return state.events.filter((event) => !reported.has(event.id));
}

function conclusionFor(events: LearningEvent[]) {
  const positive = events.filter((event) => event.value === "A" || event.value === "research" || event.value === "challenger").length;
  const negative = events.filter((event) => event.value === "C" || event.value === "pass" || event.value === "neither").length;
  if (positive > negative) return "偏好增强";
  if (negative > positive) return "偏好降低";
  return "证据混合，继续观察";
}

export function buildReflectionReport(
  products: readonly DiversityProduct[],
  state: LearningState,
  createdAt = new Date().toISOString(),
  id = `reflection-${createdAt}`,
): ReflectionReport | null {
  const events = unreportedLearningEvents(state);
  if (!events.length) return null;
  const productMap = new Map(products.map((product) => [product.asin, product]));
  const actionCounts: Record<string, number> = {};
  const gradeCounts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  const familyEvents = new Map<string, LearningEvent[]>();
  const gradeHistory = new Map<string, Set<string>>();
  for (const event of events) {
    const key = `${event.kind}:${event.value}`;
    actionCounts[key] = (actionCounts[key] ?? 0) + 1;
    if (event.kind === "grade" && ["A", "B", "C", "D"].includes(event.value)) gradeCounts[event.value as Grade]++;
    if (event.asin) {
      if (event.kind === "grade") {
        const history = gradeHistory.get(event.asin) ?? new Set<string>();
        history.add(event.value);
        gradeHistory.set(event.asin, history);
      }
      const product = productMap.get(event.asin);
      if (product) {
        const family = opportunityFamily(product);
        familyEvents.set(family, [...(familyEvents.get(family) ?? []), event]);
      }
    }
  }
  const contradictions = [...gradeHistory.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([asin]) => `${asin} 在本轮被多次改为不同等级`);
  const sorted = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return {
    id,
    createdAt,
    fromAt: sorted[0].createdAt,
    toAt: sorted.at(-1)!.createdAt,
    eventIds: sorted.map((event) => event.id),
    actionCounts,
    gradeCounts,
    familySignals: [...familyEvents.entries()].map(([family, familyItems]) => ({
      family,
      asins: [...new Set(familyItems.flatMap((event) => event.asin ? [event.asin] : []))],
      eventCount: familyItems.length,
      conclusion: conclusionFor(familyItems),
    })).sort((a, b) => b.eventCount - a.eventCount),
    contradictions,
  };
}

export function weeklyLearningSummary(state: LearningState, now = Date.now()) {
  const from = now - 7 * 24 * 60 * 60 * 1000;
  const events = state.events.filter((event) => Date.parse(event.createdAt) >= from && Date.parse(event.createdAt) <= now);
  return {
    eventCount: events.length,
    productCount: new Set(events.flatMap((event) => event.asin ? [event.asin] : [])).size,
    sessionCount: new Set(events.map((event) => event.sessionId)).size,
    reportCount: state.reflectionReports.filter((report) => Date.parse(report.createdAt) >= from && Date.parse(report.createdAt) <= now).length,
  };
}
