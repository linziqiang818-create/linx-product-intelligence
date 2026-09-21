// 需求 / 利润 / 公司适配度评估（移植自旧 opportunity.ts）。
// 不再包含硬性淘汰与价格下限：清除逻辑由 rules.mjs 负责，价格只作筛选条件。

const policy = {
  newProductMaxDays: 180,
  margin: { centerPercent: 20, modelWeight: 0.06, quotedWeight: 0.12, curveWidth: 12 },
  score: { companyFit: 0.4, hiddenOpportunity: 0.38, demand: 0.22 },
};

const casegoodTerms = /cabinet|sideboard|dresser|nightstand|console table|coffee table|end table|desk|workstation|bookshelf|bookcase|pantry|storage|vanity desk|shoe cabinet|entryway|reception desk|podium|coffee station|craft table|sewing table|pet furniture|dog crate|cat cabinet|cat enclosure|litter box|hall tree|bench|wardrobe|armoire|hutch|橱柜|边柜|斗柜|床头柜|桌|书架|鞋柜|收纳|猫砂柜|衣柜|柜/i;
const structuralTerms = /drawer|door|shelf|hinge|slide|lift.?top|fold|extend|adjustable|charging|usb|outlet|caster|抽屉|柜门|层板|铰链|滑轨|升降|折叠|伸缩|可调|充电/i;
const nicheUseTerms = /reception|manicure|nail|craft|sewing|coffee station|coffee bar|printer stand|record player|vinyl|dog crate|cat litter|entryway|small space|apartment|corner|farmhouse pantry|laundry|reptile|terrarium/i;
const companyMaterialTerms = /mdf|particle ?board|engineered wood|manufactured wood|composite wood|fiberboard|melamine|laminate|plywood|veneer|acrylic|刨花板|颗粒板|密度板|人造板|三聚氰胺|多层板|亚克力/i;

const elements = [
  [/fluted|wave|ripple|grooved/i, "波纹门板"],
  [/charging|usb|outlet/i, "充电模块"],
  [/\bled\b|lighted/i, "氛围灯"],
  [/lift.?top|lift up/i, "升降结构"],
  [/rotat|swivel/i, "旋转功能"],
  [/extendable|expandable/i, "伸缩结构"],
  [/storage|drawer|cabinet/i, "隐藏收纳"],
  [/arched|\barch\b/i, "拱形造型"],
  [/adjustable/i, "可调节"],
  [/motion sensor/i, "感应功能"],
];

const companyAffinity = [
  [/lift.?top|lift up|adjustable|extendable|folding/i, "功能结构"],
  [/storage|drawer|cabinet|pantry|dresser|sideboard/i, "板式收纳系统"],
  [/workstation|desk|craft|sewing|nail|coffee station|reception|podium/i, "场景工作台"],
  [/fluted|wave|ripple|arched/i, "外观识别元素"],
  [/dog crate|cat litter|pet furniture|reptile/i, "宠物家具化"],
];

// 校准阶段总结出的用户口味先验（来自旧 company-calibration.ts）
const priors = [
  { test: (t) => /coffee bar|mini fridge cabinet|reception desk|front counter/i.test(t) && /fridge|wine|lockable|keyboard|drawer|storage|shelf|cabinet/i.test(t), delta: 3, reason: "细分场景与一体化功能结合" },
  { test: (t) => /fluted|wave|ripple|arched|rounded corner/i.test(t) && /cabinet|sideboard|dresser|bookcase|bookshelf|credenza/i.test(t), delta: 3, reason: "柜体具有明确的造型识别度" },
  { test: (t) => /reception|front desk|manicure|nail desk|filing cabinet|file cabinet/i.test(t) && /lockable|drawer|storage|extendable|dust collector|keyboard tray|cable grommet/i.test(t), delta: 3, reason: "专业工作场景与实用结构结合" },
  { test: (t) => /furniture[- ]style dog crate|dog crate furniture|foldable shoe rack|electric standing desk|height adjustable standing desk/i.test(t), delta: -3, reason: "该通用方向历史上连续出现低兴趣反馈" },
  { test: (t) => /\bbed\b|bed frame|loft bed/i.test(t) && !/half[- ]moon|curved|airframe|arched base|round cushioned/i.test(t), delta: -4, reason: "普通床类方向历史优先度较低" },
];

export function parseDimensionsCm(value) {
  const nums = (String(value ?? "").match(/[\d.]+/g) ?? []).map(Number).filter((n) => n > 0);
  if (nums.length < 3) return null;
  const cm = /inch|inches|\bin\b|"|”/i.test(String(value)) ? nums.map((n) => n * 2.54) : nums;
  return cm.sort((a, b) => b - a).slice(0, 3);
}

const clamp = (v) => Math.min(100, Math.max(0, Math.round(v)));

export function marginScoreFor(marginPercent) {
  if (!Number.isFinite(marginPercent) || marginPercent <= 0) return 50;
  const { centerPercent, curveWidth } = policy.margin;
  return Math.round(50 + 45 * Math.tanh((marginPercent - centerPercent) / curveWidth));
}

export function assess(p) {
  const text = `${p.category ?? ""} ${p.title ?? ""} ${p.material ?? ""}`;
  const price = Number(p.price) || 0;
  const monthlySales = Number(p.monthlySales) || 0;
  const launchDays = Number(p.launchDays) || 0;
  const rawGrowth = Number(p.salesGrowth) || 0;
  const growth = Math.abs(rawGrowth) > 2 ? rawGrowth / 100 : rawGrowth;
  const reviews = Number(p.reviews) || 0;
  const rating = Number(p.rating) || 0;
  const packageGrossKg = Number(p.packageGrossKg) || (Number(p.weight) || 0) / 2.205;
  const quotedMargin = Number(p.estimatedMargin) || 0;
  const priceUplift = Number(p.priceUplift) || 0;

  const hasCasegoodForm = casegoodTerms.test(text);
  const hasStructure = structuralTerms.test(text);
  const hasCompanyMaterial = companyMaterialTerms.test(text);
  const affinity = companyAffinity.filter(([re]) => re.test(text)).map(([, label]) => label);

  // 运费与超规只看包装尺寸；商品组装尺寸不能代表包裹尺寸（平板包装）
  const d = parseDimensionsCm(p.packageDimensionsCm);
  const longestIn = d ? d[0] / 2.54 : 0;
  const secondIn = d ? d[1] / 2.54 : 0;
  const girthIn = d ? longestIn + 2 * (secondIn + d[2] / 2.54) : 0;
  const weightLb = packageGrossKg * 2.205;
  const volumeM3 = d ? (d[0] * d[1] * d[2]) / 1_000_000 : 0;
  const packageKnown = Boolean(packageGrossKg > 0 && d);
  const cannotShip = Boolean(d && (longestIn >= 108 || girthIn >= 165 || weightLb >= 150));
  const freightTriggers = [
    packageGrossKg > 22 ? "超过 22 kg 成本节点" : "",
    packageGrossKg > 49 ? "超过 49 kg，优先减重或双包" : "",
    weightLb > 50 ? "超过 50 lb 附加费" : "",
    longestIn > 48 ? "最长边超过 48 in" : "",
    secondIn > 30 ? "第二长边超过 30 in" : "",
    girthIn >= 105 ? "围长达到 105 in" : "",
  ].filter(Boolean);

  let companyFit = 0;
  if (hasCasegoodForm) companyFit += 34;
  if (hasCompanyMaterial) companyFit += 24;
  if (hasStructure) companyFit += 14;
  companyFit += Math.min(24, affinity.length * 8);
  // 价格带（用户确认 2026-09-17）：自有产品预期售价不低于 150；竞品 140 起就有借鉴价值；
  // 公司 MDF 大货峰值约 600（套装除外，基本不做）。150–600 满档，140–150 仅参考区，其余不加分。
  if (price >= 150 && price <= 600) companyFit += 6;
  else if (price >= 140 && price <= 600) companyFit += 3;
  companyFit = clamp(companyFit);

  const featureCost = /led|electric|massage|fireplace|motor|lift|adjustable/i.test(text) ? 0.035 : 0;
  const estimatedLogistics = packageKnown
    ? 10 + packageGrossKg * 0.28 + volumeM3 * 72 + (packageGrossKg > 22 ? 5 : 0) + (packageGrossKg > 49 ? 13 : 0)
    : 0;
  const modelMargin = packageKnown && price > 0
    ? Math.round(((price * 0.77 - price * (0.245 + featureCost) - estimatedLogistics) / price) * 1000) / 10
    : 0;
  const effectiveMargin = quotedMargin > 0 ? quotedMargin : modelMargin;
  const marginKnown = effectiveMargin > 0;
  const marginScore = marginKnown ? marginScoreFor(effectiveMargin) : 50;
  const marginWeight = marginKnown ? (quotedMargin > 0 ? policy.margin.quotedWeight : policy.margin.modelWeight) : 0;

  const isNew = launchDays > 0 && launchDays <= policy.newProductMaxDays;
  const demand = clamp(
    Math.log10(monthlySales + 1) * 24 + Math.max(0, growth) * 28 + (isNew ? 16 : 0) - (monthlySales < 20 ? 18 : 0),
  );
  const reviewVelocity = reviews > 0 ? monthlySales / Math.max(20, reviews) : monthlySales / 20;
  // 用户验证需求的核心模式：近期上架却已有稳定月销 → 需求真实，且评论壁垒尚未形成。
  // 评论上限只防异常（变体合并继承老评论的"假新品"），不是独立门槛：上架近本身就意味着评论少。
  const entryWindow = isNew && monthlySales >= 30 && reviews < 100;
  // 老店铺垂直类目的特殊情况：上架久、评论壁垒厚，但长期稳销说明其造型与功能经过长周期验证。
  // 不是切入窗口，仍值得整款借鉴；给少量补偿，抵掉纯评论数带来的拥挤惩罚。
  const longProven = launchDays >= 365 && monthlySales >= 50 && reviews >= 300;
  const hiddenSignals = [
    entryWindow ? "近期上架即有稳定销量，评论壁垒未形成" : isNew && monthlySales >= 40 ? "新品已出现稳定销量" : "",
    longProven ? "老品长期稳销，造型与功能经长周期验证" : "",
    growth >= 0.15 ? "销量仍在明显增长" : "",
    monthlySales >= 60 && reviews < 100 ? "评论壁垒较低" : "",
    monthlySales >= 50 && rating > 0 && rating < 4.3 ? "有需求但评分偏低，存在改款窗口" : "",
    nicheUseTerms.test(text) ? "细分场景词明显" : "",
    price >= 150 ? "高客单价为结构或功能升级留出空间" : "",
    priceUplift >= 3 ? "改款后具备提价空间" : "",
  ].filter(Boolean);
  const crowdingPenalty = reviews >= 3000 ? 4 : reviews >= 1000 ? 2 : 0;
  const hiddenOpportunity = clamp(
    demand * 0.34 + Math.min(4, Math.max(0, reviewVelocity) * 3) + hiddenSignals.length * 5 + (reviews < 100 ? 2 : 0) + (entryWindow ? 6 : 0) + (longProven ? 2 : 0) - crowdingPenalty,
  );

  const priorHits = priors.filter((rule) => rule.test(text));
  const priorAdjust = priorHits.reduce((sum, rule) => sum + rule.delta, 0);

  const baseScore = companyFit * policy.score.companyFit + hiddenOpportunity * policy.score.hiddenOpportunity + demand * policy.score.demand;
  const score = clamp(baseScore * (1 - marginWeight) + marginScore * marginWeight + priorAdjust);

  const dataMissing = [
    !packageGrossKg ? "包装毛重" : "",
    !d ? "包装尺寸" : "",
    !String(p.material ?? "").trim() ? "材质" : "",
  ].filter(Boolean);

  const potential = isNew && monthlySales >= 50 && monthlySales <= 300 && reviews < 100;

  return {
    score,
    companyFit,
    hiddenOpportunity,
    demand,
    marginScore,
    estimatedMargin: effectiveMargin,
    marginConfidence: quotedMargin > 0 ? "高" : packageKnown ? "中" : "低",
    freightTriggers,
    cannotShip,
    packageKnown,
    dataMissing,
    potential,
    entryWindow,
    longProven,
    hiddenSignals,
    trendElements: elements.filter(([re]) => re.test(text)).map(([, label]) => label),
    affinity,
    priorReasons: priorHits.map((rule) => `${rule.delta > 0 ? "+" : ""}${rule.delta} ${rule.reason}`),
    fitReasons: [
      hasCompanyMaterial ? "匹配板式/亚克力材料体系" : "",
      hasCasegoodForm ? "产品形态在公司可开发范围" : "",
      hasStructure ? "具备可优化的结构或五金模块" : "",
      ...affinity.map((item) => `匹配${item}`),
    ].filter(Boolean),
  };
}
