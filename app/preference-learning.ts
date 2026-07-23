import { opportunityFamily, type DiversityProduct } from "./opportunity-diversity.ts";
import type { LearningState } from "./learning-state.ts";
import type { Grade } from "./recommendation-grade.ts";

export type LearnedGrade = {
  grade: Exclude<Grade, "D">;
  family: string;
  evidenceCount: number;
  sessionCount: number;
  consensus: number;
};

export type PreferenceRule = LearnedGrade & {
  totalWeight: number;
  evidenceAsins: string[];
  affectedCount: number;
  status: "collecting" | "active" | "paused";
};

type ResearchRecord = { decision?: "research" | "hold" | "pass"; updatedAt?: string };

function researchSignals(value: LearningState["batchCalibration"]) {
  if (!value || typeof value !== "object") return {} as Record<string, ResearchRecord>;
  const research = (value as { research?: unknown }).research;
  return research && typeof research === "object" ? research as Record<string, ResearchRecord> : {};
}

const legacySession = (updatedAt?: string) => `legacy:${(updatedAt ?? "unknown").slice(0, 10)}`;

/**
 * Repeated non-D feedback becomes a transparent family-level ranking bias.
 * It never changes ABCD directly and D is never generalized.
 */
export function buildPreferenceRules(products: readonly DiversityProduct[], learning: LearningState): PreferenceRule[] {
  const productsByAsin = new Map(products.map((product) => [product.asin, product]));
  const eventSession = (asin: string, kind: "grade" | "research") =>
    [...learning.events].reverse().find((event) => event.asin === asin && event.kind === kind)?.sessionId;
  const families = new Map<string, {
    asins: Set<string>;
    sessions: Set<string>;
    votes: Record<Exclude<Grade, "D">, number>;
  }>();
  const addVote = (asin: string, grade: Exclude<Grade, "D">, weight: number, session: string) => {
    const product = productsByAsin.get(asin);
    if (!product) return;
    const family = opportunityFamily(product);
    const record = families.get(family) ?? { asins: new Set<string>(), sessions: new Set<string>(), votes: { A: 0, B: 0, C: 0 } };
    record.asins.add(asin);
    record.sessions.add(session);
    record.votes[grade] += weight;
    families.set(family, record);
  };

  for (const [asin, feedback] of Object.entries(learning.gradeOverrides)) {
    if (feedback.grade !== "D") addVote(asin, feedback.grade, 2, eventSession(asin, "grade") ?? legacySession(feedback.updatedAt));
  }
  for (const [asin, feedback] of Object.entries(researchSignals(learning.batchCalibration))) {
    if (feedback.decision === "research") addVote(asin, "A", 1, eventSession(asin, "research") ?? legacySession(feedback.updatedAt));
    if (feedback.decision === "hold") addVote(asin, "B", 1, eventSession(asin, "research") ?? legacySession(feedback.updatedAt));
    if (feedback.decision === "pass") addVote(asin, "C", 1, eventSession(asin, "research") ?? legacySession(feedback.updatedAt));
  }

  const affectedByFamily = new Map<string, number>();
  for (const product of products) {
    const family = opportunityFamily(product);
    affectedByFamily.set(family, (affectedByFamily.get(family) ?? 0) + 1);
  }

  return [...families.entries()].map(([family, record]) => {
    const totalWeight = record.votes.A + record.votes.B + record.votes.C;
    const [grade, votes] = (Object.entries(record.votes) as Array<[Exclude<Grade, "D">, number]>).sort((a, b) => b[1] - a[1])[0];
    const consensus = totalWeight ? votes / totalWeight : 0;
    const eligible = record.asins.size >= 5 && record.sessions.size >= 2 && totalWeight >= 10 && consensus >= 0.75;
    const configured = learning.preferenceRuleSettings[family]?.status;
    return {
      family,
      grade,
      evidenceCount: record.asins.size,
      sessionCount: record.sessions.size,
      totalWeight,
      consensus,
      evidenceAsins: [...record.asins],
      affectedCount: affectedByFamily.get(family) ?? 0,
      status: eligible ? configured === "paused" ? "paused" : "active" : "collecting",
    };
  }).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.consensus - a.consensus || b.evidenceCount - a.evidenceCount);
}

export function buildLearnedGradeMap(products: readonly DiversityProduct[], learning: LearningState) {
  const activeRules = new Map(buildPreferenceRules(products, learning)
    .filter((rule) => rule.status === "active")
    .map((rule) => [rule.family, rule]));
  return new Map(products.flatMap((product) => {
    const learned = activeRules.get(opportunityFamily(product));
    return learned ? [[product.asin, learned] as const] : [];
  }));
}
