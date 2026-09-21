import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRules, placeProduct } from "../server/rules.mjs";
import { defaultRules, normalizeRules } from "../server/rules-config.mjs";
import { assess } from "../server/assess.mjs";

const rules = compileRules(defaultRules());
const place = (title, category = "", material = "", override = null) => {
  const product = { title, category, material, price: 200, monthlySales: 100, packageGrossKg: 20 };
  return placeProduct(product, rules, override, assess(product));
};

test("拱形玻璃展示柜：清除但标记可改款（玻璃 → 亚克力）", () => {
  const r = place("Arched Display Cabinet with Glass Doors, Fluted", "Home & Kitchen:Furniture:Cabinets", "Engineered Wood, Tempered Glass");
  assert.equal(r.placement, "removed");
  assert.equal(r.removeGroup, "convertible");
  assert.equal(r.convertible, "玻璃 → 亚克力");
  assert.ok(r.tags.includes("可改款"));
});

test("“no mirror” 否定表述不算玻璃", () => {
  const r = place("Barber Station with Drawers, No Mirror", "Salon Furniture", "MDF");
  assert.equal(r.placement, "pass");
});

test("板材柜体 + 金属脚：通过，标含金属配件", () => {
  const r = place("Fluted Sideboard Buffet Cabinet with Metal Legs, Gold Handles", "Buffets & Sideboards", "MDF");
  assert.equal(r.placement, "pass");
  assert.ok(r.tags.includes("含金属配件"));
});

test("纯金属书架：清除并标记可改板式", () => {
  const r = place("Industrial Metal Bookshelf 5 Tier Steel Frame", "Bookcases", "Metal");
  assert.equal(r.placement, "removed");
  // 书架属于普货类目且无差异化词，普货判定优先于材质
  assert.equal(r.removeGroup, "commodity");
});

test("纯金属拱形柜：普货不命中，走材质可改款（金属 → 板式）", () => {
  const r = place("Arched Steel Storage Cabinet with Curved Top", "Storage Cabinets", "Steel");
  assert.equal(r.placement, "removed");
  assert.equal(r.removeGroup, "convertible");
  assert.equal(r.convertible, "金属 → 板式");
});

test("普通电动升降桌：普货", () => {
  const r = place("Electric Standing Desk 55 inch Height Adjustable Home Office Desk", "Home Office Desks", "MDF, Steel frame");
  assert.equal(r.placement, "removed");
  assert.equal(r.removeGroup, "commodity");
  assert.equal(r.removeRuleId, "commodity:standing-desk");
});

test("带拱形书架与插座的书桌：有差异化词，不算普货", () => {
  const r = place("L Shaped Desk with Arched Hutch and Power Outlets", "Home Office Desks", "Engineered Wood");
  assert.equal(r.placement, "pass");
});

test("单块坐垫的鞋凳：软包例外放行并标含坐垫", () => {
  const r = place("Shoe Storage Bench with Padded Seat Cushion, Entryway Hall Tree", "Storage Benches", "Engineered Wood, Linen Cushion");
  assert.equal(r.placement, "pass", r.removeReason);
  assert.ok(r.tags.includes("含坐垫"));
});

test("布艺沙发：纯软体家具清除", () => {
  const r = place("Modern Linen Fabric Sofa Couch with Cushion", "Sofas", "Linen fabric, foam");
  assert.equal(r.placement, "removed");
  assert.equal(r.removeGroup, "material");
  assert.equal(r.removeRuleId, "material:soft-furniture");
});

test("拱形柜带亚麻软包柜门：含软包清除（非普货类目，走材质规则）", () => {
  const r = place("Arched Storage Cabinet with Linen Upholstered Doors", "Storage Cabinets", "Wood, Linen");
  assert.equal(r.placement, "removed");
  assert.equal(r.removeGroup, "material");
  assert.equal(r.removeRuleId, "material:upholstery");
});

test("床架带软包床头：普货规则先命中（床架无差异化）", () => {
  const r = place("Queen Bed Frame with Linen Upholstered Headboard", "Bed Frames", "Wood, Linen");
  assert.equal(r.placement, "removed");
  assert.equal(r.removeGroup, "commodity");
});

test("纯实木清除，板材关键词放行", () => {
  assert.equal(place("Solid Oak Dining Sideboard Cabinet Fluted", "Sideboards", "Solid Oak").placement, "removed");
  assert.equal(place("Fluted Sideboard, Solid Wood Legs, MDF body", "Sideboards", "MDF, solid wood legs").placement, "pass");
});

test("婴儿/户外/浴室柜/灯具类目清除", () => {
  assert.equal(place("Baby Crib with Storage", "Nursery").removeGroup, "category");
  assert.equal(place("Outdoor Patio Storage Cabinet", "Patio Furniture", "Resin").removeGroup, "category");
  assert.equal(place("36 inch Bathroom Vanity with Sink", "Bathroom Vanities", "MDF").removeGroup, "category");
  assert.equal(place("Modern Chandelier Pendant Light", "Lighting").removeGroup, "category");
});

test("人工捞回：置为通过，保留自动判定原因", () => {
  const r = place("Arched Display Cabinet with Glass Doors", "Cabinets", "Glass", { action: "rescue" });
  assert.equal(r.placement, "pass");
  assert.equal(r.autoPlacement, "removed");
  assert.match(r.autoReason, /玻璃/);
  assert.ok(r.tags.includes("手动捞回"));
  assert.equal(r.convertible, "玻璃 → 亚克力");
});

test("人工移出：置为清除，分组 manual", () => {
  const r = place("Fluted Sideboard Cabinet", "Sideboards", "MDF", { action: "exclude", reason: "同质化严重" });
  assert.equal(r.placement, "removed");
  assert.equal(r.removeGroup, "manual");
  assert.equal(r.removeReason, "同质化严重");
});

test("非常规材质只标记不清除；高运费按毛重标记", () => {
  const product = { title: "Fluted Sideboard with Sintered Stone Top", category: "Sideboards", material: "MDF, sintered stone", price: 300, packageGrossKg: 62, packageDimensionsCm: "160 x 45 x 20 cm" };
  const r = placeProduct(product, rules, null, assess(product));
  assert.equal(r.placement, "pass");
  assert.ok(r.tags.includes("非常规材质"));
  assert.ok(r.tags.includes("高运费"));
});

test("缺包装数据标数据待补；运费只看包装尺寸不看组装尺寸", () => {
  const a = assess({ title: "Tall Cabinet", category: "Cabinets", material: "MDF", price: 200, dimensions: "40 x 90 x 180 cm", packageGrossKg: 30 });
  assert.ok(a.dataMissing.includes("包装尺寸"));
  assert.equal(a.cannotShip, false);
  assert.equal(a.freightTriggers.some((t) => /最长边/.test(t)), false);
});

test("切入窗口：近期上架、评论少却有稳定月销，机会分高于同款老品", () => {
  const base = { title: "Fluted Sideboard Cabinet with Drawers", category: "Sideboards", material: "MDF", price: 220, monthlySales: 80, packageGrossKg: 35, packageDimensionsCm: "150 x 45 x 20 cm" };
  const fresh = assess({ ...base, launchDays: 90, reviews: 12 });
  const seasoned = assess({ ...base, launchDays: 900, reviews: 1500 });
  assert.equal(fresh.entryWindow, true);
  assert.ok(fresh.hiddenSignals.some((s) => /评论壁垒未形成/.test(s)));
  assert.equal(seasoned.entryWindow, false);
  assert.ok(fresh.hiddenOpportunity > seasoned.hiddenOpportunity);
});

test("老品长期稳销：不算切入窗口，但标记长周期验证并抵消部分拥挤惩罚", () => {
  const base = { title: "Fluted Sideboard Cabinet with Storage", category: "Sideboards", material: "MDF", price: 220, packageGrossKg: 35, packageDimensionsCm: "150 x 45 x 20 cm" };
  const veteran = assess({ ...base, launchDays: 800, monthlySales: 120, reviews: 1500 });
  const stale = assess({ ...base, launchDays: 800, monthlySales: 20, reviews: 1500 });
  assert.equal(veteran.entryWindow, false);
  assert.equal(veteran.longProven, true);
  assert.ok(veteran.hiddenSignals.some((s) => /长周期验证/.test(s)));
  assert.equal(stale.longProven, false);
  assert.ok(veteran.hiddenOpportunity > stale.hiddenOpportunity);
});

test("价格带：150–600 满档，140–150 仅参考区，600 以上与 140 以下都不加分", () => {
  const base = { title: "Fluted Sideboard Cabinet", category: "Sideboards", material: "MDF", monthlySales: 80 };
  const inBand = assess({ ...base, price: 220 });
  const reference = assess({ ...base, price: 145 });
  const tooCheap = assess({ ...base, price: 100 });
  const tooDear = assess({ ...base, price: 700 });
  assert.equal(inBand.companyFit - reference.companyFit, 3);
  assert.equal(reference.companyFit - tooCheap.companyFit, 3);
  assert.equal(tooDear.companyFit, tooCheap.companyFit);
});

test("座椅：明确包含座椅的套装清除；桌+文件柜、床头柜×2 不受影响", () => {
  const barSet = place("70.9 inch Home Bar Table Set with 3 Swivel Bar Stools", "Bar Tables", "MDF");
  assert.equal(barSet.removeRuleId, "category:seating");
  assert.equal(barSet.removeGroup, "category");
  const island = place("Kitchen Island with Storage and Seating - 2 Bar Stools, Black", "Kitchen Islands", "MDF");
  assert.equal(island.removeRuleId, "category:seating");
  const benchSet = place("Lift Top Coffee Table Set with Storage Bench, 40 Inch", "Coffee Tables", "MDF");
  assert.equal(benchSet.removeRuleId, "category:seating");
  const deskCombo = place("55 inch Fluted Desk with Lockable File Cabinet Drawers and Charging Station", "Desks", "MDF");
  assert.equal(deskCombo.placement, "pass");
  const pair = place("Nightstands Set of 2 with Charging Station", "Nightstands", "MDF");
  assert.equal(pair.placement, "pass");
});

test("座椅：不能只看标题——容量描述、椅子收纳车、边几、安全类目都不清", () => {
  const capacity = place("Round Dining Table for 4, Farmhouse Kitchen Table with Charging Station", "Kitchen & Dining Room Tables", "MDF");
  assert.notEqual(capacity.removeRuleId, "category:seating");
  const cart = place("Folding Chair Rack, Folding Chair Storage Cart for 84 Chairs, Rolling", "Utility Carts", "MDF");
  assert.notEqual(cart.removeRuleId, "category:seating");
  const chairside = place("Fluted Chairside End Table with Charging Station", "End Tables", "MDF");
  assert.equal(chairside.placement, "pass");
  const sewing = place("Adjustable Height Sewing and Crafting Chair with Wheels", "Sewing Storage", "MDF");
  assert.equal(sewing.placement, "pass");
  const hallTree = place("78 inch Tall Boho Hall Tree with Bench & Shoe Storage, Arched", "Hall Trees", "MDF");
  assert.equal(hallTree.placement, "pass");
});

test("座椅：单把椅子只有类目也确认才清", () => {
  const stool = place("Fluted Vanity Stool with Storage", "Home & Kitchen:Furniture:Bedroom Furniture:Vanities & Vanity Benches", "MDF");
  assert.equal(stool.removeRuleId, "category:seating");
  const unconfirmed = place("Fluted Vanity Stool with Storage", "Bedroom Furniture", "MDF");
  assert.equal(unconfirmed.placement, "pass");
});

test("壁炉：不清除，标「壁炉 → 留位或改储物」可改款", () => {
  const r = place("Fluted TV Stand with Electric Fireplace, 65 inch, MDF", "Television Stands", "MDF");
  assert.equal(r.placement, "pass");
  assert.equal(r.convertible, "壁炉 → 留位或改储物");
  assert.ok(r.tags.includes("可改款"));
});

test("规则迁移：已保存的旧配置自动补齐新增的默认规则，且保留用户修改", () => {
  const saved = { version: 2, categoryBans: [{ id: "baby", label: "婴儿/儿童家具", enabled: false, pattern: "baby" }] };
  const merged = normalizeRules(saved);
  assert.equal(merged.seating.enabled, true);
  assert.equal(merged.flags.fireplaceSlot.enabled, true);
  const baby = merged.categoryBans.find((r) => r.id === "baby");
  assert.equal(baby.enabled, false);
  assert.equal(baby.pattern, "baby");
  assert.ok(merged.categoryBans.some((r) => r.id === "outdoor"));
});
