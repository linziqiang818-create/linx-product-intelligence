import { emptyLearningState, mergeLearningStates, normalizeLearningState, type LearningState } from "./learning-state.ts";

export type LearningPatch = Partial<LearningState> & { version: 2; updatedAt: string };

const jsonEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const isNewer = (left: { updatedAt: string }, right?: { updatedAt: string }) => !right || Date.parse(left.updatedAt) > Date.parse(right.updatedAt);

function newerTimedRecords<T extends { updatedAt: string }>(local: Record<string, T>, cloud: Record<string, T>) {
  return Object.fromEntries(Object.entries(local).filter(([key, value]) => isNewer(value, cloud[key])));
}

export function createLearningPatch(localValue: unknown, cloudValue: unknown): LearningPatch {
  const local = normalizeLearningState(localValue);
  const cloud = normalizeLearningState(cloudValue);
  const cloudEvents = new Set(cloud.events.map((event) => event.id));
  const cloudReports = new Set(cloud.reflectionReports.map((report) => report.id));
  const cloudPurged = new Set(cloud.purgedAsins);
  const cloudFavorites = new Set(cloud.favorites);
  const recycleBin = Object.fromEntries(Object.entries(local.recycleBin).filter(([asin, entry]) => {
    const current = cloud.recycleBin[asin];
    return !current || Date.parse(entry.recycledAt) > Date.parse(current.recycledAt);
  }));

  return {
    version: 2,
    gradeOverrides: newerTimedRecords(local.gradeOverrides, cloud.gradeOverrides),
    categoryOverrides: newerTimedRecords(local.categoryOverrides, cloud.categoryOverrides),
    recycleBin,
    purgedAsins: local.purgedAsins.filter((asin) => !cloudPurged.has(asin)),
    favorites: local.favorites.filter((asin) => !cloudFavorites.has(asin)),
    events: local.events.filter((event) => !cloudEvents.has(event.id)),
    reflectionReports: local.reflectionReports.filter((report) => !cloudReports.has(report.id)),
    preferenceRuleSettings: newerTimedRecords(local.preferenceRuleSettings, cloud.preferenceRuleSettings),
    ...(!jsonEqual(local.batchCalibration, cloud.batchCalibration) ? { batchCalibration: local.batchCalibration } : {}),
    ...(!jsonEqual(local.legacyCalibration, cloud.legacyCalibration) ? { legacyCalibration: local.legacyCalibration } : {}),
    updatedAt: local.updatedAt,
  };
}

export function learningPatchCount(patch: LearningPatch) {
  return Object.keys(patch.gradeOverrides ?? {}).length
    + Object.keys(patch.categoryOverrides ?? {}).length
    + Object.keys(patch.recycleBin ?? {}).length
    + (patch.purgedAsins?.length ?? 0)
    + (patch.favorites?.length ?? 0)
    + (patch.events?.length ?? 0)
    + (patch.reflectionReports?.length ?? 0)
    + Object.keys(patch.preferenceRuleSettings ?? {}).length
    + (Object.prototype.hasOwnProperty.call(patch, "batchCalibration") ? 1 : 0)
    + (Object.prototype.hasOwnProperty.call(patch, "legacyCalibration") ? 1 : 0);
}

function mergePatch(left: LearningPatch, right: LearningPatch): LearningPatch {
  return {
    version: 2,
    gradeOverrides: { ...left.gradeOverrides, ...right.gradeOverrides },
    categoryOverrides: { ...left.categoryOverrides, ...right.categoryOverrides },
    recycleBin: { ...left.recycleBin, ...right.recycleBin },
    purgedAsins: [...(left.purgedAsins ?? []), ...(right.purgedAsins ?? [])],
    favorites: [...(left.favorites ?? []), ...(right.favorites ?? [])],
    events: [...(left.events ?? []), ...(right.events ?? [])],
    reflectionReports: [...(left.reflectionReports ?? []), ...(right.reflectionReports ?? [])],
    preferenceRuleSettings: { ...left.preferenceRuleSettings, ...right.preferenceRuleSettings },
    ...(Object.prototype.hasOwnProperty.call(right, "batchCalibration")
      ? { batchCalibration: right.batchCalibration }
      : Object.prototype.hasOwnProperty.call(left, "batchCalibration") ? { batchCalibration: left.batchCalibration } : {}),
    ...(Object.prototype.hasOwnProperty.call(right, "legacyCalibration")
      ? { legacyCalibration: right.legacyCalibration }
      : Object.prototype.hasOwnProperty.call(left, "legacyCalibration") ? { legacyCalibration: left.legacyCalibration } : {}),
    updatedAt: Date.parse(right.updatedAt) >= Date.parse(left.updatedAt) ? right.updatedAt : left.updatedAt,
  };
}

function patchAtoms(patch: LearningPatch): LearningPatch[] {
  const atoms: LearningPatch[] = [];
  const atom = (value: Partial<LearningState>, updatedAt = patch.updatedAt) => atoms.push({ version: 2, updatedAt, ...value });
  for (const [asin, value] of Object.entries(patch.gradeOverrides ?? {})) atom({ gradeOverrides: { [asin]: value } }, value.updatedAt);
  for (const [asin, value] of Object.entries(patch.categoryOverrides ?? {})) atom({ categoryOverrides: { [asin]: value } }, value.updatedAt);
  for (const [asin, value] of Object.entries(patch.recycleBin ?? {})) atom({ recycleBin: { [asin]: value } }, value.recycledAt);
  for (const asin of patch.purgedAsins ?? []) atom({ purgedAsins: [asin] });
  if (patch.favorites?.length) atom({ favorites: patch.favorites });
  for (const event of patch.events ?? []) atom({ events: [event] }, event.createdAt);
  for (const report of patch.reflectionReports ?? []) atom({ reflectionReports: [report] }, report.createdAt);
  for (const [family, value] of Object.entries(patch.preferenceRuleSettings ?? {})) atom({ preferenceRuleSettings: { [family]: value } }, value.updatedAt);
  if (Object.prototype.hasOwnProperty.call(patch, "batchCalibration")) atom({ batchCalibration: patch.batchCalibration });
  if (Object.prototype.hasOwnProperty.call(patch, "legacyCalibration")) atom({ legacyCalibration: patch.legacyCalibration });
  return atoms;
}

export function splitLearningPatch(patch: LearningPatch, maxBytes = 350_000): LearningPatch[] {
  if (!learningPatchCount(patch)) return [];
  const chunks: LearningPatch[] = [];
  let current = { version: 2, updatedAt: patch.updatedAt } as LearningPatch;
  for (const atom of patchAtoms(patch)) {
    const candidate = mergePatch(current, atom);
    if (learningPatchCount(current) && JSON.stringify({ patch: candidate }).length > maxBytes) {
      chunks.push(current);
      current = atom;
    } else current = candidate;
  }
  if (learningPatchCount(current)) chunks.push(current);
  return chunks;
}

export function applyLearningPatch(state: unknown, patch: LearningPatch) {
  return mergeLearningStates(state, { ...emptyLearningState(patch.updatedAt), ...patch });
}
