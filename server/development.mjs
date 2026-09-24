import { randomUUID } from "node:crypto";
import { normalizeReasons, DECISIONS, REFERENCE_SCOPES } from "./development-reasons.mjs";

export const FACT_FIELDS = [
  "title", "imageUrl", "category", "material", "brand", "price", "monthlySales", "monthlySalesRange",
  "salesGrowth", "dateFirstAvailable", "launchDays", "rating", "reviews", "bsr", "packageGrossKg",
  "packageDimensionsCm", "dimensions", "sellingPoints", "painPoints", "itemWeightLb",
];
const NUMBER_FACTS = new Set(["price", "monthlySales", "salesGrowth", "launchDays", "rating", "reviews", "bsr", "packageGrossKg", "itemWeightLb"]);
const FACT_SET = new Set(FACT_FIELDS);
const isoNow = () => new Date().toISOString();

export function parseAmazonInput(input) {
  const raw = String(input ?? "").trim();
  let asin = raw.toUpperCase();
  if (raw.includes("/") || raw.includes(".")) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); }
    catch { throw new Error("不是有效的 Amazon URL 或 ASIN"); }
    if (!/^(?:www\.)?amazon\.com$/i.test(url.hostname)) throw new Error("只接受 Amazon 美国站 URL");
    asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase() ?? "";
  }
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("无法识别 10 位 ASIN");
  return { asin, sourceUrl: `https://www.amazon.com/dp/${asin}` };
}

export function normalizeFacts(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("产品事实格式无效");
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!FACT_SET.has(key)) throw new Error(`不支持的事实字段：${key}`);
    if (value === null || value === "") { result[key] = null; continue; }
    if (NUMBER_FACTS.has(key)) {
      const n = Number(value);
      if (!Number.isFinite(n) || (key !== "salesGrowth" && n < 0)) throw new Error(`${key} 必须是有效数字`);
      result[key] = n;
    } else {
      if (typeof value !== "string") throw new Error(`${key} 必须是文本`);
      result[key] = value.trim().slice(0, key === "sellingPoints" || key === "painPoints" ? 2000 : 500);
    }
  }
  if (!partial) for (const key of FACT_FIELDS) if (!(key in result)) result[key] = null;
  return result;
}

export function factsFromProduct(product) {
  const facts = {};
  for (const key of FACT_FIELDS) {
    const value = product[key];
    // 正式库以 0 表示缺数据；样本中明确记作未知。
    facts[key] = value === undefined || value === null || value === "" || (NUMBER_FACTS.has(key) && value === 0) ? null : value;
  }
  return normalizeFacts(facts);
}

export function factsFromDetail(detail) {
  const parsed = normalizeFacts({
    title: detail.title || null, imageUrl: detail.imageUrl || null, category: detail.category || null,
    brand: detail.brand || null, price: detail.price || null, rating: detail.rating || null,
    reviews: detail.reviews || null, bsr: detail.bsr || null,
    monthlySales: detail.boughtPastMonth ? Number(detail.boughtPastMonth) : null,
    monthlySalesRange: detail.boughtPastMonth ? `${detail.boughtPastMonth}+` : null,
    itemWeightLb: detail.weightLb || null, dimensions: detail.dimensions || null,
  }, { partial: true });
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== null));
}

const json = (value) => JSON.stringify(value);
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

export function createDevelopmentStore(store) {
  const db = store.db;
  const select = db.prepare("SELECT * FROM development_samples WHERE asin = ?");
  const latest = db.prepare("SELECT * FROM development_suggestions WHERE asin = ? ORDER BY created_at DESC, rowid DESC LIMIT 1");

  function hydrate(row, { includeHistory = false } = {}) {
    if (!row) return null;
    const suggestion = latest.get(row.asin);
    return {
      asin: row.asin, sourceUrl: row.source_url, facts: parse(row.facts_json, {}), factsSource: row.facts_source,
      factsObservedAt: row.facts_observed_at, factsVersion: row.facts_version,
      decision: row.decision, confirmedReasons: parse(row.confirmed_reasons_json, []),
      referenceScope: row.reference_scope, specificFeature: row.specific_feature, note: row.note,
      confirmedAt: row.confirmed_at || null, createdAt: row.created_at, updatedAt: row.updated_at,
      linkedProduct: Boolean(store.getProduct(row.asin)),
      suggestion: suggestion ? {
        id: suggestion.id, reasons: parse(suggestion.suggestions_json, []), unknowns: parse(suggestion.unknowns_json, []),
        provider: suggestion.provider, model: suggestion.model, createdAt: suggestion.created_at,
        stale: suggestion.facts_version !== row.facts_version,
      } : null,
      ...(includeHistory ? { revisions: revisions(row.asin) } : {}),
    };
  }

  function get(asin, options) { return hydrate(select.get(asin), options); }

  function create(inputs) {
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 100) throw new Error("每次请输入 1 到 100 条 URL 或 ASIN");
    const results = [];
    const insert = db.prepare(`INSERT OR IGNORE INTO development_samples
      (asin, source_url, facts_json, facts_source, facts_observed_at, facts_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`);
    db.exec("BEGIN");
    try {
      for (const input of inputs) {
        try {
          const { asin, sourceUrl } = parseAmazonInput(input);
          const existing = store.getProduct(asin);
          const at = isoNow();
          const facts = existing ? factsFromProduct(existing) : normalizeFacts({});
          const inserted = insert.run(asin, sourceUrl, json(facts), existing ? "product" : "pending", existing ? existing.observedAt || existing.updatedAt || at : "", at, at).changes > 0;
          results.push({ input, asin, inserted, linkedProduct: Boolean(existing) });
        } catch (error) { results.push({ input, error: error.message }); }
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return results;
  }

  function list({ decision = "", page = 1, pageSize = 40 } = {}) {
    if (decision && !DECISIONS.includes(decision)) throw new Error("决策筛选无效");
    const size = Math.min(100, Math.max(1, Number(pageSize) || 40));
    const current = Math.max(1, Number(page) || 1);
    const where = decision ? "WHERE decision = ?" : "";
    const args = decision ? [decision] : [];
    const total = db.prepare(`SELECT COUNT(*) AS n FROM development_samples ${where}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM development_samples ${where} ORDER BY updated_at DESC, asin ASC LIMIT ? OFFSET ?`).all(...args, size, (current - 1) * size);
    return { total, page: current, pageSize: size, rows: rows.map((row) => hydrate(row)) };
  }

  function updateFacts(asin, patch, source = "manual") {
    const row = select.get(asin);
    if (!row) throw new Error("开发样本不存在");
    const merged = { ...parse(row.facts_json, {}), ...normalizeFacts(patch, { partial: true }) };
    if (json(merged) === row.facts_json) return get(asin);
    db.prepare(`UPDATE development_samples SET facts_json = ?, facts_source = ?, facts_observed_at = ?,
      facts_version = facts_version + 1, updated_at = ? WHERE asin = ?`)
      .run(json(merged), source, isoNow(), isoNow(), asin);
    return get(asin);
  }

  function addSuggestion(asin, output) {
    const row = select.get(asin);
    if (!row) throw new Error("开发样本不存在");
    const id = randomUUID();
    db.prepare(`INSERT INTO development_suggestions
      (id, asin, facts_version, raw_output, suggestions_json, unknowns_json, provider, model, prompt_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, asin, output.factsVersion ?? row.facts_version, output.rawText, json(output.reasons), json(output.unknowns),
        output.provider, output.model, output.promptVersion, isoNow(),
      );
    return get(asin);
  }

  function revisions(asin) {
    return db.prepare(`SELECT r.*, s.suggestions_json AS ai_suggestions_json, s.unknowns_json AS ai_unknowns_json
      FROM development_sample_revisions r LEFT JOIN development_suggestions s ON s.id = r.suggestion_id
      WHERE r.asin = ? ORDER BY r.created_at DESC, r.rowid DESC`).all(asin).map((row) => ({
      id: row.id, decision: row.decision, confirmedReasons: parse(row.confirmed_reasons_json, []),
      referenceScope: row.reference_scope, specificFeature: row.specific_feature, note: row.note,
      suggestionId: row.suggestion_id || null, aiSuggestedReasons: parse(row.ai_suggestions_json, []),
      aiUnknowns: parse(row.ai_unknowns_json, []), createdAt: row.created_at,
    }));
  }

  function confirm(asin, input) {
    const row = select.get(asin);
    if (!row) throw new Error("开发样本不存在");
    const decision = String(input?.decision ?? "");
    if (!DECISIONS.includes(decision)) throw new Error("决策无效");
    if (decision === "unconfirmed" && input?.withdraw !== true) throw new Error("撤回确认需要明确操作");
    const reasons = decision === "unconfirmed" ? [] : normalizeReasons(input?.confirmedReasons ?? []);
    const referenceScope = decision === "unconfirmed" ? "unspecified" : String(input?.referenceScope ?? "unspecified");
    if (!REFERENCE_SCOPES.includes(referenceScope)) throw new Error("参考范围无效");
    const specificFeature = decision === "unconfirmed" ? "" : String(input?.specificFeature ?? "").trim().slice(0, 500);
    const note = decision === "unconfirmed" ? "" : String(input?.note ?? "").trim().slice(0, 2000);
    const suggestionId = input?.suggestionId ? String(input.suggestionId) : "";
    if (suggestionId && !db.prepare("SELECT 1 FROM development_suggestions WHERE id = ? AND asin = ?").get(suggestionId, asin)) throw new Error("建议记录不存在");
    const reasonsJson = json(reasons);
    if (row.decision === decision && row.confirmed_reasons_json === reasonsJson && row.reference_scope === referenceScope && row.specific_feature === specificFeature && row.note === note) return { sample: get(asin), changed: false };
    const at = isoNow();
    const revisionId = randomUUID();
    db.exec("BEGIN");
    try {
      db.prepare(`UPDATE development_samples SET decision = ?, confirmed_reasons_json = ?, reference_scope = ?,
        specific_feature = ?, note = ?, confirmed_at = ?, updated_at = ? WHERE asin = ?`)
        .run(decision, reasonsJson, referenceScope, specificFeature, note, decision === "unconfirmed" ? "" : at, at, asin);
      db.prepare(`INSERT INTO development_sample_revisions
        (id, asin, decision, confirmed_reasons_json, reference_scope, specific_feature, note, suggestion_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(revisionId, asin, decision, reasonsJson, referenceScope, specificFeature, note, suggestionId, at);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return { sample: get(asin), changed: true };
  }

  return { create, get, list, updateFacts, addSuggestion, confirm, revisions };
}
