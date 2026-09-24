import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createStore } from "../server/db.mjs";
import { createApi } from "../server/api.mjs";
import { createDevelopmentStore, factsFromDetail, parseAmazonInput } from "../server/development.mjs";
import { reserveDiscoveryRequest } from "../server/discover.mjs";
import { aiConfig, generateSuggestion } from "../server/ai-provider.mjs";
import { parseSuggestion } from "../server/development-suggestion.mjs";

const asin = "B0DEV00001";
const product = { asin, title: "Fluted sideboard cabinet with drawers", category: "Sideboards", price: 249, monthlySales: 80, reviews: 24, imageUrl: "https://example.com/product.jpg" };
const reason = { reason_code: "NEW_PRODUCT_VALIDATED", scope: "whole", detail: "新品已有月销" };

test("ASIN 和 Amazon URL 规范化；详情事实不把商品重量冒充包装毛重", () => {
  assert.deepEqual(parseAmazonInput(`https://www.amazon.com/gp/product/${asin}?ref=abc`), { asin, sourceUrl: `https://www.amazon.com/dp/${asin}` });
  assert.throws(() => parseAmazonInput(`https://evil.example/dp/${asin}`), /Amazon 美国站/);
  const facts = factsFromDetail({ title: "Cabinet", weightLb: 50, price: 200, boughtPastMonth: "100" });
  assert.equal(facts.itemWeightLb, 50);
  assert.equal(facts.packageGrossKg, undefined);
  assert.equal(facts.monthlySales, 100);
});

test("开发样本按 ASIN 幂等、确认版本不可覆盖，正式反馈和排序保持原值", () => {
  const store = createStore(":memory:");
  store.upsertProducts([product]);
  store.recomputeAll();
  const before = store.db.prepare("SELECT placement, tier, baseScore, prefScore, finalScore, autoBrain FROM products WHERE asin = ?").get(asin);
  const events = store.counts().events;
  const development = createDevelopmentStore(store);
  assert.equal(development.create([asin, `https://www.amazon.com/dp/${asin}`])[1].inserted, false);
  assert.equal(development.get(asin).decision, "unconfirmed");
  assert.equal(development.get(asin).linkedProduct, true);
  assert.equal(development.get(asin).facts.price, 249);
  const firstSuggestion = development.addSuggestion(asin, { rawText: "raw 1", reasons: [reason], unknowns: ["包装数据"], provider: "gemini", model: "mock", promptVersion: "v1" }).suggestion.id;
  const first = development.confirm(asin, { decision: "want", confirmedReasons: [reason], referenceScope: "local", specificFeature: "波纹门板", note: "先做打样", suggestionId: firstSuggestion });
  assert.equal(first.changed, true);
  assert.equal(first.sample.confirmedReasons[0].category, "market");
  assert.equal(development.confirm(asin, { decision: "want", confirmedReasons: [reason], referenceScope: "local", specificFeature: "波纹门板", note: "先做打样", suggestionId: firstSuggestion }).changed, false);
  development.updateFacts(asin, { reviews: 40 });
  assert.equal(development.get(asin).suggestion.stale, true);
  development.addSuggestion(asin, { rawText: "raw 2", reasons: [], unknowns: [], provider: "gemini", model: "mock", promptVersion: "v1" });
  assert.equal(development.get(asin).suggestion.stale, false);
  development.confirm(asin, { decision: "maybe", confirmedReasons: [{ reason_code: "OTHER", scope: "local", detail: "需确认供应链" }], referenceScope: "local", specificFeature: "抽屉", note: "再核算", suggestionId: null });
  assert.equal(development.revisions(asin).length, 2);
  assert.equal(development.revisions(asin)[1].suggestionId, firstSuggestion);
  assert.equal(development.revisions(asin)[1].aiSuggestedReasons[0].reason_code, "NEW_PRODUCT_VALIDATED");
  assert.equal(development.revisions(asin)[1].decision, "want");
  assert.equal(development.revisions(asin)[0].decision, "maybe");
  assert.equal(store.counts().events, events);
  assert.deepEqual(store.db.prepare("SELECT placement, tier, baseScore, prefScore, finalScore, autoBrain FROM products WHERE asin = ?").get(asin), before);
  store.close();
});

test("非法 reason code、空 OTHER 与非显式撤回被拒，撤回保留历史", () => {
  const store = createStore(":memory:");
  const development = createDevelopmentStore(store);
  development.create([asin]);
  assert.throws(() => development.confirm(asin, { decision: "want", confirmedReasons: [{ reason_code: "UNKNOWN", scope: "whole" }] }), /未知原因代码/);
  assert.throws(() => development.confirm(asin, { decision: "want", confirmedReasons: [{ reason_code: "OTHER", scope: "whole" }] }), /需要填写说明/);
  development.confirm(asin, { decision: "want", confirmedReasons: [], referenceScope: "unspecified" });
  assert.throws(() => development.confirm(asin, { decision: "unconfirmed" }), /明确操作/);
  development.confirm(asin, { decision: "unconfirmed", withdraw: true });
  assert.deepEqual(development.revisions(asin).map((r) => r.decision), ["unconfirmed", "want"]);
  store.close();
});

test("v3 备份包含建议与人工版本，merge 幂等；v2 replace 保持兼容", () => {
  const source = createStore(":memory:");
  const development = createDevelopmentStore(source);
  development.create([asin]);
  development.addSuggestion(asin, { rawText: "original", reasons: [reason], unknowns: [], provider: "gemini", model: "mock", promptVersion: "v1" });
  development.confirm(asin, { decision: "want", confirmedReasons: [reason], referenceScope: "whole", suggestionId: development.get(asin).suggestion.id });
  const backup = source.backup();
  assert.equal(backup.version, 3);
  const target = createStore(":memory:");
  target.restore(backup, "replace");
  target.restore(backup, "merge");
  assert.equal(createDevelopmentStore(target).revisions(asin).length, 1);
  assert.equal(target.db.prepare("SELECT COUNT(*) AS n FROM development_suggestions").get().n, 1);
  target.restore({ ...backup, version: 2, development_samples: undefined, development_suggestions: undefined, development_sample_revisions: undefined }, "replace");
  assert.equal(createDevelopmentStore(target).get(asin), null);
  source.close(); target.close();
});

test("Bright Data 详情额度为发现箱和样本共用", () => {
  const store = createStore(":memory:");
  const config = { dailySearchLimit: 10, dailyDetailLimit: 1, monthlyRequestCap: 1 };
  assert.equal(reserveDiscoveryRequest(store, "detail", config).detail, 1);
  assert.throws(() => reserveDiscoveryRequest(store, "detail", config), /额度/);
  store.close();
});

test("Gemini 适配器只从服务端环境读取配置，失败时可转人工", async () => {
  assert.equal(aiConfig({ AI_PROVIDER: "gemini", AI_MODEL: "test-model" }).configured, false);
  const env = { AI_PROVIDER: "gemini", AI_MODEL: "test-model", AI_API_KEY: "secret" };
  const result = await generateSuggestion("prompt", { env, fetchFn: async (url, init) => {
    assert.match(url, /test-model:generateContent$/);
    assert.equal(init.headers["x-goog-api-key"], "secret");
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"reasons":[],"unknowns":[]}' }] } }] });
  } });
  assert.equal(result.provider, "gemini");
  assert.deepEqual(parseSuggestion(result.rawText, {}).reasons, []);
  await assert.rejects(generateSuggestion("prompt", { env, fetchFn: async () => new Response("", { status: 429 }) }), /限流/);
  await assert.rejects(generateSuggestion("prompt", { env: {} }), /人工标注/);
});

test("开发样本 API：新 ASIN 只入样本，抓取与 AI 失败后仍可人工确认", async () => {
  const store = createStore(":memory:");
  store.kvSet("discoveryConfig", { dailyDetailLimit: 1, monthlyRequestCap: 1 });
  const app = express();
  app.use("/api", createApi(store, {
    fetchDevelopmentPage: async () => "Amazon.com: Fluted cabinet for living room : Home & Kitchen\n$229.00$229.00\n100+ bought in past month",
    suggestDevelopment: async () => { throw new Error("provider unavailable"); },
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/development-samples`;
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const created = await (await post("", { inputs: [asin] })).json();
    assert.equal(created.rows[0].inserted, true);
    assert.equal(store.getProduct(asin), null);
    const fetched = await (await post(`/${asin}/facts/fetch`, {})).json();
    assert.equal(fetched.facts.price, 229);
    assert.equal(store.kvGet("discoveryLedger").detail, 1);
    assert.equal((await post(`/${asin}/suggestions`, {})).status, 503);
    const response = await fetch(`${base}/${asin}/confirmation`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "want", confirmedReasons: [reason], referenceScope: "whole", specificFeature: "", note: "manual" }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sample.decision, "want");
    assert.equal(store.counts().events, 0);
    assert.equal(store.counts().space1, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});
