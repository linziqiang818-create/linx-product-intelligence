import type { Grade } from "./recommendation-grade.ts";

export const recycleRetentionDays = 30;
const retentionMs = recycleRetentionDays * 24 * 60 * 60 * 1000;

export type GradeOverride = {
  grade: Grade;
  updatedAt: string;
};

export type RecycledProduct = {
  asin: string;
  product: Record<string, unknown>;
  previousGrade: Grade;
  recycledAt: string;
  purgeAt: string;
};

export type LearningState = {
  version: 1;
  gradeOverrides: Record<string, GradeOverride>;
  recycleBin: Record<string, RecycledProduct>;
  purgedAsins: string[];
  favorites: string[];
  batchCalibration: Record<string, unknown> | null;
  updatedAt: string;
};

export function emptyLearningState(now = new Date().toISOString()): LearningState {
  return { version: 1, gradeOverrides: {}, recycleBin: {}, purgedAsins: [], favorites: [], batchCalibration: null, updatedAt: now };
}

const isGrade = (value: unknown): value is Grade => value === "A" || value === "B" || value === "C" || value === "D";
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function normalizeLearningState(value: unknown, now = Date.now()): LearningState {
  if (!value || typeof value !== "object") return emptyLearningState(new Date(now).toISOString());
  const raw = value as Partial<LearningState>;
  const gradeOverrides = Object.fromEntries(Object.entries(raw.gradeOverrides ?? {}).flatMap(([asin, record]) => {
    if (!record || typeof record !== "object") return [];
    const item = record as GradeOverride;
    return isGrade(item.grade) && validDate(item.updatedAt) ? [[asin, item]] : [];
  }));
  const recycleBin = Object.fromEntries(Object.entries(raw.recycleBin ?? {}).flatMap(([asin, record]) => {
    if (!record || typeof record !== "object") return [];
    const item = record as RecycledProduct;
    return item.asin === asin && isGrade(item.previousGrade) && validDate(item.recycledAt) && validDate(item.purgeAt) && item.product && typeof item.product === "object" ? [[asin, item]] : [];
  }));
  return purgeExpiredLearningState({
    version: 1,
    gradeOverrides,
    recycleBin,
    purgedAsins: [...new Set((raw.purgedAsins ?? []).filter((asin): asin is string => typeof asin === "string" && asin.length > 0))],
    favorites: [...new Set((raw.favorites ?? []).filter((asin): asin is string => typeof asin === "string" && asin.length > 0))],
    batchCalibration: raw.batchCalibration && typeof raw.batchCalibration === "object" ? raw.batchCalibration : null,
    updatedAt: validDate(raw.updatedAt) ? raw.updatedAt! : new Date(now).toISOString(),
  }, now);
}

export function purgeExpiredLearningState(state: LearningState, now = Date.now()): LearningState {
  const recycleBin: LearningState["recycleBin"] = {};
  const purged = new Set(state.purgedAsins);
  for (const [asin, entry] of Object.entries(state.recycleBin)) {
    if (Date.parse(entry.purgeAt) <= now) purged.add(asin);
    else recycleBin[asin] = entry;
  }
  return { ...state, recycleBin, purgedAsins: [...purged] };
}

export function recycleProduct(state: LearningState, product: Record<string, unknown> & { asin: string }, previousGrade: Grade, now = new Date()): LearningState {
  const recycledAt = now.toISOString();
  const purgeAt = new Date(now.getTime() + retentionMs).toISOString();
  const recycleBin = { ...state.recycleBin, [product.asin]: { asin: product.asin, product, previousGrade, recycledAt, purgeAt } };
  return { ...state, recycleBin, favorites: state.favorites.filter((asin) => asin !== product.asin), updatedAt: recycledAt };
}

export function restoreRecycledProduct(state: LearningState, asin: string, grade?: Grade, now = new Date().toISOString()): LearningState {
  const entry = state.recycleBin[asin];
  if (!entry) return state;
  const recycleBin = { ...state.recycleBin };
  delete recycleBin[asin];
  return { ...state, recycleBin, gradeOverrides: { ...state.gradeOverrides, [asin]: { grade: grade ?? entry.previousGrade, updatedAt: now } }, updatedAt: now };
}

export function daysUntilPurge(purgeAt: string, now = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(purgeAt) - now) / (24 * 60 * 60 * 1000)));
}

export function learningEvidenceCount(state: LearningState) {
  const calibration = state.batchCalibration && typeof state.batchCalibration === "object"
    ? Object.values(state.batchCalibration).reduce((total, value) => total + (value && typeof value === "object" ? Object.keys(value).length : 0), 0)
    : 0;
  return Object.keys(state.gradeOverrides).length + Object.keys(state.recycleBin).length + state.purgedAsins.length + state.favorites.length + calibration;
}
