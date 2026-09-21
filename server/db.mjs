// 数据层：node:sqlite 单文件数据库。负责建表、产品归一化与写入、播种、派生字段全量重算、筛选查询。
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assess } from "./assess.mjs";
import { compileRules, placeProduct } from "./rules.mjs";
import { defaultRules, normalizeRules } from "./rules-config.mjs";
import { EVENT_WEIGHTS, BRAIN_AUTO_THRESHOLD, BRAIN_CATEGORY_TOP, buildProfile, extractAttrs, finalScoreFor, profileSummary, reasonsFor, scorePreference } from "./preference.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, "..");

let titleZhMap = {};
try {
  titleZhMap = JSON.parse(readFileSync(join(here, "data", "title-zh.json"), "utf8"));
} catch {
  titleZhMap = {};
}

export const TEXT_FIELDS = [
  "title", "titleZh", "imageUrl", "category", "material", "variants", "sellingPoints", "painPoints", "sourceUrl", "note",
  "brand", "parentAsin", "dateFirstAvailable", "dimensions", "packageDimensionsCm", "returnRisk", "discoveryKeyword",
  "discoverySource", "sourceWorkbook", "sourceDataProvider", "importedAt", "observedAt", "updatedAt", "monthlySalesRange",
];
export const NUMBER_FIELDS = [
  "price", "rating", "reviews", "bsr", "monthlySales", "salesGrowth", "launchDays", "packageGrossKg", "weight",
  "estimatedMargin", "priceUplift", "complexity", "differentiation", "sourceRow",
];
const KNOWN = new Set(["asin", ...TEXT_FIELDS, ...NUMBER_FIELDS, "extra"]);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  asin TEXT PRIMARY KEY,
  ${TEXT_FIELDS.map((f) => `${f} TEXT NOT NULL DEFAULT ''`).join(",\n  ")},
  ${NUMBER_FIELDS.map((f) => `${f} REAL NOT NULL DEFAULT 0`).join(",\n  ")},
  extra TEXT NOT NULL DEFAULT '{}',
  interest TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT '',
  discoveryState TEXT NOT NULL DEFAULT '',
  placement TEXT NOT NULL DEFAULT 'pass',
  autoPlacement TEXT NOT NULL DEFAULT 'pass',
  autoReason TEXT NOT NULL DEFAULT '',
  removeGroup TEXT NOT NULL DEFAULT '',
  removeReason TEXT NOT NULL DEFAULT '',
  removeRuleId TEXT NOT NULL DEFAULT '',
  convertible TEXT NOT NULL DEFAULT '',
  tagsCsv TEXT NOT NULL DEFAULT ',',
  materialGroup TEXT NOT NULL DEFAULT 'unknown',
  autoBrain INTEGER NOT NULL DEFAULT 0,
  baseScore REAL NOT NULL DEFAULT 0,
  prefScore REAL NOT NULL DEFAULT 0,
  finalScore REAL NOT NULL DEFAULT 0,
  marginEst REAL NOT NULL DEFAULT 0,
  attrs TEXT NOT NULL DEFAULT '{}',
  assessJson TEXT NOT NULL DEFAULT '{}',
  reasonsJson TEXT NOT NULL DEFAULT '[]',
  notesJson TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_products_placement ON products(placement);
CREATE INDEX IF NOT EXISTS idx_products_final ON products(finalScore);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE TABLE IF NOT EXISTS overrides (asin TEXT PRIMARY KEY, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS favorites (asin TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asin TEXT NOT NULL,
  action TEXT NOT NULL,
  weight REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  prev TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_asin ON feedback_events(asin);
CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY AUTOINCREMENT, fileName TEXT, mode TEXT, rows INTEGER, inserted INTEGER, updated INTEGER, images INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visual_vectors (
  asin TEXT PRIMARY KEY,
  vec BLOB NOT NULL,
  dim INTEGER NOT NULL,
  model TEXT NOT NULL,
  computed_at TEXT NOT NULL
);
`;

// 三层池成员谓词（p 为 products 别名）。漏斗语义（2026-09-18 用户定稿）：
// 产品库（全部）→ 适配池 = 过硬性条件的全体（默认层）→ 第二大脑 = 锚点直通（prefScore ≥40）
// + 各类目优中选优（每类目推荐分前 20%，至少 1 款，autoBrain 在重算时标好）+ 手动升入（tier='brain'）。
// 负向反馈不连坐：移出/👎 只作用于个体；模型只做正向挑选，不因你移出什么而降级别的产品。
const SPACES_DISCOVERY = `p.discoveryState IN ('', 'kept')`;
const BRAIN_WHERE = `(p.placement = 'pass' AND ${SPACES_DISCOVERY} AND (p.tier = 'brain' OR (p.tier = '' AND (p.prefScore >= ${BRAIN_AUTO_THRESHOLD} OR p.autoBrain = 1))))`;
const POOL_WHERE = `(p.placement = 'pass' AND ${SPACES_DISCOVERY} AND (p.tier = 'pool' OR (p.tier = '' AND p.prefScore < ${BRAIN_AUTO_THRESHOLD} AND p.autoBrain = 0)))`;

export function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const match = String(v ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return Number(match?.[0]) || 0;
}
const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

function daysSince(dateString) {
  const t = Date.parse(dateString);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

// 月销量可能是数字、"50-99" 这类区间字串，或卖家精灵的 {min,max} 区间对象；统一取中值并保留区间文本
export function parseSales(value) {
  if (value === null || value === undefined || value === "") return { value: 0, range: "" };
  if (typeof value === "object") {
    const min = num(value.min ?? value.lowerBound ?? value.monthlySales);
    const max = num(value.max ?? value.upperBound);
    if (min && max) return { value: Math.round((min + max) / 2), range: `${min}–${max}` };
    return { value: min || max, range: "" };
  }
  if (typeof value === "number") return { value: Math.max(0, Math.round(value)), range: "" };
  const s = String(value).replace(/,/g, "").trim();
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-~–—至]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return { value: Math.round((min + max) / 2), range: `${min}–${max}` };
  }
  const plus = s.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) return { value: Math.round(Number(plus[1])), range: `${plus[1]}+` };
  return { value: Math.round(num(s)), range: "" };
}

// 把来自播种 JSON / Excel 导入 / 旧版 localStorage 的任意产品对象归一化为数据库行
export function normalizeProduct(raw, defaults = {}) {
  const asin = text(raw.asin).toUpperCase();
  if (!asin) return null;
  const row = { asin };
  for (const f of TEXT_FIELDS) row[f] = text(raw[f]);
  for (const f of NUMBER_FIELDS) row[f] = num(raw[f]);

  const sales = [raw.monthlySales, raw.monthlySalesEstimate, raw.salesEvidence, raw.boughtPastMonth].map(parseSales).find((s) => s.value > 0) ?? { value: 0, range: "" };
  row.monthlySales = sales.value;
  if (!row.monthlySalesRange) row.monthlySalesRange = sales.range;
  if (row.launchDays >= 9999) row.launchDays = 0;
  if (!row.launchDays && row.dateFirstAvailable) row.launchDays = daysSince(row.dateFirstAvailable);
  if (row.bsr >= 99999) row.bsr = 0;
  if (!row.packageGrossKg && row.weight > 0) row.packageGrossKg = Math.round((row.weight / 2.205) * 100) / 100;
  if (!row.packageDimensionsCm) row.packageDimensionsCm = text(raw.packageDimensions);
  if (!row.sourceUrl) row.sourceUrl = text(raw.amazonUrl) || `https://www.amazon.com/dp/${asin}`;
  if (!row.titleZh || /待自动翻译|待补充中文标题/.test(row.titleZh)) row.titleZh = titleZhMap[asin] ?? "";
  if (!["低", "中", "高"].includes(row.returnRisk)) row.returnRisk = row.packageGrossKg > 49 ? "高" : row.packageGrossKg > 22 ? "中" : "低";
  if (!row.complexity) row.complexity = 3;
  if (!row.differentiation) row.differentiation = 3;
  if (raw.estimatedMargin !== undefined) {
    const m = num(raw.estimatedMargin);
    row.estimatedMargin = m > 0 && m <= 1 ? m * 100 : m;
  }
  if (!row.importedAt) row.importedAt = defaults.importedAt ?? new Date().toISOString();
  if (!row.updatedAt) row.updatedAt = new Date().toISOString();

  const extra = {};
  for (const [key, value] of Object.entries(raw)) {
    if (KNOWN.has(key) || value === undefined || value === null || value === "") continue;
    if (["monthlySalesEstimate", "packageDimensions", "amazonUrl", "boughtPastMonth", "grade", "track", "dataStatus", "dataPendingReasons", "potential", "potentialReasons", "rejectionReason", "movedToTrashAt"].includes(key)) {
      if (key === "rejectionReason" || key === "grade" || key === "boughtPastMonth") extra[key] = value;
      continue;
    }
    extra[key] = value;
  }
  if (raw.extra && typeof raw.extra === "object") Object.assign(extra, raw.extra);
  row.extra = JSON.stringify(extra);
  return row;
}

export function createStore(dbPath) {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  // 老库无痛升级：SCHEMA 只对新建库生效，缺的列在这里补
  const ensureColumn = (table, column, ddl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  };
  ensureColumn("products", "tier", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("products", "discoveryState", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("products", "autoBrain", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("feedback_events", "reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("feedback_events", "prev", "TEXT NOT NULL DEFAULT ''");

  const kvGet = (key, fallback = null) => {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallback;
    }
  };
  const kvSet = (key, value) => db.prepare("INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));

  const getRules = () => normalizeRules(kvGet("rules", null));
  const setRules = (rules) => kvSet("rules", normalizeRules(rules));

  // 一次性迁移：interest 的旧语义（决定第二大脑成员）升级为 tier 手动钉住，之后 interest 只是"感兴趣"标记
  if (!kvGet("tierMigrated")) {
    db.exec("UPDATE products SET tier = 'pool' WHERE tier = '' AND interest = 'not_interested'");
    db.exec("UPDATE products SET tier = 'brain' WHERE tier = '' AND interest = 'interested'");
    kvSet("tierMigrated", { at: new Date().toISOString() });
  }

  // 一次性迁移：历史事件权重按当前 EVENT_WEIGHTS 归一（2026-09-18 收藏降权、👎 不再产生锚点）
  if (!kvGet("eventWeightsV2")) {
    const norm = db.prepare("UPDATE feedback_events SET weight = ? WHERE action = ?");
    for (const [action, w] of Object.entries(EVENT_WEIGHTS)) norm.run(w, action);
    kvSet("eventWeightsV2", { at: new Date().toISOString() });
  }
  // 一次性迁移：已收藏的产品钉入第二大脑（收藏 = 你亲手标记的精选，之后收藏弱票只影响泛化）
  if (!kvGet("favoritesPinned")) {
    db.exec("UPDATE products SET tier = 'brain' WHERE tier = '' AND asin IN (SELECT asin FROM favorites)");
    kvSet("favoritesPinned", { at: new Date().toISOString() });
  }

  const upsertSql = `INSERT INTO products (asin, ${[...TEXT_FIELDS, ...NUMBER_FIELDS].join(", ")}, extra)
    VALUES (@asin, ${[...TEXT_FIELDS, ...NUMBER_FIELDS].map((f) => `@${f}`).join(", ")}, @extra)
    ON CONFLICT(asin) DO UPDATE SET
      ${TEXT_FIELDS.filter((f) => f !== "importedAt").map((f) => `${f} = CASE WHEN excluded.${f} != '' THEN excluded.${f} ELSE products.${f} END`).join(",\n      ")},
      ${NUMBER_FIELDS.map((f) => `${f} = CASE WHEN excluded.${f} != 0 THEN excluded.${f} ELSE products.${f} END`).join(",\n      ")},
      extra = excluded.extra,
      updatedAt = excluded.updatedAt`;
  const upsertStmt = db.prepare(upsertSql);
  const existsStmt = db.prepare("SELECT 1 FROM products WHERE asin = ?");

  function upsertProducts(list, defaults = {}) {
    let inserted = 0;
    let updated = 0;
    db.exec("BEGIN");
    try {
      for (const raw of list) {
        const row = normalizeProduct(raw, defaults);
        if (!row || !row.title) continue;
        if (existsStmt.get(row.asin)) updated++;
        else inserted++;
        upsertStmt.run(row);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { inserted, updated };
  }

  function replaceAllProducts(list, defaults = {}) {
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM products");
      db.exec("DELETE FROM overrides");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return upsertProducts(list, defaults);
  }

  function seedIfEmpty() {
    const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
    if (count > 0 || kvGet("seeded")) return { seeded: false, count };
    const sources = [join(here, "data", "seed", "real-products.json"), join(here, "data", "seed", "rejected-products.json")];
    const merged = new Map();
    for (const file of sources) {
      if (!existsSync(file)) continue;
      try {
        for (const item of JSON.parse(readFileSync(file, "utf8"))) {
          if (!item?.asin) continue;
          if (!merged.has(item.asin)) merged.set(item.asin, item);
        }
      } catch {
        // 单个文件损坏不阻断播种
      }
    }
    const result = upsertProducts([...merged.values()], { importedAt: "2026-07-15T00:00:00+08:00" });
    kvSet("seeded", { at: new Date().toISOString(), ...result, files: sources.filter((f) => existsSync(f)).map((f) => f.replace(projectRoot, "")) });
    if (!kvGet("rules")) setRules(defaultRules());
    return { seeded: true, ...result };
  }

  const overridesMap = () => new Map(db.prepare("SELECT asin, action, reason FROM overrides").all().map((r) => [r.asin, r]));

  const updateDerived = db.prepare(`UPDATE products SET
      placement = @placement, autoPlacement = @autoPlacement, autoReason = @autoReason, removeGroup = @removeGroup,
      removeReason = @removeReason, removeRuleId = @removeRuleId, convertible = @convertible, tagsCsv = @tagsCsv,
      materialGroup = @materialGroup, baseScore = @baseScore, prefScore = @prefScore, finalScore = @finalScore,
      marginEst = @marginEst, attrs = @attrs, assessJson = @assessJson, reasonsJson = @reasonsJson, notesJson = @notesJson,
      autoBrain = @autoBrain
    WHERE asin = @asin`);

  // 全量重算派生字段：规则归位 → 属性提取 → 偏好画像 → 推荐分与理由
  function recomputeAll() {
    const started = Date.now();
    const rules = compileRules(getRules());
    const overrides = overridesMap();
    const products = db.prepare("SELECT * FROM products").all();
    const events = db.prepare("SELECT asin, action, weight, created_at FROM feedback_events").all();

    const staged = [];
    const attrsByAsin = new Map();
    // 移除原因（overrides）决定负向锚点的泛化通道；拥挤度（同 leaf 类目款数）供同质化通道使用
    const reasonByAsin = new Map();
    for (const [asin, o] of overrides) if (o.action === "exclude" && o.reason) reasonByAsin.set(asin, o.reason);
    const leafOf = (c) => String(c).split(/[/:>›»|]/).map((s) => s.trim()).filter(Boolean).at(-1) ?? "";
    const crowdMap = new Map();
    for (const p of products) {
      if (p.placement !== "pass" || p.discoveryState === "new") continue;
      const leaf = leafOf(p.category);
      crowdMap.set(leaf, (crowdMap.get(leaf) ?? 0) + 1);
    }
    const vectors = loadVisualVectors();
    for (const p of products) {
      // 发现箱待审的产品不参与规则归位与偏好学习，保持 inert，收进来后才进正式流程
      if (p.discoveryState === "new") continue;
      const assessment = assess(p);
      const placement = placeProduct(p, rules, overrides.get(p.asin), assessment);
      const attrs = extractAttrs(p, placement.materialGroup);
      attrs.crowd = crowdMap.get(attrs.category) ?? 0;
      attrsByAsin.set(p.asin, attrs);
      staged.push({ p, assessment, placement, attrs });
    }
    const profile = buildProfile(events, attrsByAsin, Date.now(), reasonByAsin);
    for (const seed of [...profile.positives, ...profile.negatives]) seed.vec = vectors.get(seed.asin) ?? null;
    const unconventionalPenalty = Number(getRules().flags.unconventionalMaterial.scorePenalty) || 0;

    // 第一遍：先算出每款的偏好分与推荐分
    for (const s of staged) {
      const { prefScore, contributions } = scorePreference(s.attrs, profile, vectors.get(s.p.asin) ?? null);
      let baseScore = s.assessment.score;
      if (s.placement.tags.includes(getRules().flags.unconventionalMaterial.label)) baseScore = Math.max(0, baseScore - unconventionalPenalty);
      s.baseScore = baseScore;
      s.prefScore = prefScore;
      s.contributions = contributions;
      s.finalScore = finalScoreFor(baseScore, prefScore, profile.strength);
    }

    // 第二遍：类目优中选优——每个类目（leaf）按推荐分取前 20%（至少 1 款）标记 autoBrain，
    // 与锚点直通（prefScore ≥40）共同构成第二大脑的"模型挑选"部分。
    // 你以「类目不做」移除过的类目不再享受保底代表（2026-09-21 定稿）：
    // 否决的是整个类目的"优中选优"，但锚点直通与手动钉住不受影响——真喜欢永远赢过类目否决。
    const vetoedCats = new Set(
      profile.negatives.filter((s) => s.channel === "category").map((s) => s.attrs.category).filter(Boolean),
    );
    const byCat = new Map();
    for (const s of staged) {
      if (s.p.placement !== "pass") continue;
      const cat = s.attrs.category;
      if (vetoedCats.has(cat)) continue;
      (byCat.get(cat) ?? byCat.set(cat, []).get(cat)).push(s.finalScore);
    }
    const brainLine = new Map();
    for (const [cat, scores] of byCat) {
      scores.sort((a, b) => b - a);
      const keep = Math.max(1, Math.round(scores.length * BRAIN_CATEGORY_TOP));
      brainLine.set(cat, scores[keep - 1]);
    }

    db.exec("BEGIN");
    try {
      for (const s of staged) {
        const autoBrain = s.p.placement === "pass" && (s.prefScore >= BRAIN_AUTO_THRESHOLD || s.finalScore >= (brainLine.get(s.attrs.category) ?? Infinity) - 1e-9) ? 1 : 0;
        updateDerived.run({
          asin: s.p.asin,
          placement: s.placement.placement,
          autoPlacement: s.placement.autoPlacement,
          autoReason: s.placement.autoReason,
          removeGroup: s.placement.removeGroup,
          removeReason: s.placement.removeReason,
          removeRuleId: s.placement.removeRuleId ?? "",
          convertible: s.placement.convertible,
          tagsCsv: `,${s.placement.tags.join(",")},`,
          materialGroup: s.placement.materialGroup,
          autoBrain,
          baseScore: s.baseScore,
          prefScore: Math.round(s.prefScore * 10) / 10,
          finalScore: s.finalScore,
          marginEst: s.assessment.estimatedMargin,
          attrs: JSON.stringify(s.attrs),
          assessJson: JSON.stringify({
            companyFit: s.assessment.companyFit,
            demand: s.assessment.demand,
            hiddenOpportunity: s.assessment.hiddenOpportunity,
            estimatedMargin: s.assessment.estimatedMargin,
            marginConfidence: s.assessment.marginConfidence,
            freightTriggers: s.assessment.freightTriggers,
            dataMissing: s.assessment.dataMissing,
            hiddenSignals: s.assessment.hiddenSignals,
            trendElements: s.assessment.trendElements,
            fitReasons: s.assessment.fitReasons,
            priorReasons: s.assessment.priorReasons,
          }),
          reasonsJson: JSON.stringify(reasonsFor(s.contributions, s.assessment, s.placement)),
          notesJson: JSON.stringify(s.placement.notes),
        });
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    kvSet("profile", profileSummary(profile));
    kvSet("lastRecompute", { at: new Date().toISOString(), ms: Date.now() - started, products: products.length, events: events.length });
    return { products: products.length, events: events.length, ms: Date.now() - started };
  }

  // ---------- 反馈 / 收藏 / 覆盖 ----------
  const now = () => new Date().toISOString();
  const addEvent = (asin, action, source = "user", createdAt = now(), weight = EVENT_WEIGHTS[action] ?? 0, reason = "", prev = null) =>
    db.prepare("INSERT INTO feedback_events (asin, action, weight, reason, prev, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(asin, action, weight, reason, prev ? JSON.stringify(prev) : "", source, createdAt);

  function setFavorite(asins, on) {
    const insert = db.prepare("INSERT OR IGNORE INTO favorites (asin, created_at) VALUES (?, ?)");
    const remove = db.prepare("DELETE FROM favorites WHERE asin = ?");
    const isFav = db.prepare("SELECT 1 FROM favorites WHERE asin = ?");
    const pinBrain = db.prepare("UPDATE products SET tier = 'brain' WHERE asin = ?");
    db.exec("BEGIN");
    try {
      for (const asin of asins) {
        const was = Boolean(isFav.get(asin));
        if (on && !was) {
          insert.run(asin, now());
          addEvent(asin, "favorite");
          // 收藏即钉入第二大脑：产品本身一定留在你的精选层；它对相似款的泛化影响按弱票（权重 1）计算
          pinBrain.run(asin);
        } else if (!on && was) {
          remove.run(asin);
          addEvent(asin, "unfavorite");
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function setOverride(asins, action, reason = "") {
    db.exec("BEGIN");
    try {
      for (const asin of asins) {
        if (action === "clear") {
          db.prepare("DELETE FROM overrides WHERE asin = ?").run(asin);
        } else {
          db.prepare("INSERT INTO overrides (asin, action, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(asin) DO UPDATE SET action = excluded.action, reason = excluded.reason, created_at = excluded.created_at").run(asin, action, reason, now());
          addEvent(asin, action);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function setInterest(asin, action) {
    const value = action === "clear" ? "" : action;
    db.prepare("UPDATE products SET interest = ? WHERE asin = ?").run(value, asin);
    if (action !== "clear") addEvent(asin, action);
  }

  // ---------- 三层池移动：手动移动产品 = 学习信号 ----------
  const brainMember = (p) => p.tier === "brain" || (p.tier === "" && (p.prefScore >= BRAIN_AUTO_THRESHOLD || p.autoBrain === 1));
  const getOverrideRow = db.prepare("SELECT action, reason, created_at FROM overrides WHERE asin = ?");
  const upsertOverride = db.prepare("INSERT INTO overrides (asin, action, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(asin) DO UPDATE SET action = excluded.action, reason = excluded.reason, created_at = excluded.created_at");
  const setTierStmt = db.prepare("UPDATE products SET tier = ? WHERE asin = ?");

  // 把产品移动到 brain / pool / library，或 auto（恢复自动判定）。
  // 每次有效移动写一条带权重的事件（学习信号），并保存移动前快照供撤销。
  function moveProducts(asins, to, reason = "") {
    const at = now();
    const moves = [];
    db.exec("BEGIN");
    try {
      for (const asin of asins) {
        const p = db.prepare("SELECT tier, interest, placement, prefScore, autoBrain FROM products WHERE asin = ?").get(asin);
        if (!p) continue;
        const prev = { tier: p.tier, interest: p.interest, override: getOverrideRow.get(asin) ?? null };
        let eventId = 0;
        // 被硬性条件筛掉的产品要往上层移动，先钉住「手动捞回」让它过硬性条件这条线
        const pinRescue = () => upsertOverride.run(asin, "rescue", reason, at);
        const inBrain = p.placement === "pass" && brainMember(p);
        if (to === "library") {
          upsertOverride.run(asin, "exclude", reason, at);
          eventId = addEvent(asin, "exclude", "user", at, EVENT_WEIGHTS.exclude, reason, prev).lastInsertRowid;
        } else if (to === "pool") {
          if (p.placement === "removed") {
            pinRescue();
            eventId = addEvent(asin, "rescue", "user", at, EVENT_WEIGHTS.rescue, reason, prev).lastInsertRowid;
          } else if (inBrain) {
            eventId = addEvent(asin, "not_interested", "user", at, EVENT_WEIGHTS.not_interested, reason, prev).lastInsertRowid;
          }
          setTierStmt.run("pool", asin);
        } else if (to === "brain") {
          if (p.placement === "removed") {
            pinRescue();
            eventId = addEvent(asin, "rescue", "user", at, EVENT_WEIGHTS.rescue, reason, prev).lastInsertRowid;
          } else if (!inBrain) {
            eventId = addEvent(asin, "interested", "user", at, EVENT_WEIGHTS.interested, reason, prev).lastInsertRowid;
          }
          setTierStmt.run("brain", asin);
        } else if (to === "auto") {
          // 清掉手动钉住，交给规则 + 模型；记 0 权重事件：可撤销但不影响学习
          db.prepare("DELETE FROM overrides WHERE asin = ?").run(asin);
          setTierStmt.run("", asin);
          eventId = addEvent(asin, "auto_reset", "user", at, 0, reason, prev).lastInsertRowid;
        }
        moves.push({ asin, eventId: Number(eventId) || 0 });
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { moves };
  }

  // 撤销移动：删掉那次移动的学习事件，并精确还原移动前的 tier / interest / 覆盖
  function undoMoves(list) {
    const latestId = db.prepare("SELECT MAX(id) AS id FROM feedback_events WHERE asin = ? AND source = 'user'");
    const getEvent = db.prepare("SELECT * FROM feedback_events WHERE id = ? AND asin = ?");
    let undone = 0;
    db.exec("BEGIN");
    try {
      for (const item of list) {
        const asin = String(item?.asin ?? "").toUpperCase();
        const eventId = Number(item?.eventId);
        const event = eventId ? getEvent.get(eventId, asin) : null;
        if (!event || event.source !== "user") throw new Error("找不到可撤销的移动记录");
        if (latestId.get(asin).id !== eventId) throw new Error("这个产品之后还有更新的手动调整，请先撤销最新的一条");
        db.prepare("DELETE FROM feedback_events WHERE id = ?").run(eventId);
        // 撤销「不要」= 这事没发生过：产品放回发现箱重新等你过目
        if (event.action === "dismiss") db.prepare("UPDATE products SET discoveryState = 'new' WHERE asin = ?").run(asin);
        const prev = event.prev ? JSON.parse(event.prev) : null;
        if (prev) {
          db.prepare("UPDATE products SET tier = ?, interest = ? WHERE asin = ?").run(prev.tier ?? "", prev.interest ?? "", asin);
          if (prev.override) upsertOverride.run(asin, prev.override.action, prev.override.reason ?? "", prev.override.created_at ?? now());
          else db.prepare("DELETE FROM overrides WHERE asin = ?").run(asin);
        }
        undone++;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { undone };
  }

  // 手动调整历史（错题本）：user 事件倒序，每个产品只有最新一条可撤销
  function listMoves(limit = 200) {
    const rows = db.prepare(`SELECT e.id AS eventId, e.asin, e.action, e.reason, e.weight, e.prev, e.created_at AS createdAt,
        p.title, p.titleZh, p.category, p.imageUrl
      FROM feedback_events e LEFT JOIN products p ON p.asin = e.asin
      WHERE e.source = 'user' ORDER BY e.id DESC LIMIT ?`).all(Math.min(1000, Math.max(1, limit)));
    const latestByAsin = new Map();
    for (const r of rows) if (!latestByAsin.has(r.asin)) latestByAsin.set(r.asin, r.eventId);
    return rows.map((r) => ({
      ...r,
      prev: r.prev ? JSON.parse(r.prev) : null,
      canUndo: latestByAsin.get(r.asin) === r.eventId && Boolean(r.prev),
    }));
  }

  // 给没带原因的移动补记原因（事件与 exclude 覆盖同步更新）
  function setMoveReason(asin, eventId, reason) {
    const event = db.prepare("SELECT id FROM feedback_events WHERE id = ? AND asin = ? AND source = 'user'").get(Number(eventId), asin);
    if (!event) throw new Error("找不到这条移动记录");
    db.prepare("UPDATE feedback_events SET reason = ? WHERE id = ?").run(reason, event.id);
    db.prepare("UPDATE overrides SET reason = ? WHERE asin = ? AND action = 'exclude'").run(reason, asin);
  }

  // ---------- 查询 ----------
  const SORTABLE = {
    finalScore: "finalScore", baseScore: "baseScore", prefScore: "prefScore", price: "price", monthlySales: "monthlySales",
    salesGrowth: "salesGrowth", rating: "rating", reviews: "reviews", bsr: "bsr", packageGrossKg: "packageGrossKg",
    launchDays: "launchDays", marginEst: "marginEst", importedAt: "importedAt", title: "title", titleZh: "titleZh",
    complexity: "complexity", differentiation: "differentiation", category: "category",
  };

  function buildWhere(q) {
    const where = [];
    const params = {};
    const space = String(q.space ?? "1");
    if (space === "discovery") where.push("p.discoveryState = 'new'");
    else where.push(SPACES_DISCOVERY);
    if (space === "2") where.push(POOL_WHERE);
    else if (space === "removed") where.push("p.placement = 'removed'");
    else if (space === "3") where.push(BRAIN_WHERE);
    else if (space === "favorites") where.push("p.asin IN (SELECT asin FROM favorites)");

    if (q.q) {
      params.q = `%${String(q.q).trim()}%`;
      where.push("(p.title LIKE @q OR p.titleZh LIKE @q OR p.asin LIKE @q OR p.category LIKE @q OR p.brand LIKE @q)");
    }
    const list = (value) => (Array.isArray(value) ? value : String(value ?? "").split(",")).map((s) => s.trim()).filter(Boolean);
    const categories = list(q.category);
    if (categories.length) {
      where.push(`(${categories.map((_, i) => `p.category = @cat${i}`).join(" OR ")})`);
      categories.forEach((c, i) => (params[`cat${i}`] = c));
    }
    const groups = list(q.materialGroup);
    if (groups.length) {
      where.push(`p.materialGroup IN (${groups.map((_, i) => `@mg${i}`).join(",")})`);
      groups.forEach((g, i) => (params[`mg${i}`] = g));
    }
    const removeGroups = list(q.removeGroup);
    if (removeGroups.length) {
      where.push(`p.removeGroup IN (${removeGroups.map((_, i) => `@rg${i}`).join(",")})`);
      removeGroups.forEach((g, i) => (params[`rg${i}`] = g));
    }
    if (q.ruleId) {
      params.ruleId = String(q.ruleId);
      where.push("p.removeRuleId = @ruleId");
    }
    // 适配池 / 第二大脑里区分"我手动钉住的"和"模型自动分的"
    if (q.tierPin === "pinned") where.push("p.tier != ''");
    else if (q.tierPin === "auto") where.push("p.tier = ''");
    const tags = list(q.tags);
    tags.forEach((t, i) => {
      params[`tag${i}`] = `%,${t},%`;
      where.push(`p.tagsCsv LIKE @tag${i}`);
    });
    const excludeTags = list(q.excludeTags);
    excludeTags.forEach((t, i) => {
      params[`xtag${i}`] = `%,${t},%`;
      where.push(`p.tagsCsv NOT LIKE @xtag${i}`);
    });
    const ranges = [
      ["price", "priceMin", "priceMax"], ["monthlySales", "salesMin", "salesMax"], ["salesGrowth", "growthMin", "growthMax"],
      ["rating", "ratingMin", "ratingMax"], ["reviews", "reviewsMin", "reviewsMax"], ["packageGrossKg", "weightMin", "weightMax"],
      ["launchDays", "launchMin", "launchMax"], ["bsr", "bsrMin", "bsrMax"], ["marginEst", "marginMin", "marginMax"],
      ["finalScore", "scoreMin", "scoreMax"],
    ];
    for (const [column, minKey, maxKey] of ranges) {
      if (q[minKey] !== undefined && q[minKey] !== "" && Number.isFinite(Number(q[minKey]))) {
        params[minKey] = Number(q[minKey]);
        where.push(`p.${column} >= @${minKey}`);
      }
      if (q[maxKey] !== undefined && q[maxKey] !== "" && Number.isFinite(Number(q[maxKey]))) {
        params[maxKey] = Number(q[maxKey]);
        where.push(`p.${column} <= @${maxKey}`);
      }
    }
    if (q.dataStatus === "complete") where.push("p.tagsCsv NOT LIKE '%,数据待补,%'");
    if (q.dataStatus === "pending") where.push("p.tagsCsv LIKE '%,数据待补,%'");
    if (q.interest) {
      params.interest = String(q.interest);
      where.push("p.interest = @interest");
    }
    if (q.favoritesOnly) where.push("p.asin IN (SELECT asin FROM favorites)");
    if (q.asins) {
      const asins = list(q.asins);
      if (asins.length) {
        where.push(`p.asin IN (${asins.map((_, i) => `@asin${i}`).join(",")})`);
        asins.forEach((a, i) => (params[`asin${i}`] = a));
      }
    }
    return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params, space };
  }

  function orderBy(q, space) {
    const dir = (d, fallback) => (String(d ?? fallback).toLowerCase() === "asc" ? "ASC" : "DESC");
    const defaultSort = space === "3" ? "finalScore" : space === "1" ? "importedAt" : "baseScore";
    const primary = SORTABLE[q.sort] ?? defaultSort;
    const parts = [`p.${primary} ${dir(q.dir, "desc")}`];
    if (q.sort2 && SORTABLE[q.sort2] && SORTABLE[q.sort2] !== primary) parts.push(`p.${SORTABLE[q.sort2]} ${dir(q.dir2, "desc")}`);
    if (primary !== "finalScore") parts.push("p.finalScore DESC");
    parts.push("p.asin ASC");
    return `ORDER BY ${parts.join(", ")}`;
  }

  function hydrate(row) {
    if (!row) return null;
    const out = { ...row };
    out.tags = row.tagsCsv.split(",").filter(Boolean);
    out.reasons = JSON.parse(row.reasonsJson || "[]");
    out.notes = JSON.parse(row.notesJson || "[]");
    out.assessment = JSON.parse(row.assessJson || "{}");
    out.attrs = JSON.parse(row.attrs || "{}");
    out.extra = JSON.parse(row.extra || "{}");
    out.favorite = Boolean(row.favorite);
    out.override = row.overrideAction ? { action: row.overrideAction, reason: row.overrideReason } : null;
    delete out.tagsCsv;
    delete out.reasonsJson;
    delete out.notesJson;
    delete out.assessJson;
    delete out.overrideAction;
    delete out.overrideReason;
    return out;
  }

  const SELECT = `SELECT p.*, (SELECT 1 FROM favorites f WHERE f.asin = p.asin) AS favorite,
    o.action AS overrideAction, o.reason AS overrideReason
    FROM products p LEFT JOIN overrides o ON o.asin = p.asin`;

  function listProducts(q = {}) {
    const { sql, params, space } = buildWhere(q);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 60));
    const page = Math.max(1, Number(q.page) || 1);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM products p ${sql}`).get(params).n;
    const rows = db.prepare(`${SELECT} ${sql} ${orderBy(q, space)} LIMIT @limit OFFSET @offset`).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });
    return { total, page, pageSize, rows: rows.map(hydrate) };
  }

  function allProducts(q = {}) {
    const { sql, params, space } = buildWhere(q);
    return db.prepare(`${SELECT} ${sql} ${orderBy(q, space)}`).all(params).map(hydrate);
  }

  const getProduct = (asin) => hydrate(db.prepare(`${SELECT} WHERE p.asin = ?`).get(asin));

  function updateProductFields(asin, fields) {
    const sets = [];
    const params = { asin };
    for (const [key, value] of Object.entries(fields)) {
      if (TEXT_FIELDS.includes(key)) {
        sets.push(`${key} = @${key}`);
        params[key] = text(value);
      } else if (NUMBER_FIELDS.includes(key)) {
        sets.push(`${key} = @${key}`);
        params[key] = num(value);
      }
    }
    if (!sets.length) return false;
    sets.push("updatedAt = @updatedAt");
    params.updatedAt = now();
    db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE asin = @asin`).run(params);
    return true;
  }

  function deleteProducts(asins) {
    db.exec("BEGIN");
    try {
      const stmt = db.prepare("DELETE FROM products WHERE asin = ?");
      for (const asin of asins) stmt.run(asin);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  // 当前第二大脑成员集合（含预测）：用于移动后做成员差异对比
  function brainAsins() {
    return new Set(db.prepare(`SELECT asin FROM products p WHERE ${BRAIN_WHERE}`).all().map((r) => r.asin));
  }

  function counts() {
    const one = (sql) => db.prepare(sql).get().n;
    return {
      space1: one(`SELECT COUNT(*) AS n FROM products WHERE ${SPACES_DISCOVERY.replace(/p\./g, "")}`),
      space2: one(`SELECT COUNT(*) AS n FROM products p WHERE ${POOL_WHERE}`),
      removed: one(`SELECT COUNT(*) AS n FROM products WHERE placement = 'removed' AND ${SPACES_DISCOVERY.replace(/p\./g, "")}`),
      space3: one(`SELECT COUNT(*) AS n FROM products p WHERE ${BRAIN_WHERE}`),
      favorites: one("SELECT COUNT(*) AS n FROM favorites"),
      discovery: one("SELECT COUNT(*) AS n FROM products WHERE discoveryState = 'new'"),
      poolPinned: one("SELECT COUNT(*) AS n FROM products WHERE placement = 'pass' AND tier = 'pool'"),
      poolAuto: one(`SELECT COUNT(*) AS n FROM products p WHERE placement = 'pass' AND tier = '' AND p.prefScore < ${BRAIN_AUTO_THRESHOLD} AND p.autoBrain = 0`),
      events: one("SELECT COUNT(*) AS n FROM feedback_events"),
    };
  }

  function facets(space = "1") {
    const { sql, params } = buildWhere({ space });
    const group = (column) => db.prepare(`SELECT ${column} AS value, COUNT(*) AS n FROM products p ${sql} GROUP BY ${column} ORDER BY n DESC`).all(params).filter((r) => r.value);
    const tagRows = db.prepare(`SELECT tagsCsv FROM products p ${sql}`).all(params);
    const tagCounts = {};
    for (const r of tagRows) for (const t of r.tagsCsv.split(",").filter(Boolean)) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    return {
      categories: group("category").slice(0, 200),
      materialGroups: group("materialGroup"),
      removeGroups: group("removeGroup"),
      tags: Object.entries(tagCounts).map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n),
    };
  }

  // 每条规则的自动清除数与人工捞回数，用于提示“误判较多”的规则
  function ruleStats() {
    const rows = db.prepare(`SELECT p.removeRuleId AS ruleId, p.autoReason AS reason, COUNT(*) AS removed,
        SUM(CASE WHEN o.action = 'rescue' THEN 1 ELSE 0 END) AS rescued
      FROM products p LEFT JOIN overrides o ON o.asin = p.asin
      WHERE p.autoPlacement = 'removed' AND p.removeRuleId != ''
      GROUP BY p.removeRuleId ORDER BY removed DESC`).all();
    return rows;
  }

  // ---------- 发现箱：收进来进正式流程（规则重新归位），不要了就永久静默（已存在的 ASIN 不会再被抓进来） ----------
  function promoteDiscoveries(asins) {
    const stmt = db.prepare("UPDATE products SET discoveryState = 'kept' WHERE asin = ? AND discoveryState = 'new'");
    let promoted = 0;
    db.exec("BEGIN");
    try {
      for (const asin of asins) promoted += stmt.run(asin).changes;
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { promoted };
  }

  function dismissDiscoveries(asins) {
    const stmt = db.prepare("UPDATE products SET discoveryState = 'dismissed' WHERE asin = ? AND discoveryState = 'new'");
    let dismissed = 0;
    const at = now();
    db.exec("BEGIN");
    try {
      for (const asin of asins) {
        if (!stmt.run(asin).changes) continue;
        dismissed++;
        // 「不要」也是你的实时判断（看过主图和价格）：记一条弱负票供偏好引擎参考，可在错题本撤销
        const p = db.prepare("SELECT tier, interest FROM products WHERE asin = ?").get(asin);
        const prev = { tier: p?.tier ?? "", interest: p?.interest ?? "", override: getOverrideRow.get(asin) ?? null };
        addEvent(asin, "dismiss", "user", at, EVENT_WEIGHTS.dismiss, "", prev);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { dismissed };
  }

  function listDiscoveryRows() {
    return db.prepare("SELECT * FROM products WHERE discoveryState = 'new' ORDER BY finalScore DESC, asin ASC").all().map(hydrate);
  }

  function backup() {
    return {
      version: 2,
      exportedAt: now(),
      products: db.prepare(`SELECT asin, ${[...TEXT_FIELDS, ...NUMBER_FIELDS].join(", ")}, extra, interest, tier, discoveryState FROM products`).all(),
      favorites: db.prepare("SELECT * FROM favorites").all(),
      overrides: db.prepare("SELECT * FROM overrides").all(),
      feedback_events: db.prepare("SELECT * FROM feedback_events").all(),
      rules: getRules(),
    };
  }

  function restore(data, mode = "replace") {
    db.exec("BEGIN");
    try {
      if (mode === "replace") {
        db.exec("DELETE FROM products; DELETE FROM favorites; DELETE FROM overrides; DELETE FROM feedback_events;");
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const products = Array.isArray(data.products) ? data.products : [];
    const result = upsertProducts(products.map((p) => ({ ...p, extra: typeof p.extra === "string" ? JSON.parse(p.extra || "{}") : p.extra })));
    db.exec("BEGIN");
    try {
      for (const p of products) if (p.interest || p.tier || p.discoveryState) db.prepare("UPDATE products SET interest = ?, tier = ?, discoveryState = ? WHERE asin = ?").run(p.interest ?? "", p.tier ?? "", p.discoveryState ?? "", p.asin);
      for (const f of data.favorites ?? []) db.prepare("INSERT OR IGNORE INTO favorites (asin, created_at) VALUES (?, ?)").run(f.asin, f.created_at ?? now());
      for (const o of data.overrides ?? []) db.prepare("INSERT OR REPLACE INTO overrides (asin, action, reason, created_at) VALUES (?, ?, ?, ?)").run(o.asin, o.action, o.reason ?? "", o.created_at ?? now());
      for (const e of data.feedback_events ?? []) db.prepare("INSERT INTO feedback_events (asin, action, weight, reason, prev, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(e.asin, e.action, e.weight, e.reason ?? "", e.prev ?? "", e.source ?? "restore", e.created_at ?? now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (data.rules) setRules(data.rules);
    return result;
  }

  // 旧版浏览器 localStorage 数据迁移：产品/垃圾箱/收藏/两套校准反馈
  function migrateLegacy(payload) {
    const products = [...(payload.products ?? []), ...(payload.trash ?? [])];
    const result = upsertProducts(products);
    const favorites = (payload.favorites ?? []).filter(Boolean);
    let favoritesAdded = 0;
    let calibrationEvents = 0;
    db.exec("BEGIN");
    try {
      for (const asin of favorites) {
        const changes = db.prepare("INSERT OR IGNORE INTO favorites (asin, created_at) VALUES (?, ?)").run(asin, now()).changes;
        if (changes) {
          favoritesAdded++;
          addEvent(asin, "favorite", "migration");
        }
      }
      const feedback = payload.calibration?.feedback ?? {};
      for (const item of Object.values(feedback)) {
        if (!item?.asin) continue;
        const at = item.updatedAt || "2026-07-15T00:00:00+08:00";
        if (item.verdict === "develop") {
          addEvent(item.asin, "cal_develop", "calibration", at);
          if (item.interest === "priority") addEvent(item.asin, "cal_priority", "calibration", at);
          if (item.interest === "low") addEvent(item.asin, "cal_low", "calibration", at);
        } else if (item.verdict === "reject") addEvent(item.asin, "cal_reject", "calibration", at);
        else if (item.verdict === "uncertain") addEvent(item.asin, "cal_uncertain", "calibration", at);
        calibrationEvents++;
      }
      const research = payload.batchCalibration?.research ?? {};
      for (const [asin, item] of Object.entries(research)) {
        const at = item?.updatedAt || "2026-07-15T00:00:00+08:00";
        if (item?.decision === "research") addEvent(asin, "pref_research", "calibration", at);
        else if (item?.decision === "hold") addEvent(asin, "pref_secondary", "calibration", at);
        else if (item?.decision === "pass") addEvent(asin, "pref_pass", "calibration", at);
        calibrationEvents++;
      }
      const challenges = payload.batchCalibration?.challenges ?? {};
      for (const item of Object.values(challenges)) {
        const at = item?.updatedAt || "2026-07-15T00:00:00+08:00";
        if (item?.decision === "challenger" || item?.decision === "both") addEvent(item.challengerAsin, "pref_secondary", "calibration", at);
        if (item?.decision === "anchor" || item?.decision === "both") addEvent(item.anchorAsin, "pref_secondary", "calibration", at);
        if (item?.decision === "neither") {
          addEvent(item.challengerAsin, "cal_uncertain", "calibration", at);
          addEvent(item.anchorAsin, "cal_uncertain", "calibration", at);
        }
        calibrationEvents++;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    kvSet("migratedAt", now());
    return { ...result, favoritesAdded, calibrationEvents };
  }

  // 用旧代码里写死的校准样本作为初始偏好信号（只执行一次）
  function seedCalibrationPriors(samples) {
    if (kvGet("calibrationPriorsSeeded")) return 0;
    let n = 0;
    db.exec("BEGIN");
    try {
      for (const s of samples) {
        if (!existsStmt.get(s.asin)) continue;
        addEvent(s.asin, s.action, "calibration", s.at ?? "2026-07-15T00:00:00+08:00");
        n++;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    kvSet("calibrationPriorsSeeded", { at: now(), n });
    return n;
  }

  function resetPreference(scope = "all") {
    if (scope === "keep-calibration") db.exec("DELETE FROM feedback_events WHERE source != 'calibration'");
    else db.exec("DELETE FROM feedback_events");
    // 手动钉住的层级也是"我的偏好"的一部分，重置后回到白纸：全部交给规则 + 模型
    db.exec("UPDATE products SET interest = '', tier = ''");
  }

  function logImport(entry) {
    db.prepare("INSERT INTO imports (fileName, mode, rows, inserted, updated, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(entry.fileName, entry.mode, entry.rows, entry.inserted, entry.updated, entry.images, now());
  }

  // ---------- 视觉向量（本地 CLIP，见 vision.mjs）：锚点相似度的第三通道 ----------
  function setVisualVector(asin, vec, model = "clip-vit-base-patch32") {
    db.prepare(`INSERT INTO visual_vectors (asin, vec, dim, model, computed_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(asin) DO UPDATE SET vec = excluded.vec, dim = excluded.dim, model = excluded.model, computed_at = excluded.computed_at`)
      .run(asin, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength), vec.length, model, now());
  }

  function visualMissing(limit = 100) {
    return db.prepare(`SELECT p.asin, p.imageUrl FROM products p
      WHERE p.imageUrl != '' AND p.discoveryState != 'dismissed'
      AND p.asin NOT IN (SELECT asin FROM visual_vectors) LIMIT ?`).all(limit);
  }

  function loadVisualVectors() {
    const map = new Map();
    for (const r of db.prepare("SELECT asin, vec, dim FROM visual_vectors").all()) {
      // BLOB 以字节返回，必须按 Float32（小端）解码回 512 维向量，逐字节读会得到完全错误的值
      const bytes = r.vec.buffer.slice(r.vec.byteOffset, r.vec.byteOffset + r.dim * 4);
      map.set(r.asin, new Float32Array(bytes));
    }
    return map;
  }

  return {
    db,
    kvGet, kvSet, getRules, setRules,
    upsertProducts, replaceAllProducts, seedIfEmpty, recomputeAll,
    setFavorite, setOverride, setInterest, addEvent,
    moveProducts, undoMoves, listMoves, setMoveReason,
    promoteDiscoveries, dismissDiscoveries, listDiscoveryRows,
    listProducts, allProducts, getProduct, updateProductFields, deleteProducts,
    counts, facets, ruleStats, brainAsins, backup, restore, migrateLegacy, seedCalibrationPriors, resetPreference, logImport,
    setVisualVector, visualMissing, loadVisualVectors,
    close: () => db.close(),
  };
}
