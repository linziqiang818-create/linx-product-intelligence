import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, normalizeProduct } from "../server/db.mjs";
import { parseSearchPage, parseDetailPage, prefilterCandidate, runDiscovery, getLedger, normalizeDiscoveryConfig } from "../server/discover.mjs";

// 与真实 Amazon 页面结构一致的合成样本（2026-09-18 用 B0F6CNTRHW 实测的字段形态）
// 与真实 Amazon 搜索页结构一致：![标题alt](主图) ](/slug/dp/ASIN/ref=...)
const SEARCH_MD = `
[
![Furistic Fluted Sideboard Cabinet with Storage, 71inch Tall Arched, Black](https://m.media-amazon.com/images/I/61abc123._AC_SX679_.jpg)
](/Furistic-Sideboard-Cabinet-Storage/dp/B0NEW00001/ref=sr_1_1?dib=xxx&keywords=sideboard)

$199.99
4.5 out of 5 stars
(230)

[
![Hostack Kitchen Pantry Storage Cabinet with Doors and Shelves, White](https://m.media-amazon.com/images/I/62xyz._AC_SX679_.jpg)
](/Hostack-Pantry-Cabinet/dp/B0OLDDD002/ref=sr_1_2?keywords=sideboard)

$1,299.99
4.2 out of 5 stars
(58)

[
![Amazon Basics Stainless Steel Water Bottle with Straw, 40oz](https://m.media-amazon.com/images/I/63water._AC_SX679_.jpg)
](/Amazon-Basics-Bottle/dp/B0NOTHING3/ref=sr_1_3)
$24.95

[
![Existing Fluted Sideboard Cabinet Black](https://m.media-amazon.com/images/I/64exist._AC_SX679_.jpg)
](/Existing-Sideboard/dp/B0EXIST001/ref=sr_1_4)
$159.99
`;

const DETAIL_MD = `
Amazon.com: Furistic Arched Storage Cabinet 71inch Tall Bookcase with Doors, Black : Home & Kitchen
*   ![Furistic Arched Storage Cabinet 71inch Tall Bookcase with Doors, Black](https://m.media-amazon.com/images/I/71abcXYZ._AC_SY300_SX300_QL70_FMwebp_.jpg)
*   ![](https://m.media-amazon.com/images/I/41thumb._AC_US100_.jpg)
Amazon's Choice
100+ bought in past month
$199.99
$29.99 per count($29.99$29.99 / count)
[4.4 _4.4 out of 5 stars_](javascript:void(0)) [(151)](#averageCustomerReviewsAnchor)
Best Sellers Rank
*   #20,279 in Home & Kitchen ([See Top 100](/gp/bestsellers/home-garden))
*   #33 in [Bookcases](/gp/bestsellers/home-garden/10824421)
ASIN
B0NEW00001
Item Weight
101 pounds
Item Dimensions D x W x H
15.7"D x 31.5"W x 81.1"H
Manufacturer
UPOSOJA
`;

test("搜索页解析：ASIN 去重、块内取价格评分评论数，主图升高清", () => {
  const items = parseSearchPage(SEARCH_MD);
  assert.equal(items.length, 4);
  assert.deepEqual(items[0], {
    asin: "B0NEW00001",
    title: "Furistic Fluted Sideboard Cabinet with Storage, 71inch Tall Arched, Black",
    imageUrl: "https://m.media-amazon.com/images/I/61abc123._AC_SL1500_.jpg",
    price: 199.99,
    rating: 4.5,
    reviews: 230,
  });
  assert.equal(items[1].price, 1299.99);
  assert.equal(items[1].title, "Hostack Kitchen Pantry Storage Cabinet with Doors and Shelves, White");
});

test("详情页解析：标题/主图/主价格/评分/BSR/重量/尺寸/月销粗值", () => {
  const d = parseDetailPage(DETAIL_MD, "B0NEW00001");
  assert.equal(d.title, "Furistic Arched Storage Cabinet 71inch Tall Bookcase with Doors, Black");
  // 主图锚定带长 alt 的图库图（空 alt 缩略图不选），并升级成 SL1500 高清
  assert.ok(d.imageUrl.includes("71abcXYZ._AC_SL1500_"), d.imageUrl);
  assert.equal(d.price, 199.99);
  assert.equal(d.rating, 4.4);
  assert.equal(d.reviews, 151);
  assert.equal(d.bsr, 20279);
  assert.equal(d.category, "Bookcases");
  assert.equal(d.weightLb, 101);
  assert.equal(d.dimensions, "15.7 x 31.5 x 81.1 inches");
  assert.equal(d.boughtPastMonth, "100");
  assert.equal(d.brand, "UPOSOJA");
});

test("详情页价格兜底：双写价优先，延保费不误抓", () => {
  assert.equal(parseDetailPage("Amazon.com: Some Cabinet : Home & Kitchen\n$16.99/month\n$288.00\n$28.00 per count", "X").price, 288);
  // 真实坑：页面没有 bought 字样，延保费排在真价格前面
  const md = "Amazon.com: Some Cabinet : Home & Kitchen\n2-Year Protection Plan $37.99\n$199.99$199.99\nFREE delivery";
  assert.equal(parseDetailPage(md, "X").price, 199.99);
});

test("预筛：价格出带 / 明显不做 / 不像板式家具的都拦下，省详情页额度", () => {
  const config = normalizeDiscoveryConfig({});
  assert.equal(prefilterCandidate({ asin: "A", title: "Furistic Fluted Sideboard Cabinet with Storage Black", price: 199.99 }, config).ok, true);
  assert.equal(prefilterCandidate({ asin: "B", title: "Hostack Kitchen Pantry Storage Cabinet White", price: 1299.99 }, config).ok, false);
  assert.equal(prefilterCandidate({ asin: "C", title: "Modern Fabric Sectional Sofa Couch for Living Room", price: 499 }, config).ok, false);
  assert.equal(prefilterCandidate({ asin: "D", title: "Stainless Steel Water Bottle with Straw Lid 40oz", price: 24.95 }, config).ok, false);
  assert.equal(prefilterCandidate({ asin: "E", title: "Short title", price: 0 }, config).ok, false);
});

test("runDiscovery：额度记账、已存在跳过、新产品进发现箱", async () => {
  const store = createStore(":memory:");
  store.upsertProducts([normalizeProduct({ asin: "B0EXIST001", title: "Existing Fluted Sideboard Cabinet Black" })]);
  let searchCalls = 0;
  const fetchPage = async (url) => {
    if (url.includes("/s?k=")) {
      searchCalls++;
      return SEARCH_MD.replace(/B0NEW00001/g, "B0NEW0000" + searchCalls).replace("B0OLDDD002", "B0OLDDD00" + searchCalls);
    }
    return DETAIL_MD.replace(/B0NEW00001/g, url.match(/B0[A-Z0-9]{8}/)[0]);
  };
  const config = { keywords: ["sideboard"], dailySearchLimit: 5, dailyDetailLimit: 5, maxPerKeyword: 10 };
  const report = await runDiscovery(store, fetchPage, { config, now: Date.now(), delayMs: 1 });
  assert.equal(report.searchRequests, 1);
  // B0EXISTING1 跳过、水瓶预筛拦下、B0OLDDD002 价格 $1,299 出带 → 只细看 1 款
  assert.equal(report.detailRequests, 1);
  assert.equal(report.kept, 1);
  assert.equal(report.keywords[0].skippedExisting, 1);
  const row = store.getProduct("B0NEW00001");
  assert.ok(row);
  assert.equal(row.discoveryState, "new");
  assert.equal(row.packageGrossKg, 45.8); // 101 lb → 45.8 kg（normalizeProduct 换算）
  assert.equal(row.monthlySales, 100);
  assert.equal(store.counts().discovery, 1);
  // 发现箱产品不进常规空间（B0EXIST001 正常导入并重算后归第二大脑，待审的 B0NEW00001 不出现）
  assert.equal(store.listProducts({ space: "1" }).total, 1);
  assert.ok(!store.listProducts({ space: "3" }).rows.some((r) => r.asin === "B0NEW00001"));
  assert.equal(getLedger(store).detail, 1);
  store.close();
});

test("详情额度用完就停：剩下的候选不烧 credit", async () => {
  const store = createStore(":memory:");
  const twoGood = SEARCH_MD.replace("B0OLDDD002", "B0GOOD00002").replace("$1,299.99", "$259.99");
  const fetchPage = async (url) => (url.includes("/s?k=") ? twoGood : DETAIL_MD);
  const report = await runDiscovery(store, fetchPage, { config: { keywords: ["sideboard"], dailySearchLimit: 5, dailyDetailLimit: 1, maxPerKeyword: 10 }, now: Date.now(), delayMs: 1 });
  assert.equal(report.detailRequests, 1);
  assert.ok(report.errors.some((e) => e.includes("详情额度用完")));
  assert.equal(store.counts().discovery, 1);
  store.close();
});

test("收进来 → 规则重新归位；不要 → 永久静默", async () => {
  const store = createStore(":memory:");
  store.upsertProducts([normalizeProduct({ asin: "B0NEW00001", title: "Furistic Arched Storage Cabinet with Doors Black" })]);
  store.db.prepare("UPDATE products SET discoveryState = 'new' WHERE asin = 'B0NEW00001'").run();
  assert.equal(store.counts().discovery, 1);
  store.promoteDiscoveries(["B0NEW00001"]);
  store.recomputeAll();
  assert.equal(store.counts().discovery, 0);
  assert.equal(store.getProduct("B0NEW00001").placement, "pass");
  // 通过硬性规则的产品重新出现在常规空间
  assert.equal(store.listProducts({ space: "1" }).total, 1);

  store.upsertProducts([normalizeProduct({ asin: "B0DISMISS01", title: "Another Fluted Storage Cabinet White" })]);
  store.db.prepare("UPDATE products SET discoveryState = 'new' WHERE asin = 'B0DISMISS01'").run();
  store.dismissDiscoveries(["B0DISMISS01"]);
  store.recomputeAll();
  assert.equal(store.counts().discovery, 0);
  assert.equal(store.listProducts({ space: "1" }).total, 1); // 已放弃的不再出现在任何空间
  assert.equal(store.getProduct("B0DISMISS01").discoveryState, "dismissed");
  store.close();
});

test("跟进刷新：收藏/感兴趣/第二大脑里最久没看的先刷，身份字段不动", async () => {
  const store = createStore(":memory:");
  store.upsertProducts([
    normalizeProduct({ asin: "B0FOLLOW001", title: "Furistic Fluted Sideboard Cabinet Black", category: "Storage Sideboards", observedAt: "2026-08-01T00:00:00.000Z" }),
    normalizeProduct({ asin: "B0FOLLOW002", title: "Hostack Arched Pantry Cabinet White", category: "Storage Pantries" }),
    normalizeProduct({ asin: "B0RANDOM999", title: "Ordinary Storage Cabinet Nobody Follows" }),
  ]);
  store.db.prepare("UPDATE products SET interest = 'interested' WHERE asin = 'B0FOLLOW001'").run();
  store.db.prepare("UPDATE products SET tier = 'brain' WHERE asin = 'B0FOLLOW002'").run();

  const fetchPage = async (url) => {
    if (!url.includes("/dp/")) throw new Error("不该发搜索请求：keywords 为空");
    return DETAIL_MD;
  };
  const config = { keywords: [], dailySearchLimit: 5, dailyDetailLimit: 5, dailyRefreshLimit: 5 };
  const report = await runDiscovery(store, fetchPage, { config, now: Date.parse("2026-09-21T10:00:00Z"), delayMs: 1 });
  assert.equal(report.refreshTotal, 2);
  assert.equal(report.refreshed, 2);
  assert.equal(report.searchRequests, 0);

  const refreshed = store.getProduct("B0FOLLOW001");
  assert.equal(refreshed.price, 199.99); // 市场字段更新
  assert.equal(refreshed.monthlySales, 100);
  assert.equal(refreshed.observedAt, "2026-09-21T10:00:00.000Z");
  assert.equal(refreshed.title, "Furistic Fluted Sideboard Cabinet Black"); // 身份字段不被 BSR 文案覆盖
  assert.equal(refreshed.category, "Storage Sideboards");
  assert.equal(refreshed.interest, "interested");
  assert.equal(store.getProduct("B0RANDOM999").observedAt, ""); // 没跟进的不烧额度

  // 只给 1 次额度：从没刷过的（observedAt 为空）优先
  const store2 = createStore(":memory:");
  store2.upsertProducts([
    normalizeProduct({ asin: "B0FOLLOW001", title: "Furistic Fluted Sideboard Cabinet Black", observedAt: "2026-08-01T00:00:00.000Z" }),
    normalizeProduct({ asin: "B0FOLLOW002", title: "Hostack Arched Pantry Cabinet White" }),
  ]);
  store2.db.prepare("UPDATE products SET interest = 'interested'").run();
  const report2 = await runDiscovery(store2, fetchPage, { config: { keywords: [], dailySearchLimit: 5, dailyDetailLimit: 5, dailyRefreshLimit: 1 }, now: Date.now(), delayMs: 1 });
  assert.equal(report2.refreshed, 1);
  assert.equal(store2.getProduct("B0FOLLOW002").price, 199.99);
  assert.equal(store2.getProduct("B0FOLLOW001").price, 0);
  store.close();
  store2.close();
});

test("月度硬停：总额到顶一个请求都不发，跨月自动归零", async () => {
  const store = createStore(":memory:");
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  store.kvSet("discoveryLedger", { date: today, month, search: 0, detail: 0, monthTotal: 4000 });
  let called = 0;
  const fetchPage = async () => { called++; return SEARCH_MD; };
  const config = { keywords: ["sideboard"], dailySearchLimit: 5, dailyDetailLimit: 30, dailyRefreshLimit: 5, monthlyRequestCap: 4000 };
  const report = await runDiscovery(store, fetchPage, { config, now: Date.now(), delayMs: 1 });
  assert.equal(called, 0);
  assert.equal(report.searchRequests + report.detailRequests, 0);
  assert.ok(report.errors.some((e) => e.includes("月度额度已用完")));

  // 跨月：台账月份是上个月 → 月总额清零，采集恢复
  store.kvSet("discoveryLedger", { date: today, month: "2026-08", search: 0, detail: 0, monthTotal: 4000 });
  const report2 = await runDiscovery(store, fetchPage, { config, now: Date.now(), delayMs: 1 });
  assert.ok(report2.searchRequests > 0);
  assert.equal(getLedger(store).monthTotal, report2.searchRequests + report2.detailRequests);
  store.close();
});
