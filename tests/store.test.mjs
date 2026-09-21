import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, normalizeProduct, parseSales } from "../server/db.mjs";

const sample = (asin, patch = {}) => ({
  asin,
  title: "Fluted Sideboard Buffet Cabinet with Adjustable Shelves",
  category: "Home & Kitchen:Furniture:Buffets & Sideboards",
  material: "MDF",
  price: 199.99,
  monthlySalesEstimate: { min: 100, max: 199 },
  salesGrowth: 0.4,
  launchDays: 90,
  reviews: 40,
  rating: 4.5,
  packageGrossKg: 30,
  packageDimensionsCm: "120 x 45 x 20 cm",
  ...patch,
});

test("月销解析：数字 / 区间字串 / 区间对象 / 100+", () => {
  assert.deepEqual(parseSales(150), { value: 150, range: "" });
  assert.deepEqual(parseSales("50-99"), { value: 75, range: "50–99" });
  assert.deepEqual(parseSales({ min: 500, max: 999 }), { value: 750, range: "500–999" });
  assert.deepEqual(parseSales("100+"), { value: 100, range: "100+" });
  assert.deepEqual(parseSales(""), { value: 0, range: "" });
});

test("归一化：旧版 9999 上架天数与 99999 BSR 视为未知，重量回退换算毛重", () => {
  const row = normalizeProduct({ asin: "b0test0001", title: "X", launchDays: 9999, bsr: 99999, weight: 22.05, estimatedMargin: 0.25 });
  assert.equal(row.asin, "B0TEST0001");
  assert.equal(row.launchDays, 0);
  assert.equal(row.bsr, 0);
  assert.equal(row.packageGrossKg, 10);
  assert.equal(row.estimatedMargin, 25);
});

test("写入 → 重算 → 三层计数、筛选、排序、纠错、收藏", () => {
  const store = createStore(":memory:");
  store.upsertProducts([
    sample("B0AAAAAAA1"),
    sample("B0AAAAAAA2", { title: "Arched Display Cabinet with Glass Doors", material: "Tempered Glass, MDF", price: 320 }),
    sample("B0AAAAAAA3", { title: "Electric Standing Desk Height Adjustable", category: "Home Office Desks", material: "MDF, steel", price: 150 }),
    sample("B0AAAAAAA4", { title: "Coffee Bar Cabinet with Wine Rack", category: "Bar Cabinets", price: 260, monthlySalesEstimate: { min: 300, max: 499 } }),
  ]);
  store.recomputeAll();
  let counts = store.counts();
  assert.equal(counts.space1, 4);
  // 白纸期（无锚点）：每个类目优中选优——A1/A4 各是本类目唯一的款，自动进第二大脑
  assert.equal(counts.space2, 0);
  assert.equal(counts.space3, 2);
  assert.equal(counts.removed, 2);

  // 已清除分组
  const removed = store.listProducts({ space: "removed" });
  assert.deepEqual(removed.rows.map((r) => r.removeGroup).sort(), ["commodity", "convertible"]);

  // 筛选：价格区间 + 排序
  const byPrice = store.listProducts({ space: "1", priceMin: 190, sort: "price", dir: "asc" });
  assert.deepEqual(byPrice.rows.map((r) => r.price), [199.99, 260, 320]);
  const twoKeys = store.listProducts({ space: "1", sort: "materialGroup", dir: "asc", sort2: "price", dir2: "desc" });
  assert.equal(twoKeys.total, 4);

  // 搜索
  assert.equal(store.listProducts({ space: "1", q: "wine" }).total, 1);

  // 直通第二大脑：A2 钉进脑层；A4 是本类目唯一款自动在脑；Buffets 类目保留一个最优名额 → 共 3
  store.moveProducts(["B0AAAAAAA2"], "brain");
  store.recomputeAll();
  counts = store.counts();
  assert.equal(counts.space3, 3);
  const rescued = store.getProduct("B0AAAAAAA2");
  assert.equal(rescued.placement, "pass");
  assert.equal(rescued.autoPlacement, "removed");
  assert.equal(rescued.tier, "brain");
  assert.ok(rescued.tags.includes("手动捞回"));
  assert.equal(rescued.override.action, "rescue");

  // 撤销：精确还原到被筛除，学习事件一并删除
  const moves = store.listMoves(10);
  assert.equal(moves.length, 1);
  assert.ok(moves[0].canUndo);
  store.undoMoves([{ asin: "B0AAAAAAA2", eventId: moves[0].eventId }]);
  store.recomputeAll();
  assert.equal(store.getProduct("B0AAAAAAA2").placement, "removed");
  assert.equal(store.getProduct("B0AAAAAAA2").tier, "");
  assert.equal(store.counts().events, 0);

  // 收藏 → 事件 → 偏好分变化：收藏即钉入第二大脑，对相似款只按弱票泛化
  store.setFavorite(["B0AAAAAAA4"], true);
  store.recomputeAll();
  assert.equal(store.counts().favorites, 1);
  assert.equal(store.listProducts({ space: "favorites" }).total, 1);
  const favored = store.getProduct("B0AAAAAAA4");
  assert.ok(favored.favorite);
  assert.ok(favored.prefScore > 0);
  assert.equal(favored.tier, "brain");

  // 手动降级：A1 钉进适配池；A4 留在第二大脑（收藏钉住）
  store.moveProducts(["B0AAAAAAA1"], "pool");
  store.recomputeAll();
  assert.equal(store.counts().space2, 1);
  assert.equal(store.counts().space3, 1);
  const poolRows = store.listProducts({ space: "2" }).rows;
  assert.deepEqual(poolRows.map((r) => r.asin), ["B0AAAAAAA1"]);
  assert.equal(poolRows[0].tier, "pool");

  // 规则统计
  const stats = store.ruleStats();
  assert.ok(stats.some((s) => s.ruleId === "material:glass" && s.removed === 1));

  // 备份/恢复（tier 一并带走）
  const backup = store.backup();
  assert.equal(backup.products.length, 4);
  const other = createStore(":memory:");
  other.restore(backup, "replace");
  other.recomputeAll();
  assert.equal(other.counts().space1, 4);
  assert.equal(other.counts().favorites, 1);
  assert.equal(other.counts().space2, 1);
  store.close();
  other.close();
});

test("负反馈不连坐：👎 只作用于个体，适配池只进手动降级", () => {
  const store = createStore(":memory:");
  store.upsertProducts([
    sample("B0AUTOAAA1"),
    sample("B0AUTOAAA2", { title: "Fluted Sideboard Buffet Cabinet with Wine Rack", price: 210 }),
  ]);
  store.recomputeAll();
  // 同小类两款只取推荐分最优的 1 款自动进脑（类目前 20%，至少 1 款）
  assert.equal(store.counts().space2, 1);
  assert.equal(store.counts().space3, 1);

  // 对 2 号打 👎：不产生泛化锚点，1 号共享大量属性也分毫不动（负反馈只作用于个体）
  store.setInterest("B0AUTOAAA2", "not_interested");
  store.recomputeAll();
  const other = store.getProduct("B0AUTOAAA1");
  assert.equal(other.prefScore, 0, "同属性产品不该被连坐");
  assert.equal(other.tier, "");
  assert.equal(store.counts().space2, 1);
  assert.equal(store.counts().space3, 1);

  // 只有手动移动才换层：👍 升入第二大脑（成为正向锚点）、手动降级钉在适配池
  store.moveProducts(["B0AUTOAAA2"], "pool");
  store.recomputeAll();
  assert.equal(store.counts().space2, 1);
  assert.equal(store.counts().space3, 1);
  store.moveProducts(["B0AUTOAAA1"], "brain");
  store.recomputeAll();
  assert.equal(store.getProduct("B0AUTOAAA1").tier, "brain");
  assert.equal(store.counts().space3, 1);
  assert.equal(store.counts().space2, 1);
  store.close();
});

test("移动/撤销：原因落库、只有最新一条可撤销、撤销还原整条链路", () => {
  const store = createStore(":memory:");
  store.upsertProducts([
    sample("B0MOVEAAA1"),
    sample("B0MOVEAAA2", { title: "Arched Display Cabinet with Glass Doors", material: "Tempered Glass, MDF", price: 320 }),
  ]);
  store.recomputeAll();
  assert.equal(store.getProduct("B0MOVEAAA2").placement, "removed");

  // 从产品库拉入适配池（带原因）
  const first = store.moveProducts(["B0MOVEAAA2"], "pool", "材质做不了");
  store.recomputeAll();
  let p = store.getProduct("B0MOVEAAA2");
  assert.equal(p.placement, "pass");
  assert.equal(p.tier, "pool");
  assert.equal(p.override.reason, "材质做不了");
  let moves = store.listMoves(10);
  assert.equal(moves[0].action, "rescue");
  assert.equal(moves[0].reason, "材质做不了");
  assert.ok(moves[0].canUndo);

  // 再移回产品库（第二个动作，无原因）
  const second = store.moveProducts(["B0MOVEAAA2"], "library");
  store.recomputeAll();
  assert.equal(store.getProduct("B0MOVEAAA2").placement, "removed");
  moves = store.listMoves(10);
  assert.equal(moves[0].action, "exclude");

  // 旧的那条被最新调整覆盖，不可撤销
  assert.equal(moves.find((m) => m.eventId === first.moves[0].eventId).canUndo, false);
  assert.throws(() => store.undoMoves([{ asin: "B0MOVEAAA2", eventId: first.moves[0].eventId }]), /更新/);

  // 撤销最新一条：还原到「适配池 + 材质做不了」，事件被删除
  store.undoMoves([{ asin: "B0MOVEAAA2", eventId: second.moves[0].eventId }]);
  store.recomputeAll();
  p = store.getProduct("B0MOVEAAA2");
  assert.equal(p.placement, "pass");
  assert.equal(p.tier, "pool");
  assert.equal(p.override.reason, "材质做不了");
  assert.equal(store.counts().events, 1);
  store.close();
});

test("tier 一次性迁移：旧 not_interested → pool、interested → brain", () => {
  const dir = mkdtempSync(join(tmpdir(), "linx-tier-"));
  const dbPath = join(dir, "tier.db");
  let store = createStore(dbPath);
  store.upsertProducts([
    sample("B0MIGRATE1"),
    sample("B0MIGRATE2"),
  ]);
  // 模拟老版本数据：interest 决定成员，tier 还不存在
  store.db.exec("UPDATE products SET interest = 'not_interested' WHERE asin = 'B0MIGRATE1'");
  store.db.exec("UPDATE products SET interest = 'interested' WHERE asin = 'B0MIGRATE2'");
  store.db.exec("DELETE FROM kv WHERE key = 'tierMigrated'");
  store.close();

  store = createStore(dbPath);
  assert.equal(store.getProduct("B0MIGRATE1").tier, "pool");
  assert.equal(store.getProduct("B0MIGRATE2").tier, "brain");
  store.close();
});

test("恢复自动判定：清掉手动钉住，回到规则 + 模型，且可撤销", () => {
  const store = createStore(":memory:");
  store.upsertProducts([sample("B0RESETAA1")]);
  store.recomputeAll();
  store.moveProducts(["B0RESETAA1"], "brain"); // 先手动升入
  store.moveProducts(["B0RESETAA1"], "pool"); // 再手动降级
  store.recomputeAll();
  assert.equal(store.getProduct("B0RESETAA1").tier, "pool");
  const result = store.moveProducts(["B0RESETAA1"], "auto");
  store.recomputeAll();
  const p = store.getProduct("B0RESETAA1");
  assert.equal(p.tier, "");
  // 升入时留下的 👍 锚点是持久信号：恢复自动判定后，模型按你曾经的 👍 依然把它选进第二大脑
  assert.equal(store.counts().space2, 0);
  assert.equal(store.counts().space3, 1);
  store.undoMoves([{ asin: "B0RESETAA1", eventId: result.moves[0].eventId }]);
  store.recomputeAll();
  assert.equal(store.getProduct("B0RESETAA1").tier, "pool");
  store.close();
});

test("规则修改后重算：关闭玻璃规则，玻璃柜进入适配池", () => {
  const store = createStore(":memory:");
  store.upsertProducts([sample("B0AAAAAAA2", { title: "Arched Display Cabinet with Glass Doors", material: "Glass, MDF" })]);
  store.recomputeAll();
  assert.equal(store.getProduct("B0AAAAAAA2").placement, "removed");
  const rules = store.getRules();
  rules.material.glass.enabled = false;
  store.setRules(rules);
  store.recomputeAll();
  assert.equal(store.getProduct("B0AAAAAAA2").placement, "pass");
  store.close();
});

test("旧版 localStorage 迁移：产品、收藏、校准反馈", () => {
  const store = createStore(":memory:");
  const result = store.migrateLegacy({
    products: [sample("B0AAAAAAA1")],
    trash: [sample("B0AAAAAAA9", { title: "Metal Garment Rack", material: "Steel" })],
    favorites: ["B0AAAAAAA1"],
    calibration: { feedback: { B0AAAAAAA1: { asin: "B0AAAAAAA1", verdict: "develop", interest: "priority", updatedAt: "2026-07-15T00:00:00+08:00" } } },
    batchCalibration: { research: { B0AAAAAAA9: { decision: "pass", updatedAt: "2026-07-15T00:00:00+08:00" } } },
  });
  store.recomputeAll();
  assert.equal(result.inserted, 2);
  assert.equal(result.favoritesAdded, 1);
  assert.equal(result.calibrationEvents, 2);
  assert.equal(store.counts().favorites, 1);
  assert.ok(store.counts().events >= 4);
  store.close();
});

test("类目否决豁免：以「类目不做」移除后，该类目不再有 top-20% 保底代表", () => {
  const store = createStore(":memory:");
  store.upsertProducts([
    sample("B0VETO00001", { category: "Home & Kitchen:Furniture:Pet Crates", monthlySalesEstimate: { min: 100, max: 199 } }),
    sample("B0VETO00002", { category: "Home & Kitchen:Furniture:Pet Crates", monthlySalesEstimate: { min: 400, max: 499 } }),
    sample("B0VETO00003", { category: "Home & Kitchen:Furniture:Pet Crates", monthlySalesEstimate: { min: 900, max: 999 } }),
    sample("B0CONTROL01", { category: "Home & Kitchen:Furniture:Wine Cabinets" }),
  ]);
  store.recomputeAll();
  // 白纸期：Pet Crates 3 款取最优 1 款 + Wine Cabinets 1 款 → 2 款自动进第二大脑
  assert.equal(store.counts().space3, 2);

  // 以「这个类目不做」移除 Pet Crates 的头部款 → 整个类目失去保底，不再硬推代表
  store.moveProducts(["B0VETO00003"], "library", "这个类目不做");
  store.recomputeAll();
  assert.equal(store.getProduct("B0VETO00002").autoBrain, 0);
  assert.equal(store.counts().space3, 1); // 只剩 Wine Cabinets 的代表

  // 锚点直通不受类目否决影响：真喜欢仍然升得上去
  store.moveProducts(["B0VETO00001"], "brain");
  store.recomputeAll();
  assert.equal(store.counts().space3, 2);
  store.close();
});

test("发现箱「不要」：记 −1 弱负票、错题本可撤销（放回发现箱）", () => {
  const store = createStore(":memory:");
  store.upsertProducts([sample("B0DISMIS01"), sample("B0DISMIS02")]);
  store.db.prepare("UPDATE products SET discoveryState = 'new'").run();
  const result = store.dismissDiscoveries(["B0DISMIS01"]);
  assert.equal(result.dismissed, 1);
  store.recomputeAll();
  assert.equal(store.getProduct("B0DISMIS01").discoveryState, "dismissed");

  const moves = store.listMoves(10);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].action, "dismiss");
  assert.equal(moves[0].weight, -1);
  assert.ok(moves[0].canUndo);

  store.undoMoves([{ asin: "B0DISMIS01", eventId: moves[0].eventId }]);
  store.recomputeAll();
  assert.equal(store.getProduct("B0DISMIS01").discoveryState, "new");
  assert.equal(store.counts().discovery, 2);
  assert.equal(store.counts().events, 0);
  store.close();
});
