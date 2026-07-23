import type { Grade } from "./recommendation-grade.ts";

export const recycleRetentionDays = 30;
const retentionMs = recycleRetentionDays * 24 * 60 * 60 * 1000;

export type GradeOverride = {
  grade: Grade;
  updatedAt: string;
};

export type LearningEventKind = "grade" | "favorite" | "research" | "group" | "challenge" | "recycle" | "restore";

export type LearningEvent = {
  id: string;
  kind: LearningEventKind;
  value: string;
  createdAt: string;
  sessionId: string;
  asin?: string;
  relatedAsin?: string;
  groupId?: string;
  previousValue?: string;
};

export type ReflectionReport = {
  id: string;
  createdAt: string;
  fromAt: string;
  toAt: string;
  eventIds: string[];
  actionCounts: Record<string, number>;
  gradeCounts: Record<Grade, number>;
  familySignals: Array<{
    family: string;
    asins: string[];
    eventCount: number;
    conclusion: string;
  }>;
  contradictions: string[];
};

export type PreferenceRuleSetting = {
  status: "active" | "paused";
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
  version: 2;
  gradeOverrides: Record<string, GradeOverride>;
  recycleBin: Record<string, RecycledProduct>;
  purgedAsins: string[];
  favorites: string[];
  batchCalibration: Record<string, unknown> | null;
  legacyCalibration: Record<string, unknown> | null;
  events: LearningEvent[];
  reflectionReports: ReflectionReport[];
  preferenceRuleSettings: Record<string, PreferenceRuleSetting>;
  updatedAt: string;
};

export function emptyLearningState(now = new Date().toISOString()): LearningState {
  return {
    version: 2,
    gradeOverrides: {},
    recycleBin: {},
    purgedAsins: [],
    favorites: [],
    batchCalibration: null,
    legacyCalibration: null,
    events: [],
    reflectionReports: [],
    preferenceRuleSettings: {},
    updatedAt: now,
  };
}

const isGrade = (value: unknown): value is Grade => value === "A" || value === "B" || value === "C" || value === "D";
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const eventKinds = new Set<LearningEventKind>(["grade", "favorite", "research", "group", "challenge", "recycle", "restore"]);

function normalizeEvent(value: unknown): LearningEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<LearningEvent>;
  if (
    typeof event.id !== "string" ||
    !event.id ||
    !eventKinds.has(event.kind as LearningEventKind) ||
    typeof event.value !== "string" ||
    !validDate(event.createdAt) ||
    typeof event.sessionId !== "string" ||
    !event.sessionId
  ) return null;
  return {
    id: event.id,
    kind: event.kind as LearningEventKind,
    value: event.value,
    createdAt: event.createdAt!,
    sessionId: event.sessionId,
    ...(typeof event.asin === "string" && event.asin ? { asin: event.asin } : {}),
    ...(typeof event.relatedAsin === "string" && event.relatedAsin ? { relatedAsin: event.relatedAsin } : {}),
    ...(typeof event.groupId === "string" && event.groupId ? { groupId: event.groupId } : {}),
    ...(typeof event.previousValue === "string" ? { previousValue: event.previousValue } : {}),
  };
}

function normalizeReport(value: unknown): ReflectionReport | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Partial<ReflectionReport>;
  if (
    typeof report.id !== "string" ||
    !report.id ||
    !validDate(report.createdAt) ||
    !validDate(report.fromAt) ||
    !validDate(report.toAt) ||
    !Array.isArray(report.eventIds)
  ) return null;
  const gradeCounts = report.gradeCounts && typeof report.gradeCounts === "object"
    ? report.gradeCounts as Record<Grade, number>
    : { A: 0, B: 0, C: 0, D: 0 };
  return {
    id: report.id,
    createdAt: report.createdAt!,
    fromAt: report.fromAt!,
    toAt: report.toAt!,
    eventIds: report.eventIds.filter((id): id is string => typeof id === "string"),
    actionCounts: report.actionCounts && typeof report.actionCounts === "object" ? report.actionCounts as Record<string, number> : {},
    gradeCounts: {
      A: Number(gradeCounts.A ?? 0),
      B: Number(gradeCounts.B ?? 0),
      C: Number(gradeCounts.C ?? 0),
      D: Number(gradeCounts.D ?? 0),
    },
    familySignals: Array.isArray(report.familySignals) ? report.familySignals.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Partial<ReflectionReport["familySignals"][number]>;
      if (typeof item.family !== "string" || !Array.isArray(item.asins)) return [];
      return [{
        family: item.family,
        asins: item.asins.filter((asin): asin is string => typeof asin === "string"),
        eventCount: Number(item.eventCount ?? 0),
        conclusion: typeof item.conclusion === "string" ? item.conclusion : "继续观察",
      }];
    }) : [],
    contradictions: Array.isArray(report.contradictions) ? report.contradictions.filter((item): item is string => typeof item === "string") : [],
  };
}

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
  const preferenceRuleSettings = Object.fromEntries(Object.entries(raw.preferenceRuleSettings ?? {}).flatMap(([family, record]) => {
    if (!record || typeof record !== "object") return [];
    const item = record as PreferenceRuleSetting;
    return (item.status === "active" || item.status === "paused") && validDate(item.updatedAt) ? [[family, item]] : [];
  }));
  const events = [...new Map((Array.isArray(raw.events) ? raw.events : [])
    .map(normalizeEvent)
    .filter((event): event is LearningEvent => Boolean(event))
    .map((event) => [event.id, event])).values()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-5_000);
  const reflectionReports = [...new Map((Array.isArray(raw.reflectionReports) ? raw.reflectionReports : [])
    .map(normalizeReport)
    .filter((report): report is ReflectionReport => Boolean(report))
    .map((report) => [report.id, report])).values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100);
  return purgeExpiredLearningState({
    version: 2,
    gradeOverrides,
    recycleBin,
    purgedAsins: [...new Set((raw.purgedAsins ?? []).filter((asin): asin is string => typeof asin === "string" && asin.length > 0))],
    favorites: [...new Set((raw.favorites ?? []).filter((asin): asin is string => typeof asin === "string" && asin.length > 0))],
    batchCalibration: raw.batchCalibration && typeof raw.batchCalibration === "object" ? raw.batchCalibration : null,
    legacyCalibration: raw.legacyCalibration && typeof raw.legacyCalibration === "object" ? raw.legacyCalibration : null,
    events,
    reflectionReports,
    preferenceRuleSettings,
    updatedAt: validDate(raw.updatedAt) ? raw.updatedAt! : new Date(now).toISOString(),
  }, now);
}

export function appendLearningEvent(state: LearningState, event: LearningEvent): LearningState {
  const events = [...state.events.filter((item) => item.id !== event.id), event]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-5_000);
  return { ...state, events, updatedAt: event.createdAt };
}

export function appendReflectionReport(state: LearningState, report: ReflectionReport): LearningState {
  const reflectionReports = [report, ...state.reflectionReports.filter((item) => item.id !== report.id)]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100);
  return { ...state, reflectionReports, updatedAt: report.createdAt };
}

export function setPreferenceRuleStatus(
  state: LearningState,
  family: string,
  status: PreferenceRuleSetting["status"],
  updatedAt = new Date().toISOString(),
): LearningState {
  return {
    ...state,
    preferenceRuleSettings: {
      ...state.preferenceRuleSettings,
      [family]: { status, updatedAt },
    },
    updatedAt,
  };
}

function newer<T extends { updatedAt: string }>(left: T | undefined, right: T | undefined) {
  if (!left) return right;
  if (!right) return left;
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  if (!Number.isFinite(leftTime)) return right;
  if (!Number.isFinite(rightTime)) return left;
  return rightTime >= leftTime ? right : left;
}

function mergeTimedRecordMaps<T extends { updatedAt: string }>(left: Record<string, T>, right: Record<string, T>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Object.fromEntries([...keys].flatMap((key) => {
    const value = newer(left[key], right[key]);
    return value ? [[key, value]] : [];
  }));
}

function mergeCalibration(left: Record<string, unknown> | null, right: Record<string, unknown> | null) {
  if (!left) return right;
  if (!right) return left;
  const merged: Record<string, unknown> = { ...left, ...right };
  for (const field of ["groups", "research", "challenges", "legacyAudit"]) {
    const leftMap = left[field];
    const rightMap = right[field];
    if (leftMap && typeof leftMap === "object" && rightMap && typeof rightMap === "object") {
      merged[field] = mergeTimedRecordMaps(
        leftMap as Record<string, { updatedAt: string }>,
        rightMap as Record<string, { updatedAt: string }>,
      );
    }
  }
  return merged;
}

export function mergeLearningStates(leftValue: unknown, rightValue: unknown, now = Date.now()): LearningState {
  const left = normalizeLearningState(leftValue, now);
  const right = normalizeLearningState(rightValue, now);
  const events = [...new Map([...left.events, ...right.events].map((event) => [event.id, event])).values()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-5_000);
  const reports = [...new Map([...left.reflectionReports, ...right.reflectionReports].map((report) => [report.id, report])).values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100);
  const gradeOverrides = mergeTimedRecordMaps(left.gradeOverrides, right.gradeOverrides);
  const preferenceRuleSettings = mergeTimedRecordMaps(left.preferenceRuleSettings, right.preferenceRuleSettings);
  const purgedAsins = [...new Set([...left.purgedAsins, ...right.purgedAsins])];
  const recycleCandidates = new Map<string, RecycledProduct>();
  for (const [asin, entry] of [...Object.entries(left.recycleBin), ...Object.entries(right.recycleBin)] as Array<[string, RecycledProduct]>) {
    const previous = recycleCandidates.get(asin);
    if (!previous || Date.parse(entry.recycledAt) >= Date.parse(previous.recycledAt)) recycleCandidates.set(asin, entry);
  }
  const recycleBin: LearningState["recycleBin"] = {};
  for (const [asin, entry] of recycleCandidates) {
    if (purgedAsins.includes(asin)) continue;
    const latestRestore = [...events].reverse().find((event) => event.asin === asin && event.kind === "restore");
    if (latestRestore && Date.parse(latestRestore.createdAt) >= Date.parse(entry.recycledAt)) continue;
    recycleBin[asin] = entry;
  }
  const favorites = new Set([...left.favorites, ...right.favorites]);
  for (const event of events) {
    if (event.kind !== "favorite" || !event.asin) continue;
    if (event.value === "add") favorites.add(event.asin);
    if (event.value === "remove") favorites.delete(event.asin);
  }
  return purgeExpiredLearningState({
    version: 2,
    gradeOverrides,
    recycleBin,
    purgedAsins,
    favorites: [...favorites],
    batchCalibration: mergeCalibration(left.batchCalibration, right.batchCalibration),
    legacyCalibration: right.legacyCalibration ?? left.legacyCalibration,
    events,
    reflectionReports: reports,
    preferenceRuleSettings,
    updatedAt: Date.parse(right.updatedAt) >= Date.parse(left.updatedAt) ? right.updatedAt : left.updatedAt,
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
  const legacy = state.legacyCalibration && typeof state.legacyCalibration === "object" ? Object.keys(state.legacyCalibration).length : 0;
  return Object.keys(state.gradeOverrides).length + Object.keys(state.recycleBin).length + state.purgedAsins.length + state.favorites.length + calibration + legacy + state.events.length + state.reflectionReports.length;
}

export function migrateLegacyCalibration(state: LearningState, value: unknown, now = new Date().toISOString()): LearningState {
  if (!value || typeof value !== "object") return state;
  const legacy = value as { version?: unknown; feedback?: unknown };
  if (legacy.version !== 1 || !legacy.feedback || typeof legacy.feedback !== "object") return state;
  const gradeOverrides = { ...state.gradeOverrides };
  for (const [asin, raw] of Object.entries(legacy.feedback as Record<string, unknown>)) {
    if (gradeOverrides[asin] || !raw || typeof raw !== "object") continue;
    const feedback = raw as { verdict?: unknown; interest?: unknown; updatedAt?: unknown };
    const grade: Grade | undefined = feedback.verdict === "develop"
      ? feedback.interest === "priority" ? "A" : feedback.interest === "normal" ? "B" : feedback.interest === "low" ? "C" : undefined
      : feedback.verdict === "reject" ? "C" : undefined;
    if (grade) gradeOverrides[asin] = { grade, updatedAt: validDate(feedback.updatedAt) ? feedback.updatedAt as string : now };
  }
  return { ...state, gradeOverrides, legacyCalibration: value as Record<string, unknown>, updatedAt: now };
}
