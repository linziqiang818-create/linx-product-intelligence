import { opportunityFamily, type DiversityProduct } from "./opportunity-diversity.ts";
import type { LearningState } from "./learning-state.ts";
import type { Grade } from "./recommendation-grade.ts";

export type LearnedGrade = { grade: Exclude<Grade, "D">; family: string; evidenceCount: number };

type ResearchRecord = { decision?: "research" | "hold" | "pass" };

function researchSignals(value: LearningState["batchCalibration"]) {
  if (!value || typeof value !== "object") return {} as Record<string, ResearchRecord>;
  const research = (value as { research?: unknown }).research;
  return research && typeof research === "object" ? research as Record<string, ResearchRecord> : {};
}

/**
 * Learn only repeated soft interest within a product family. D never propagates:
 * hard rejection and disposal remain explicit product-level decisions.
 */
export function buildLearnedGradeMap(products: readonly DiversityProduct[], learning: LearningState) {
  const productsByAsin = new Map(products.map((product) => [product.asin, product]));
  const familyVotes = new Map<string, { asins: Set<string>; votes: Record<Exclude<Grade, "D">, number> }>();
  const addVote = (asin: string, grade: Exclude<Grade, "D">, weight: number) => {
    const product = productsByAsin.get(asin);
    if (!product) return;
    const family = opportunityFamily(product);
    const record = familyVotes.get(family) ?? { asins: new Set<string>(), votes: { A: 0, B: 0, C: 0 } };
    record.asins.add(asin);
    record.votes[grade] += weight;
    familyVotes.set(family, record);
  };

  for (const [asin, feedback] of Object.entries(learning.gradeOverrides)) {
    if (feedback.grade !== "D") addVote(asin, feedback.grade, 2);
  }
  for (const [asin, feedback] of Object.entries(researchSignals(learning.batchCalibration))) {
    if (feedback.decision === "research") addVote(asin, "A", 1);
    if (feedback.decision === "hold") addVote(asin, "B", 1);
    if (feedback.decision === "pass") addVote(asin, "C", 1);
  }

  const learnedFamilies = new Map<string, LearnedGrade>();
  for (const [family, record] of familyVotes) {
    const total = record.votes.A + record.votes.B + record.votes.C;
    if (record.asins.size < 3 || total < 6) continue;
    const [grade, votes] = (Object.entries(record.votes) as Array<[Exclude<Grade, "D">, number]>).sort((a, b) => b[1] - a[1])[0];
    if (votes / total < 0.67) continue;
    learnedFamilies.set(family, { grade, family, evidenceCount: record.asins.size });
  }

  return new Map(products.flatMap((product) => {
    const learned = learnedFamilies.get(opportunityFamily(product));
    return learned ? [[product.asin, learned] as const] : [];
  }));
}
