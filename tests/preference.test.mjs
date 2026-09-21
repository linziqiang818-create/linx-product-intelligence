import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_WEIGHTS, BRAIN_AUTO_THRESHOLD, buildProfile, distinctiveness, extractAttrs, finalScoreFor, reasonsFor, scorePreference, similarity } from "../server/preference.mjs";

const arched = { asin: "A1", title: "Arched Bookcase with Fluted Doors", category: "Home & Kitchen:Furniture:Bookcases", price: 220, monthlySales: 150, salesGrowth: 0.3 };
const desk = { asin: "D1", title: "Plain Computer Desk", category: "Home & Kitchen:Furniture:Home Office Desks", price: 120, monthlySales: 800, salesGrowth: -0.1 };
const arched2 = { asin: "A2", title: "Arched Storage Cabinet Fluted Wave Doors", category: "Home & Kitchen:Furniture:Cabinets", price: 260, monthlySales: 90, salesGrowth: 0.2 };

test("属性提取：类目按冒号切分，造型/结构/场景关键词识别", () => {
  const attrs = extractAttrs(arched, "panel");
  assert.equal(attrs.category, "Bookcases");
  assert.equal(attrs.catGroup, "Furniture");
  assert.ok(attrs.style.includes("拱形"));
  assert.ok(attrs.style.includes("波纹条纹"));
  assert.ok(attrs.structure.includes("柜门"));
  assert.equal(attrs.priceBand, "$200–300");
  assert.equal(attrs.growthBand, "销量增长");
});

test("冷启动：没有事件时偏好分为 0，最终分等于基础分", () => {
  const profile = buildProfile([], new Map());
  assert.equal(profile.eventCount, 0);
  assert.equal(scorePreference(extractAttrs(arched, "panel"), profile).prefScore, 0);
  assert.equal(finalScoreFor(70, 0, profile.strength), 70);
});

test("相似度分层：同小类+同造型才算高度相似，泛泛同家具过不了线", () => {
  const a = extractAttrs(arched, "panel");
  const b = extractAttrs(arched2, "panel");
  const plain = extractAttrs(desk, "panel");
  assert.ok(similarity(a, b) >= 4, `拱形+波纹+大类应高度相似，实际 ${similarity(a, b)}`);
  assert.ok(similarity(a, plain) < 4, `书架 vs 普通书桌不该算高度相似，实际 ${similarity(a, plain)}`);
  assert.ok(distinctiveness(plain) < 3, "普通书桌是平庸款");
  assert.ok(distinctiveness(a) >= 3, "拱形书架有辨识度");
});

test("👍 锚点：高度相似款够格升入第二大脑，无关款不沾分", () => {
  const attrsByAsin = new Map([
    ["A1", extractAttrs(arched, "panel")],
    ["A2", extractAttrs(arched2, "panel")],
    ["D1", extractAttrs(desk, "panel")],
  ]);
  const now = Date.now();
  const events = [{ asin: "A1", action: "interested", weight: EVENT_WEIGHTS.interested, created_at: new Date(now).toISOString() }];
  const model = buildProfile(events, attrsByAsin, now);
  assert.equal(model.eventCount, 1);
  const a2 = scorePreference(attrsByAsin.get("A2"), model);
  const d1 = scorePreference(attrsByAsin.get("D1"), model);
  assert.ok(a2.prefScore >= BRAIN_AUTO_THRESHOLD, `高度相似款应达升层线 ${BRAIN_AUTO_THRESHOLD}，实际 ${a2.prefScore}`);
  assert.equal(d1.prefScore, 0, "无关款不沾分");
  assert.ok(finalScoreFor(60, a2.prefScore, model.strength) > finalScoreFor(60, d1.prefScore, model.strength));
  const reasons = reasonsFor(a2.contributions, null, null);
  assert.ok(reasons.some((r) => r.includes("高度相似")), reasons.join(" | "));
});

test("移除原因分流：普货只扣平庸款放过有辨识度的款；材质只连同材质", () => {
  const plainSame = { asin: "P1", title: "Simple Storage Cabinet", category: "Home & Kitchen:Furniture:Storage Cabinets", price: 160 };
  const richSame = { asin: "R1", title: "Arched Rattan Bookcase with Lockable Doors", category: "Home & Kitchen:Furniture:Bookcases", price: 260 };
  const removed = { asin: "E1", title: "Plain Bookcase", category: "Home & Kitchen:Furniture:Bookcases", price: 140 };
  const attrsByAsin = new Map([
    ["E1", extractAttrs(removed, "panel")],
    ["P1", extractAttrs(plainSame, "panel")],
    ["R1", extractAttrs(richSame, "panel")],
  ]);
  const now = Date.now();
  const events = [{ asin: "E1", action: "exclude", weight: EVENT_WEIGHTS.exclude, created_at: new Date(now).toISOString() }];
  // 普货通道：只有平庸的同族款被连坐，有辨识度的同族款豁免
  const model = buildProfile(events, attrsByAsin, now, new Map([["E1", "普货，结构太简单"]]));
  assert.equal(model.negatives[0].channel, "generic");
  const p1 = scorePreference(attrsByAsin.get("P1"), model);
  const r1 = scorePreference(attrsByAsin.get("R1"), model);
  assert.ok(p1.prefScore < 0, `平庸同族款应被排除，实际 ${p1.prefScore}`);
  assert.equal(r1.prefScore, 0, `有辨识度的同族款应豁免，实际 ${r1.prefScore}`);
  // 材质通道：不同材质不受影响
  const modelMat = buildProfile(events, attrsByAsin, now, new Map([["E1", "材质做不了"]]));
  assert.equal(modelMat.negatives[0].channel, "material");
  const glass = scorePreference(extractAttrs({ ...plainSame, title: "Tempered Glass Door Bookcase" }, "glass"), modelMat);
  assert.equal(glass.prefScore, 0, "不同材质不受材质通道影响");
  // product 通道（无原因）：按产品级高度相似排除
  const modelProduct = buildProfile(events, attrsByAsin, now);
  assert.equal(modelProduct.negatives[0].channel, "product");
  assert.ok(scorePreference(attrsByAsin.get("R1"), modelProduct).prefScore < 0, "与被移除款高度相似的应被排除");
});

test("收藏降权：同样的相似度，收藏票比 👍 票弱", () => {
  const attrsByAsin = new Map([
    ["A1", extractAttrs(arched, "panel")],
    ["A2", extractAttrs(arched2, "panel")],
  ]);
  const now = Date.now();
  const viaFavorite = buildProfile([{ asin: "A1", action: "favorite", weight: EVENT_WEIGHTS.favorite, created_at: new Date(now).toISOString() }], attrsByAsin, now);
  const viaInterested = buildProfile([{ asin: "A1", action: "interested", weight: EVENT_WEIGHTS.interested, created_at: new Date(now).toISOString() }], attrsByAsin, now);
  const s1 = scorePreference(attrsByAsin.get("A2"), viaFavorite).prefScore;
  const s2 = scorePreference(attrsByAsin.get("A2"), viaInterested).prefScore;
  assert.ok(s1 > 0 && s1 < s2, `收藏 (${s1}) 应弱于 👍 (${s2})`);
});

test("锚点封顶：同一产品反复操作不重复计票", () => {
  const attrsByAsin = new Map([["A1", extractAttrs(arched, "panel")]]);
  const now = Date.now();
  const events = Array.from({ length: 10 }, () => ({ asin: "A1", action: "favorite", weight: EVENT_WEIGHTS.favorite, created_at: new Date(now).toISOString() }));
  const model = buildProfile(events, attrsByAsin, now);
  assert.equal(model.positives.length, 1);
  assert.equal(model.positives[0].w, 6, "封顶 ±6");
});

test("时间衰减：四个月前的锚点权重约为一半", () => {
  const attrsByAsin = new Map([["A1", extractAttrs(arched, "panel")]]);
  const now = Date.now();
  const fresh = buildProfile([{ asin: "A1", action: "interested", weight: 3, created_at: new Date(now).toISOString() }], attrsByAsin, now);
  const old = buildProfile([{ asin: "A1", action: "interested", weight: 3, created_at: new Date(now - 120 * 86_400_000).toISOString() }], attrsByAsin, now);
  const ratio = old.positives[0].w / fresh.positives[0].w;
  assert.ok(Math.abs(ratio - 0.5) < 0.02, `ratio=${ratio}`);
});

test("证据强度只按正向锚点计：约 24 分权重到顶，单款封顶不虚胖", () => {
  const products = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"].map((asin, i) => [
    asin,
    extractAttrs({ asin, title: `Cabinet ${i}`, category: `Home & Kitchen:Furniture:Cabinet ${i}`, price: 200 }, "panel"),
  ]);
  const attrsByAsin = new Map(products);
  const eightThumbsUp = Array.from({ length: 8 }, (_, i) => ({ asin: `A${i + 1}`, action: "interested", weight: 3, created_at: new Date().toISOString() }));
  assert.equal(buildProfile(eightThumbsUp, attrsByAsin).strength, 1);
  const oneProductManyClicks = Array.from({ length: 60 }, () => ({ asin: "A1", action: "favorite", weight: 1, created_at: new Date().toISOString() }));
  const capped = buildProfile(oneProductManyClicks, attrsByAsin);
  assert.equal(capped.totalPos, 6, "单款封顶 ±6，不虚胖");
  assert.ok(capped.strength < 1);
});
