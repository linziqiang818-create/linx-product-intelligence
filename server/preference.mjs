// 第二大脑：锚点式偏好学习引擎（2026-09-18 用户定稿）。
// 模型：以你动过手的产品为"锚点"（👍感兴趣/移除为主，收藏弱参考），候选产品只被
// "与锚点高度相似"这一件事影响——喜欢的高度相似款加分升入第二大脑，移除的高度相似款扣分排除。
// 绝不按类目连坐：负向锚点按你选择的移除原因分流（普货只连平庸款、材质只连同材质、类目才连类目）。
// 可选视觉向量（本地 CLIP，见 vision.mjs）作为第三通道，捕捉属性表达不了的"看一眼就知道像不像"。
import { translateSegment } from "./category-zh.mjs";

const displayValue = (dim, value) => (dim === "category" || dim === "catGroup" ? translateSegment(value) : value);

export const EVENT_WEIGHTS = {
  favorite: 1, // 降权（2026-09-18）：收藏原因复杂，只算参考票
  unfavorite: -1,
  interested: 3, // 主正向锚点
  not_interested: 0, // 👎 的降层由手动钉住（tier='pool'）直接完成，不产生泛化锚点
  rescue: 3, // 无视硬性规则也要它，意图明确的正向
  exclude: -4, // 主负向锚点（带移除原因，决定负向泛化通道）
  cal_develop: 3,
  cal_reject: -5,
  cal_uncertain: -1,
  cal_priority: 4,
  cal_low: -4,
  pref_research: 6,
  pref_secondary: 2,
  pref_pass: -6,
  // 恢复自动判定：记录在案、可撤销，但不算学习信号
  auto_reset: 0,
};

const HALF_LIFE_DAYS = 120;

// 自动升入第二大脑的正向偏好分门槛：一个 👍 锚点对高度相似款（相似度≥5）约给 46 分，
// 泛泛沾光的宽属性命中不了"高度相似线"（相似度 <4 直接不计），所以 40 分只属于真同款气质。
export const BRAIN_AUTO_THRESHOLD = 40;

// 类目优中选优（2026-09-18 用户定稿）：每个类目按推荐分取前 20%（至少 1 款）自动进入第二大脑。
// 用户口径：第二大脑约为适配池的两成、每个类目都有代表；类目间多少不齐是正常的，不做硬性配额。
export const BRAIN_CATEGORY_TOP = 0.2;

const DIM_LABELS = {
  category: "类目",
  catGroup: "类目大类",
  form: "产品形态",
  style: "造型元素",
  scenario: "使用场景",
  structure: "结构功能",
  matGroup: "材质",
  priceBand: "价格带",
  salesBand: "月销区间",
  growthBand: "增长态势",
};

const STYLE = [
  [/arched|\barch\b|拱形/i, "拱形"],
  [/fluted|ripple|\bwave\b|grooved|reeded|\bslat|波纹|条纹/i, "波纹条纹"],
  [/curved|curve\b|弧形/i, "弧形曲线"],
  [/rounded|round corner|圆角/i, "圆角"],
  [/carved|engraved|雕花/i, "雕花"],
  [/cutout|perforated|hollow|镂空/i, "镂空"],
  [/rattan|\bcane\b|woven|weave|藤编/i, "藤编纹理"],
  [/vintage|antique|retro|复古/i, "复古"],
  [/farmhouse|rustic|农舍|乡村/i, "乡村农舍"],
  [/scalloped|扇贝/i, "扇贝边"],
  [/mid.?century|中古/i, "中古风"],
  [/boho|bohemian/i, "波西米亚"],
  [/\bgold\b|brass|金色/i, "金色五金"],
  [/marble|岩板|大理石/i, "石纹台面"],
];

const STRUCTURE = [
  [/lift[- ]?top|lift up|升降/i, "升降"],
  [/rotat|swivel|旋转/i, "旋转"],
  [/extend|expandable|伸缩/i, "伸缩"],
  [/fold|折叠/i, "折叠"],
  [/charging|\busb\b|outlet|充电|插座/i, "充电插座"],
  [/\bled\b|lighted|灯/i, "灯光"],
  [/modular|模块/i, "模块化"],
  [/hidden|secret|隐藏/i, "隐藏收纳"],
  [/adjustable|可调/i, "可调节"],
  [/drawer|抽屉/i, "抽屉"],
  [/\bdoors?\b|柜门/i, "柜门"],
  [/wheel|caster|滚轮|轮子/i, "带轮"],
  [/lockable|with lock|带锁|可上锁/i, "带锁"],
  [/cushion|坐垫/i, "坐垫"],
  [/hooks?\b|挂钩/i, "挂钩"],
  [/glass door|玻璃门/i, "玻璃门"],
  [/sliding|barn door|推拉|滑门/i, "推拉门"],
];

const SCENARIO = [
  [/reception|front desk|前台|接待/i, "前台接待"],
  [/manicure|nail (?:desk|table|station)|美甲/i, "美甲"],
  [/salon|barber|美发|理发/i, "美发沙龙"],
  [/sewing|craft|缝纫|手作/i, "手作缝纫"],
  [/dog crate|pet|\bcat\b|litter|宠物|猫砂|狗笼/i, "宠物"],
  [/coffee bar|coffee station|咖啡/i, "咖啡吧"],
  [/laundry|洗衣/i, "洗衣房"],
  [/wine|bar cabinet|liquor|酒柜|吧台/i, "酒柜吧台"],
  [/printer|打印/i, "打印机台"],
  [/record player|vinyl|turntable|黑胶/i, "黑胶唱片"],
  [/reptile|terrarium|aquarium|fish tank|爬宠|鱼缸/i, "爬宠鱼缸"],
  [/entryway|hall tree|mudroom|玄关/i, "玄关"],
  [/gaming|电竞/i, "电竞"],
  [/pantry|kitchen island|厨房/i, "厨房"],
  [/vanity|makeup|梳妆/i, "梳妆"],
  [/office|办公/i, "办公"],
];

const FORM = [
  [/hall tree|玄关/i, "玄关架"],
  [/sideboard|buffet|credenza|餐边柜/i, "餐边柜"],
  [/bookcase|bookshelf|书架|书柜/i, "书架书柜"],
  [/cabinet|柜/i, "柜类"],
  [/dresser|chest of drawers|斗柜/i, "斗柜"],
  [/nightstand|bedside|床头柜/i, "床头柜"],
  [/wardrobe|armoire|closet|衣柜/i, "衣柜"],
  [/\bdesk\b|workstation|桌/i, "桌类"],
  [/\btable\b|台/i, "台桌"],
  [/\bbed\b|床/i, "床类"],
  [/bench|stool|凳/i, "凳类"],
  [/\bstand\b|rack|架/i, "架类"],
  [/crate|enclosure|笼/i, "笼柜"],
  [/chair|椅/i, "椅类"],
];

function bandOf(value, edges, labels) {
  for (let i = 0; i < edges.length; i++) if (value < edges[i]) return labels[i];
  return labels[labels.length - 1];
}

function matchAll(list, text) {
  return list.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export function extractAttrs(product, materialGroup) {
  const text = `${product.category ?? ""} ${product.title ?? ""}`;
  const segments = String(product.category ?? "").split(/[/:>›»|]/).map((s) => s.trim()).filter(Boolean);
  const category = segments.at(-1) ?? "";
  const catGroup = segments.length > 1 ? segments.at(-2) : category;
  const price = Number(product.price) || 0;
  const sales = Number(product.monthlySales) || 0;
  const rawGrowth = Number(product.salesGrowth) || 0;
  const growth = Math.abs(rawGrowth) > 2 ? rawGrowth / 100 : rawGrowth;
  return {
    category,
    catGroup,
    form: matchAll(FORM, text).slice(0, 2),
    style: matchAll(STYLE, text),
    scenario: matchAll(SCENARIO, text),
    structure: matchAll(STRUCTURE, text),
    matGroup: materialGroup || "unknown",
    priceBand: price > 0 ? bandOf(price, [100, 150, 200, 300, 500], ["<$100", "$100–150", "$150–200", "$200–300", "$300–500", "$500+"]) : "",
    salesBand: sales > 0 ? bandOf(sales, [20, 50, 150, 300, 800], ["月销<20", "月销20–50", "月销50–150", "月销150–300", "月销300–800", "月销800+"]) : "",
    growthBand: sales > 0 ? (growth < 0 ? "销量下降" : growth < 0.15 ? "销量持平" : growth < 0.5 ? "销量增长" : "高速增长") : "",
  };
}

function decayed(weight, createdAt, now) {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return weight;
  const ageDays = Math.max(0, (now - created) / 86_400_000);
  return weight * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

// ---------- 相似度：产品对产品，逐维度比对，只有"高度相似"才产生泛化 ----------

// 相似度线：≥4 算高度相似。两个平庸板式柜只共享 大类0.5+材质1+形态1+价格0.5≈3，过不了线；
// 必须命中 类目/场景/造型 这类具体维度才行。
export const SIM_MIN = 4;

const shared = (a = [], b = []) => b.filter((v) => a.includes(v)).length;

export function similarity(a, b) {
  let s = 0;
  if (a.category && a.category === b.category) s += 3;
  s += shared(a.scenario, b.scenario) * 3; // 细分场景是最强气质信号
  s += Math.min(3, shared(a.style, b.style)) * 2; // 造型元素是改款的落点
  s += Math.min(2, shared(a.form, b.form));
  s += Math.min(2, shared(a.structure, b.structure));
  if (a.matGroup && a.matGroup !== "unknown" && a.matGroup === b.matGroup) s += 1;
  if (a.catGroup && a.catGroup === b.catGroup) s += 0.5;
  if (a.priceBand && a.priceBand === b.priceBand) s += 0.5;
  return s;
}

// 差异化水平：造型/细分场景/结构亮点越少越"普货"。办公/厨房/玄关这类泛场景只算 1 分，
// 前台接待/美甲这类细分场景才算 3 分——普货通道的负向锚点只连同样平庸的款。
const BROAD_SCENARIOS = new Set(["办公", "厨房", "玄关", "梳妆"]);

export function distinctiveness(a = {}) {
  const scenarioPts = (a.scenario ?? []).reduce((s, v) => s + (BROAD_SCENARIOS.has(v) ? 1 : 3), 0);
  return Math.min(6, (a.style?.length ?? 0) * 2) + Math.min(6, scenarioPts) + Math.min(2, a.structure?.length ?? 0);
}

// 移除原因 → 负向泛化通道：你选的原因决定这次"排除"沿哪个维度传播，绝不越界连坐类目。
function channelOf(reason = "") {
  if (/材质/.test(reason)) return "material";
  if (/类目/.test(reason)) return "category";
  if (/普货|结构/.test(reason)) return "generic";
  if (/同质/.test(reason)) return "crowding";
  return "product";
}

const CHANNEL_LABELS = {
  generic: "同是平庸款",
  crowding: "同属拥挤款",
  material: "同材质同做法",
  category: "同类目",
  product: "高度相似",
};

function negativeChannelMatch(attrs, seed) {
  const sameFamily = attrs.category === seed.attrs.category || (attrs.catGroup && attrs.catGroup === seed.attrs.catGroup);
  switch (seed.channel) {
    case "material":
      return Boolean(attrs.matGroup && attrs.matGroup !== "unknown" && attrs.matGroup === seed.attrs.matGroup && sameFamily);
    case "category":
      return Boolean(attrs.category) && attrs.category === seed.attrs.category;
    case "generic":
      // 普货判断只转移给"同样没有亮点"的同族款；有辨识度的款豁免
      return sameFamily && distinctiveness(attrs) < 3;
    case "crowding":
      // 同质化判断只转移给"同样挤在热闹簇里"的款；稀缺款豁免
      return sameFamily && (Number(attrs.crowd) || 0) >= 20;
    default:
      return similarity(attrs, seed.attrs) >= SIM_MIN;
  }
}

// ---------- 锚点模型：同一产品的多次操作聚合为一个锚点（封顶 ±6，反复点击不重复计票） ----------

// events + attrsByAsin (+ reasonByAsin：移除原因，来自 overrides) → 正/负锚点集
export function buildProfile(events, attrsByAsin, now = Date.now(), reasonByAsin = new Map()) {
  const perAsin = new Map();
  for (const event of events) {
    const attrs = attrsByAsin.get(event.asin);
    if (!attrs) continue;
    const w = decayed(Number(event.weight) || 0, event.created_at, now);
    if (!w) continue;
    const cur = perAsin.get(event.asin) ?? { asin: event.asin, attrs, w: 0 };
    cur.w = Math.max(-6, Math.min(6, cur.w + w));
    perAsin.set(event.asin, cur);
  }
  const positives = [];
  const negatives = [];
  let totalPos = 0;
  for (const { asin, attrs, w } of perAsin.values()) {
    if (w > 0) {
      positives.push({ asin, attrs, w });
      totalPos += w;
    } else if (w < 0) {
      negatives.push({ asin, attrs, w: -w, channel: channelOf(reasonByAsin.get(asin) ?? "") });
    }
  }
  // 强度只按正向锚点计（约 8 个 👍 级锚点达到上限）；负向只做排除，不贡献"懂你"置信度
  const strength = Math.min(1, totalPos / 24);
  return { positives, negatives, eventCount: positives.length, totalPos, strength, builtAt: new Date(now).toISOString() };
}

// 视觉相似度标定（2026-09-18 实测全库分布）：跨类目配对 P75≈0.79、P99≈0.88；同类目中位 0.83。
// 0.80 以下视为无视觉信号，0.92 达到满分——"近乎双胞胎"才给满票。
const VISUAL_COS_BASE = 0.8;
const VISUAL_COS_RANGE = 0.12;
const visualScoreOf = (vec, seedVec) => (vec && seedVec ? Math.max(0, Math.min(1, (cosine(vec, seedVec) - VISUAL_COS_BASE) / VISUAL_COS_RANGE)) : 0);

// 候选产品打分：与正锚点高度相似 → 加分；与负锚点高度相似（或命中其移除原因通道）→ 扣分；其余一律 0。
// vec / seed.vec 为可选的本地视觉向量：视觉同款可以绕过属性相似线直接产生泛化。
export function scorePreference(attrs, model, vec = null) {
  if (!model || (!model.positives.length && !model.negatives.length)) return { prefScore: 0, contributions: [] };
  let raw = 0;
  const contributions = [];
  const visualScore = (seed) => visualScoreOf(vec, seed.vec);

  for (const seed of model.positives) {
    const attrScore = similarity(attrs, seed.attrs) >= SIM_MIN ? Math.min(1, similarity(attrs, seed.attrs) / 5) : 0;
    const vScore = visualScore(seed);
    const f = Math.max(attrScore, vScore);
    if (f <= 0) continue;
    raw += seed.w * f;
    contributions.push({
      dim: "anchor",
      value: seed.attrs.category,
      label: vScore > attrScore ? `与你看好的「${displayValue("category", seed.attrs.category)}」视觉同款` : `与你 👍 的「${displayValue("category", seed.attrs.category)}」高度相似`,
      score: Math.round(seed.w * f * 100),
      pos: 1,
      neg: 0,
    });
  }
  for (const seed of model.negatives) {
    if (seed.channel === "product") {
      const attrScore = similarity(attrs, seed.attrs) >= SIM_MIN ? Math.min(1, similarity(attrs, seed.attrs) / 5) : 0;
      const vScore = visualScore(seed);
      const f = Math.max(attrScore, vScore);
      if (f <= 0) continue;
      raw -= seed.w * f;
      contributions.push({ dim: "avoid", value: seed.attrs.category, label: `与你移除的「${displayValue("category", seed.attrs.category)}」高度相似`, score: -Math.round(seed.w * f * 100), pos: 0, neg: 1 });
    } else if (negativeChannelMatch(attrs, seed)) {
      raw -= seed.w * 0.75;
      contributions.push({ dim: "avoid", value: seed.attrs.category, label: `${CHANNEL_LABELS[seed.channel]}：与你移除的「${displayValue("category", seed.attrs.category)}」同源`, score: -75, pos: 0, neg: 1 });
    }
  }
  contributions.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const prefScore = Math.max(-100, Math.min(100, Math.round(Math.tanh(raw / 6) * 100)));
  return { prefScore, contributions: contributions.slice(0, 8) };
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) dot += a[i] * b[i];
  return dot;
}

// 最终推荐分：证据不足时退化为规则基础分；证据充足时偏好占 60%。
export function finalScoreFor(baseScore, prefScore, strength) {
  const base = Number(baseScore) || 0;
  const pref01 = 50 + (Number(prefScore) || 0) / 2;
  const blended = 0.6 * pref01 + 0.4 * base;
  return Math.round((strength * blended + (1 - strength) * base) * 10) / 10;
}

export function reasonsFor(contributions, assessment, placement) {
  const reasons = [];
  for (const c of contributions.filter((c) => c.score > 1.5).slice(0, 3)) reasons.push(c.label);
  for (const c of contributions.filter((c) => c.score < -1.5).slice(0, 1)) reasons.push(c.label);
  if (assessment) {
    if (assessment.estimatedMargin >= 25) reasons.push(`预估利润率 ${assessment.estimatedMargin}%`);
    for (const s of assessment.hiddenSignals.slice(0, 2)) reasons.push(s);
    if (assessment.trendElements.length) reasons.push(`机会元素：${assessment.trendElements.slice(0, 3).join("、")}`);
  }
  if (placement?.convertible) reasons.push(`可改款：${placement.convertible}`);
  return [...new Set(reasons)].slice(0, 5);
}

// 横幅摘要：从锚点的显著特质里挑你最看重的 / 你排除最多的
export function profileSummary(model) {
  if (!model) return { eventCount: 0, strength: 0, top: [], avoid: [] };
  const tally = (seeds, sign) => {
    const map = new Map();
    const add = (dim, value, weight) => {
      if (!value || value === "unknown") return;
      const key = `${dim}:${value}`;
      const cur = map.get(key) ?? { dim, dimLabel: DIM_LABELS[dim], value, label: displayValue(dim, value), weight: 0, pos: 0, neg: 0 };
      cur.weight += sign * weight;
      if (sign > 0) cur.pos++;
      else cur.neg++;
      map.set(key, cur);
    };
    for (const seed of seeds) {
      const a = seed.attrs;
      const w = Math.abs(seed.w);
      add("category", a.category, w * 2);
      add("catGroup", a.catGroup, w * 0.5);
      add("matGroup", a.matGroup, w);
      for (const v of a.style ?? []) add("style", v, w * 2);
      for (const v of a.scenario ?? []) add("scenario", v, w * 3);
      for (const v of a.form ?? []) add("form", v, w);
    }
    return [...map.values()];
  };
  return {
    eventCount: model.positives.length,
    strength: Math.round(model.strength * 100),
    builtAt: model.builtAt,
    top: tally(model.positives, 1).filter((c) => c.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 15),
    avoid: tally(model.negatives, -1).sort((a, b) => a.weight - b.weight).slice(0, 10),
  };
}
