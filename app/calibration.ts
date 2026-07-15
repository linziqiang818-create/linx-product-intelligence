import { activeCalibrationAsins } from "./company-calibration.ts";

export type CalibrationVerdict = "develop" | "reject" | "uncertain";
export type CalibrationScope = "category" | "product" | "uncertain";
export type CalibrationInterest = "priority" | "normal" | "low";
export type PairChoice = "left" | "right" | "neither";

export type CalibrationCandidate = {
  asin: string;
  title: string;
  category: string;
  grade: "A" | "B" | "C" | "D";
  score: number;
};

export type CalibrationFeedback = {
  asin: string;
  verdict: CalibrationVerdict;
  reasons: string[];
  scope: CalibrationScope;
  interest?: CalibrationInterest;
  note: string;
  updatedAt: string;
};

export type CalibrationPair = { id: string; left: string; right: string };
export type PairFeedback = { pairId: string; choice: PairChoice; updatedAt: string };

export type CalibrationState = {
  version: 1;
  feedback: Record<string, CalibrationFeedback>;
  pairFeedback: Record<string, PairFeedback>;
};

export const emptyCalibrationState = (): CalibrationState => ({ version: 1, feedback: {}, pairFeedback: {} });

export const calibrationReasons = [
  "永久禁做类目或材质",
  "公司供应链做不了",
  "标品、差异化不足",
  "结构或工艺太复杂",
  "安装、售后或安全风险",
  "使用场景不认可",
  "造型不认可",
  "材质组合不合适",
  "市场已经成熟，不是机会",
  "利润或售价空间不足",
  "信息不足",
  "其他",
] as const;

export function isCalibrationFeedbackComplete(feedback: CalibrationFeedback | undefined) {
  if (!feedback) return false;
  if (feedback.verdict === "develop") return Boolean(feedback.interest);
  if (feedback.verdict === "reject") return feedback.reasons.length > 0 && feedback.scope !== "uncertain";
  return true;
}

const scenarioTerms = /trash|garbage|coffee bar|pet|dog crate|cat litter|reception|craft|sewing|extendable|lift.?top|隐藏|宠物|前台|咖啡|伸缩/i;

export function selectCalibrationSamples(candidates: CalibrationCandidate[], limit = 14) {
  const selected: CalibrationCandidate[] = [];
  const seen = new Set<string>();
  const add = (items: CalibrationCandidate[], count: number) => {
    for (const item of items) {
      if (selected.length >= limit || count <= 0 || seen.has(item.asin)) continue;
      selected.push(item);
      seen.add(item.asin);
      count--;
    }
  };
  const byAsin = new Map(candidates.map((candidate) => [candidate.asin, candidate]));
  add(activeCalibrationAsins.map((asin) => byAsin.get(asin)).filter((item): item is CalibrationCandidate => Boolean(item)), limit);
  if (selected.length >= limit) return selected.slice(0, limit);

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  add(ranked.filter((item) => item.grade === "A" || item.grade === "B"), 4);
  add(ranked.filter((item) => item.grade === "C"), 4);
  add(ranked.filter((item) => scenarioTerms.test(`${item.title} ${item.category}`)), 4);
  add(ranked.filter((item) => item.grade === "D"), 2);

  const usedCategories = new Set(selected.map((item) => item.category));
  add(ranked.filter((item) => !usedCategories.has(item.category)), limit - selected.length);
  add(ranked, limit - selected.length);
  return selected.slice(0, limit);
}

export function buildCalibrationPairs(samples: CalibrationCandidate[], count = 3): CalibrationPair[] {
  const pairs: CalibrationPair[] = [];
  const used = new Set<string>();
  for (let leftIndex = 0; leftIndex < samples.length && pairs.length < count; leftIndex++) {
    const left = samples[leftIndex];
    const right = samples.find((item, index) => index > leftIndex && item.category !== left.category && !used.has(item.asin));
    if (!right || used.has(left.asin)) continue;
    used.add(left.asin);
    used.add(right.asin);
    pairs.push({ id: `${left.asin}__${right.asin}`, left: left.asin, right: right.asin });
  }
  return pairs;
}

export function summarizeCalibration(feedback: Record<string, CalibrationFeedback>) {
  const values = Object.values(feedback);
  const reasonCounts = new Map<string, number>();
  values.forEach((item) => item.reasons.forEach((reason) => reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)));
  return {
    total: values.length,
    develop: values.filter((item) => item.verdict === "develop").length,
    reject: values.filter((item) => item.verdict === "reject").length,
    uncertain: values.filter((item) => item.verdict === "uncertain").length,
    priorityInterest: values.filter((item) => item.verdict === "develop" && item.interest === "priority").length,
    normalInterest: values.filter((item) => item.verdict === "develop" && item.interest === "normal").length,
    lowInterest: values.filter((item) => item.verdict === "develop" && item.interest === "low").length,
    hardRules: values.filter((item) => item.verdict === "reject" && item.scope === "category"),
    softPreferences: values.filter((item) => item.verdict === "reject" && item.scope === "product"),
    questions: values.filter((item) => item.verdict === "uncertain" || item.scope === "uncertain"),
    topReasons: [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

export function normalizeCalibrationState(value: unknown): CalibrationState {
  if (!value || typeof value !== "object") return emptyCalibrationState();
  const raw = value as Partial<CalibrationState>;
  if (raw.version !== 1 || !raw.feedback || !raw.pairFeedback) return emptyCalibrationState();
  return { version: 1, feedback: raw.feedback, pairFeedback: raw.pairFeedback };
}
