import { majorCategoryFor } from "./major-category.ts";
import { opportunityFamily, type DiversityProduct } from "./opportunity-diversity.ts";
import type { LearningEventKind, LearningState } from "./learning-state.ts";
import type { Grade } from "./recommendation-grade.ts";

export type PreferenceLearningProduct = DiversityProduct & {
  price?: number;
  monthlySales?: number;
  launchDays?: number;
  rating?: number;
  reviews?: number;
  bsr?: number;
  material?: string;
  complexity?: number;
  differentiation?: number;
  manualMajorCategoryId?: string;
};

export type LearnedGrade = {
  grade: Exclude<Grade, "D">;
  family: string;
  evidenceCount: number;
  sessionCount: number;
  consensus: number;
  adjustment: number;
  reasons: string[];
};

export type PreferenceRule = LearnedGrade & {
  totalWeight: number;
  evidenceAsins: string[];
  affectedCount: number;
  status: "collecting" | "active" | "paused";
};

export type PreferenceSignalRule = {
  ruleKey: string;
  dimension: string;
  label: string;
  direction: "prefer" | "avoid" | "mixed";
  score: number;
  evidenceCount: number;
  sessionCount: number;
  totalWeight: number;
  consensus: number;
  evidenceAsins: string[];
  affectedCount: number;
  status: "collecting" | "active" | "paused";
};

type ResearchRecord = { decision?: "research" | "hold" | "pass"; updatedAt?: string };
type PreferenceSignal = { key: string; dimension: string; label: string };

function researchSignals(value: LearningState["batchCalibration"]) {
  if (!value || typeof value !== "object") return {} as Record<string, ResearchRecord>;
  const research = (value as { research?: unknown }).research;
  return research && typeof research === "object" ? research as Record<string, ResearchRecord> : {};
}

const legacySession = (updatedAt?: string) => `legacy:${(updatedAt ?? "unknown").slice(0, 10)}`;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const signal = (key: string, dimension: string, label: string): PreferenceSignal => ({ key, dimension, label });

function textSignals(product: PreferenceLearningProduct) {
  const text = `${product.title} ${product.material ?? ""}`;
  const signals: PreferenceSignal[] = [];
  const patterns: Array<[RegExp, string, string]> = [
    [/fluted|wave|ripple|slatted|tambour|波纹|格栅/i, "style:fluted", "波纹、格栅或卷帘元素"],
    [/arched|arch|curved|rounded|拱形|弧形|圆角/i, "style:curved", "拱形、弧形或圆角造型"],
    [/rattan|cane|woven|藤编|藤条/i, "style:rattan", "藤编或编织元素"],
    [/farmhouse|rustic|barn door|乡村|谷仓门/i, "style:farmhouse", "乡村或谷仓门风格"],
    [/mid.?century|modern|contemporary|现代|中古/i, "style:modern", "现代或中古风格"],
    [/charging|usb|outlet|led|lighted|motion sensor|充电|插座|灯带|感应/i, "function:electrical", "充电、照明或感应功能"],
    [/lift.?top|lift up|height.?adjustable|extendable|expandable|fold(?:ing|able)|rotat|swivel|升降|伸缩|折叠|旋转/i, "function:transform", "升降、伸缩、折叠或旋转结构"],
    [/hidden|concealed|secret|隐藏|隐形/i, "function:hidden", "隐藏式功能或收纳"],
    [/reception|manicure|nail|sewing|craft|record player|vinyl|litter box|dog crate|laundry workstation|前台|美甲|缝纫|手作|黑胶|猫砂|宠物箱|洗衣机工作台/i, "scenario:niche", "明确细分使用场景"],
  ];
  for (const [pattern, key, label] of patterns) if (pattern.test(text)) signals.push(signal(key, key.split(":")[0] === "style" ? "造型偏好" : key.split(":")[0] === "function" ? "功能结构" : "使用场景", label));
  const hasStructure = /drawer|door|shelf|hinge|slide|lift.?top|fold|extend|adjustable|charging|usb|outlet|caster|modular|convertible|抽屉|柜门|层板|铰链|滑轨|升降|折叠|伸缩|可调|充电|模块/i.test(text);
  const complexity = number(product.complexity);
  const differentiation = number(product.differentiation);
  if (hasStructure || complexity >= 4 || differentiation >= 4) signals.push(signal("structure:developable", "结构开发", "具备结构、五金或差异化开发空间"));
  if (!hasStructure && complexity > 0 && complexity <= 3 && differentiation > 0 && differentiation <= 3) signals.push(signal("structure:simple", "结构开发", "结构偏简单或接近标准品"));
  return signals;
}

export function preferenceSignalsFor(product: PreferenceLearningProduct): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];
  const category = majorCategoryFor(product);
  if (category.id !== "unclassified") signals.push(signal(`category:${category.id}`, "产品类目", `${category.zh} / ${category.en}`));
  signals.push(...textSignals(product));

  const reviews = number(product.reviews);
  if (reviews > 0) signals.push(reviews < 50
    ? signal("competition:low", "竞争强度", "评论少于 50，竞争壁垒较低")
    : reviews < 200
      ? signal("competition:medium", "竞争强度", "评论 50–199，中等竞争")
      : reviews < 1000
        ? signal("competition:high", "竞争强度", "评论 200–999，竞争偏高")
        : signal("competition:very-high", "竞争强度", "评论 1000 以上，竞争拥挤"));

  const launchDays = number(product.launchDays);
  if (launchDays > 0) signals.push(launchDays <= 180
    ? signal("age:new", "上架阶段", "上架不超过 180 天")
    : launchDays <= 730
      ? signal("age:growing", "上架阶段", "上架 181–730 天")
      : signal("age:mature", "上架阶段", "上架超过 730 天"));

  const price = number(product.price);
  if (price > 0) signals.push(price < 100
    ? signal("price:below-100", "价格带", "售价低于 100 美元")
    : price < 150
      ? signal("price:100-149", "价格带", "售价 100–149 美元")
      : price < 250
        ? signal("price:150-249", "价格带", "售价 150–249 美元")
        : signal("price:250-plus", "价格带", "售价 250 美元以上"));

  const sales = number(product.monthlySales);
  if (sales > 0) signals.push(sales < 50
    ? signal("demand:low", "需求阶段", "月销低于 50")
    : sales <= 300
      ? signal("demand:validated", "需求阶段", "月销 50–300，处于验证区间")
      : signal("demand:mature", "需求阶段", "月销超过 300"));

  const bsr = number(product.bsr);
  if (bsr > 0) signals.push(bsr <= 20_000
    ? signal("bsr:top", "类目排名", "BSR 前 2 万")
    : bsr <= 100_000
      ? signal("bsr:middle", "类目排名", "BSR 2万–10万")
      : signal("bsr:long-tail", "类目排名", "BSR 10 万以后"));

  return [...new Map(signals.map((item) => [item.key, item])).values()];
}

function learningProducts(products: readonly PreferenceLearningProduct[], learning: LearningState) {
  const map = new Map(products.map((product) => [product.asin, product]));
  for (const entry of Object.values(learning.recycleBin)) {
    const product = entry.product as Partial<PreferenceLearningProduct>;
    if (typeof product.asin === "string" && typeof product.title === "string" && typeof product.category === "string") map.set(entry.asin, product as PreferenceLearningProduct);
  }
  return map;
}

function latestSession(learning: LearningState, asin: string, kind: LearningEventKind, updatedAt?: string) {
  return [...learning.events].reverse().find((event) => event.asin === asin && event.kind === kind)?.sessionId ?? legacySession(updatedAt);
}

/**
 * Repeated A/B/C feedback becomes a transparent family-level ranking bias.
 * Recycle is handled by cross-dimensional signals below so a broad family is
 * not rejected merely because many weak products in it were recycled.
 */
export function buildPreferenceRules(products: readonly PreferenceLearningProduct[], learning: LearningState): PreferenceRule[] {
  const productsByAsin = learningProducts(products, learning);
  const recycled = new Set(Object.keys(learning.recycleBin));
  const families = new Map<string, { asins: Set<string>; sessions: Set<string>; votes: Record<Exclude<Grade, "D">, number> }>();
  const addVote = (asin: string, grade: Exclude<Grade, "D">, weight: number, sessionId: string) => {
    const product = productsByAsin.get(asin);
    if (!product) return;
    const family = opportunityFamily(product);
    const record = families.get(family) ?? { asins: new Set<string>(), sessions: new Set<string>(), votes: { A: 0, B: 0, C: 0 } };
    record.asins.add(asin);
    record.sessions.add(sessionId);
    record.votes[grade] += weight;
    families.set(family, record);
  };

  for (const [asin, feedback] of Object.entries(learning.gradeOverrides)) {
    if (!recycled.has(asin) && feedback.grade !== "D") addVote(asin, feedback.grade, 2, latestSession(learning, asin, "grade", feedback.updatedAt));
  }
  for (const asin of learning.favorites) if (!recycled.has(asin)) addVote(asin, "A", 0.5, latestSession(learning, asin, "favorite"));
  for (const [asin, feedback] of Object.entries(researchSignals(learning.batchCalibration))) {
    if (recycled.has(asin)) continue;
    if (feedback.decision === "research") addVote(asin, "A", 1, latestSession(learning, asin, "research", feedback.updatedAt));
    if (feedback.decision === "hold") addVote(asin, "B", 1, latestSession(learning, asin, "research", feedback.updatedAt));
    if (feedback.decision === "pass") addVote(asin, "C", 1, latestSession(learning, asin, "research", feedback.updatedAt));
  }

  const affectedByFamily = new Map<string, number>();
  for (const product of products) affectedByFamily.set(opportunityFamily(product), (affectedByFamily.get(opportunityFamily(product)) ?? 0) + 1);

  return [...families.entries()].map(([family, record]) => {
    const totalWeight = record.votes.A + record.votes.B + record.votes.C;
    const [grade, votes] = (Object.entries(record.votes) as Array<[Exclude<Grade, "D">, number]>).sort((a, b) => b[1] - a[1])[0];
    const consensus = totalWeight ? votes / totalWeight : 0;
    const eligible = record.asins.size >= 5 && record.sessions.size >= 2 && totalWeight >= 10 && consensus >= 0.75;
    const configured = learning.preferenceRuleSettings[family]?.status;
    return { family, grade, evidenceCount: record.asins.size, sessionCount: record.sessions.size, totalWeight, consensus, adjustment: grade === "A" ? 8 : grade === "C" ? -8 : 0, reasons: [`产品家族：${family}`], evidenceAsins: [...record.asins], affectedCount: affectedByFamily.get(family) ?? 0, status: eligible ? configured === "paused" ? "paused" : "active" : "collecting" };
  }).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.consensus - a.consensus || b.evidenceCount - a.evidenceCount);
}

export function buildPreferenceSignalRules(products: readonly PreferenceLearningProduct[], learning: LearningState): PreferenceSignalRule[] {
  const productsByAsin = learningProducts(products, learning);
  const recycled = new Set(Object.keys(learning.recycleBin));
  const outcomes = new Map<string, { score: number; confidence: number; sessionId: string }>();
  const records = new Map<string, { signal: PreferenceSignal; asins: Set<string>; sessions: Set<string>; positive: number; negative: number; weightedScore: number; totalWeight: number }>();
  const addOutcome = (asin: string, score: number, weight: number, sessionId: string) => {
    const product = productsByAsin.get(asin);
    if (!product) return;
    for (const item of preferenceSignalsFor(product)) {
      const record = records.get(item.key) ?? { signal: item, asins: new Set<string>(), sessions: new Set<string>(), positive: 0, negative: 0, weightedScore: 0, totalWeight: 0 };
      record.asins.add(asin);
      record.sessions.add(sessionId);
      record.weightedScore += score * weight;
      record.totalWeight += weight;
      if (score > 0) record.positive += weight;
      if (score < 0) record.negative += weight;
      records.set(item.key, record);
    }
  };

  // Keep one final outcome per product so repeated clicks do not overpower the
  // user's broader judgement. Recycle wins because it is the explicit final
  // "never develop" action, while D without recycle remains non-propagating.
  for (const [asin, entry] of Object.entries(learning.recycleBin)) {
    outcomes.set(asin, { score: -1, confidence: 1, sessionId: latestSession(learning, asin, "recycle", entry.recycledAt) });
  }
  for (const [asin, feedback] of Object.entries(learning.gradeOverrides)) {
    if (recycled.has(asin) || feedback.grade === "D") continue;
    outcomes.set(asin, { score: feedback.grade === "A" ? 1 : feedback.grade === "B" ? 0.3 : -0.6, confidence: 1, sessionId: latestSession(learning, asin, "grade", feedback.updatedAt) });
  }
  for (const [asin, feedback] of Object.entries(researchSignals(learning.batchCalibration))) {
    if (recycled.has(asin) || outcomes.has(asin)) continue;
    if (feedback.decision === "research") outcomes.set(asin, { score: 0.8, confidence: 0.7, sessionId: latestSession(learning, asin, "research", feedback.updatedAt) });
    if (feedback.decision === "hold") outcomes.set(asin, { score: 0.15, confidence: 0.7, sessionId: latestSession(learning, asin, "research", feedback.updatedAt) });
    if (feedback.decision === "pass") outcomes.set(asin, { score: -0.6, confidence: 0.7, sessionId: latestSession(learning, asin, "research", feedback.updatedAt) });
  }
  for (const asin of learning.favorites) {
    if (recycled.has(asin)) continue;
    const existing = outcomes.get(asin);
    if (existing) outcomes.set(asin, { ...existing, score: Math.min(1, existing.score + 0.15) });
    else outcomes.set(asin, { score: 0.7, confidence: 0.5, sessionId: latestSession(learning, asin, "favorite") });
  }

  // The user is deliberately strict and has recycled far more products than
  // they have promoted. Balance positive and negative classes before learning
  // cross-product signals, otherwise every common attribute becomes negative.
  const positiveWeight = [...outcomes.values()].filter((item) => item.score > 0).reduce((sum, item) => sum + item.confidence, 0);
  const negativeWeight = [...outcomes.values()].filter((item) => item.score < 0).reduce((sum, item) => sum + item.confidence, 0);
  const targetWeight = positiveWeight && negativeWeight ? (positiveWeight + negativeWeight) / 2 : positiveWeight || negativeWeight;
  const positiveMultiplier = positiveWeight ? Math.min(8, Math.max(0.125, targetWeight / positiveWeight)) : 1;
  const negativeMultiplier = negativeWeight ? Math.min(8, Math.max(0.125, targetWeight / negativeWeight)) : 1;
  for (const [asin, outcome] of outcomes) {
    const classMultiplier = outcome.score > 0 ? positiveMultiplier : outcome.score < 0 ? negativeMultiplier : 1;
    addOutcome(asin, outcome.score, outcome.confidence * classMultiplier, outcome.sessionId);
  }

  const affected = new Map<string, number>();
  for (const product of products) for (const item of preferenceSignalsFor(product)) affected.set(item.key, (affected.get(item.key) ?? 0) + 1);

  return [...records.entries()].map(([key, record]) => {
    const score = record.totalWeight ? record.weightedScore / record.totalWeight : 0;
    const directionalWeight = record.positive + record.negative;
    const consensus = directionalWeight ? Math.max(record.positive, record.negative) / directionalWeight : 0;
    const direction = score >= 0.25 ? "prefer" : score <= -0.25 ? "avoid" : "mixed";
    const eligible = record.asins.size >= 8 && record.sessions.size >= 2 && record.totalWeight >= 10 && consensus >= 0.7 && direction !== "mixed";
    const ruleKey = `signal:${key}`;
    const configured = learning.preferenceRuleSettings[ruleKey]?.status;
    return { ruleKey, dimension: record.signal.dimension, label: record.signal.label, direction, score, evidenceCount: record.asins.size, sessionCount: record.sessions.size, totalWeight: record.totalWeight, consensus, evidenceAsins: [...record.asins], affectedCount: affected.get(key) ?? 0, status: eligible ? configured === "paused" ? "paused" : "active" : "collecting" };
  }).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || Math.abs(b.score) - Math.abs(a.score) || b.evidenceCount - a.evidenceCount);
}

export function buildLearnedGradeMap(products: readonly PreferenceLearningProduct[], learning: LearningState) {
  const familyRules = new Map(buildPreferenceRules(products, learning).filter((rule) => rule.status === "active").map((rule) => [rule.family, rule]));
  const signalRules = new Map(buildPreferenceSignalRules(products, learning).filter((rule) => rule.status === "active").map((rule) => [rule.ruleKey.slice(7), rule]));
  return new Map(products.flatMap((product) => {
    const family = familyRules.get(opportunityFamily(product));
    const matched = preferenceSignalsFor(product).flatMap((item) => {
      const rule = signalRules.get(item.key);
      return rule ? [rule] : [];
    }).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 4);
    if (!family && !matched.length) return [];
    const signalScore = matched.length ? matched.reduce((sum, rule) => sum + rule.score, 0) / matched.length : 0;
    const familyScore = family ? family.grade === "A" ? 0.8 : family.grade === "C" ? -0.8 : 0.15 : 0;
    const combined = matched.length && family ? signalScore * 0.75 + familyScore * 0.25 : matched.length ? signalScore : familyScore;
    if (Math.abs(combined) < 0.2) return [];
    const adjustment = Math.max(-12, Math.min(8, Math.round(combined * 10)));
    const grade: Exclude<Grade, "D"> = adjustment >= 3 ? "A" : adjustment <= -3 ? "C" : "B";
    const evidenceAsins = new Set([...(family?.evidenceAsins ?? []), ...matched.flatMap((rule) => rule.evidenceAsins)]);
    const sessions = Math.max(family?.sessionCount ?? 0, ...matched.map((rule) => rule.sessionCount), 0);
    const consensus = Math.max(family?.consensus ?? 0, ...matched.map((rule) => rule.consensus), 0);
    const reasons = [
      ...(family ? [`产品家族“${family.family}”倾向 ${family.grade}`] : []),
      ...matched.slice(0, 3).map((rule) => `${rule.label}：${rule.direction === "prefer" ? "更优先" : "更谨慎"}`),
    ];
    return [[product.asin, { grade, family: family?.family ?? "多维偏好", evidenceCount: evidenceAsins.size, sessionCount: sessions, consensus, adjustment, reasons }] as const];
  }));
}
