import { emptyLearningState, normalizeLearningState, type LearningState } from "./learning-state.ts";
import type { LearningPatch } from "./learning-sync.ts";

export type LearningEntryKind =
  | "grade"
  | "category"
  | "recycle"
  | "purged"
  | "favorite"
  | "event"
  | "report"
  | "preference"
  | "batch-calibration"
  | "legacy-calibration";

export type LearningStorageEntry = {
  kind: LearningEntryKind;
  key: string;
  payload: string;
  updatedAt: string;
};

const singletonKey = "company";
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

/** Convert a client diff into independently upsertable rows. No product decision is changed here. */
export function learningPatchToEntries(value: unknown, fallbackUpdatedAt = new Date().toISOString()): LearningStorageEntry[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as Partial<LearningPatch>;
  const updatedAt = validDate(raw.updatedAt) ? raw.updatedAt : fallbackUpdatedAt;
  const normalized = normalizeLearningState({ ...emptyLearningState(updatedAt), ...raw }, Date.parse(updatedAt));
  const entries = new Map<string, LearningStorageEntry>();
  const add = (kind: LearningEntryKind, key: string, payload: unknown, entryUpdatedAt = updatedAt) => {
    if (!key || !validDate(entryUpdatedAt)) return;
    const entry = { kind, key, payload: JSON.stringify(payload), updatedAt: entryUpdatedAt };
    entries.set(`${kind}\u0000${key}`, entry);
  };

  if (Object.prototype.hasOwnProperty.call(raw, "gradeOverrides")) {
    for (const [asin, record] of Object.entries(normalized.gradeOverrides)) add("grade", asin, record, record.updatedAt);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "categoryOverrides")) {
    for (const [asin, record] of Object.entries(normalized.categoryOverrides)) add("category", asin, record, record.updatedAt);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "recycleBin")) {
    for (const [asin, record] of Object.entries(normalized.recycleBin)) add("recycle", asin, record, record.recycledAt);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "purgedAsins") || Object.prototype.hasOwnProperty.call(raw, "recycleBin")) {
    for (const asin of normalized.purgedAsins) add("purged", asin, true);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "favorites")) {
    for (const asin of normalized.favorites) add("favorite", asin, true);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "events")) {
    for (const event of normalized.events) add("event", event.id, event, event.createdAt);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "reflectionReports")) {
    for (const report of normalized.reflectionReports) add("report", report.id, report, report.createdAt);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "preferenceRuleSettings")) {
    for (const [family, record] of Object.entries(normalized.preferenceRuleSettings)) add("preference", family, record, record.updatedAt);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "batchCalibration")) add("batch-calibration", singletonKey, normalized.batchCalibration);
  if (Object.prototype.hasOwnProperty.call(raw, "legacyCalibration")) add("legacy-calibration", singletonKey, normalized.legacyCalibration);
  return [...entries.values()];
}

/** Rebuild a normal LearningState from normalized rows before merging it with the immutable legacy snapshot. */
export function learningEntriesToState(entries: LearningStorageEntry[], updatedAt = new Date().toISOString()): LearningState {
  const state = emptyLearningState(updatedAt);
  for (const entry of entries) {
    let payload: unknown;
    try { payload = JSON.parse(entry.payload); } catch { continue; }
    if (entry.kind === "grade") state.gradeOverrides[entry.key] = payload as LearningState["gradeOverrides"][string];
    if (entry.kind === "category") state.categoryOverrides[entry.key] = payload as LearningState["categoryOverrides"][string];
    if (entry.kind === "recycle") state.recycleBin[entry.key] = payload as LearningState["recycleBin"][string];
    if (entry.kind === "purged") state.purgedAsins.push(entry.key);
    if (entry.kind === "favorite") state.favorites.push(entry.key);
    if (entry.kind === "event") state.events.push(payload as LearningState["events"][number]);
    if (entry.kind === "report") state.reflectionReports.push(payload as LearningState["reflectionReports"][number]);
    if (entry.kind === "preference") state.preferenceRuleSettings[entry.key] = payload as LearningState["preferenceRuleSettings"][string];
    if (entry.kind === "batch-calibration") state.batchCalibration = payload as LearningState["batchCalibration"];
    if (entry.kind === "legacy-calibration") state.legacyCalibration = payload as LearningState["legacyCalibration"];
  }
  return normalizeLearningState(state);
}
