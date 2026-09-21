import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, normalizeProduct } from "../server/db.mjs";
import { imageIdOf, pickCanonical, planImageDedup, vectorDuplicateOf, VECTOR_DUP_COS } from "../server/dedupe.mjs";

const img = (id) => `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`;
const sample = (asin, patch = {}) => ({
  asin,
  title: "Fluted Sideboard Buffet Cabinet with Adjustable Shelves",
  category: "Home & Kitchen:Furniture:Buffets & Sideboards",
  material: "MDF",
  price: 199.99,
  monthlySalesEstimate: { min: 100, max: 199 },
  reviews: 40,
  rating: 4.5,
  packageGrossKg: 30,
  ...patch,
});

test("图片 ID：换尺寸后缀不算换图，非图床链接取不到 ID", () => {
  assert.equal(imageIdOf("https://m.media-amazon.com/images/I/71abcXYZ._AC_SX679_.jpg"), "71abcXYZ");
  assert.equal(imageIdOf("https://m.media-amazon.com/images/I/71abcXYZ._AC_SL1500_.jpg"), imageIdOf("https://m.media-amazon.com/images/I/71abcXYZ._AC_SX679_.jpg"));
  assert.equal(imageIdOf(""), "");
  assert.equal(imageIdOf("https://example.com/pic.jpg"), "");
});

test("代表款挑选：被你动过的优先，其次评论多，最后 ASIN 兜底", () => {
  const plain = { asin: "B0AAAAAAA1", reviews: 10, tier: "", interest: "", packageGrossKg: 0 };
  const followed = { asin: "B0AAAAAAA2", reviews: 1, tier: "brain", interest: "", packageGrossKg: 0 };
  assert.equal(pickCanonical(plain, followed).asin, "B0AAAAAAA2");
  assert.equal(pickCanonical({ ...plain, reviews: 90 }, { ...plain, asin: "B0AAAAAAA0", reviews: 10 }).reviews, 90);
  assert.equal(pickCanonical({ ...plain, asin: "B0B" }, { ...plain, asin: "B0A" }).asin, "B0A");
});

test("同图分组：同 ID 的归一组，无图和独图不参与，已排除的（dismissed）不算代表", () => {
  const rows = [
    sample("B0AAAAAAA1", { imageUrl: img("71same") }),
    sample("B0AAAAAAA2", { imageUrl: img("71same"), reviews: 90 }),
    sample("B0AAAAAAA3", { imageUrl: img("71same") }),
    sample("B0BBBBBBB1", { imageUrl: img("72other") }),
    sample("B0CCCCCCC1", { imageUrl: "" }),
    sample("B0DDDDDDD1", { imageUrl: img("71same"), discoveryState: "dismissed" }),
  ];
  // 调用方（recomputeAll）负责排除 dismissed：一张已放弃的图不能占住代表位
  const hidden = planImageDedup(rows.filter((r) => r.discoveryState !== "dismissed"));
  // 评论最多的 A2 当代表，A1/A3 隐藏
  assert.equal(hidden.get("B0AAAAAAA1"), "B0AAAAAAA2");
  assert.equal(hidden.get("B0AAAAAAA3"), "B0AAAAAAA2");
  assert.equal(hidden.size, 2);
});

test("向量级同图：cos ≥ 0.99 判同图，'像但不确定'不合并", () => {
  const candidates = [{ asin: "B0CANON0001", vec: new Float32Array([1, 0.9, 0.1]) }];
  // 与代表款夹角极小：cos ≈ 0.9999 ≥ 0.99 → 判同图
  const near = new Float32Array([0.999, 0.9, 0.1]);
  assert.ok(vectorDuplicateOf(near, candidates) === "B0CANON0001");
  // cos ≈ 0.946 < 0.99：像但不确定 → 不合并
  const similar = new Float32Array([0.5, 0.9, 0.1]);
  assert.equal(vectorDuplicateOf(similar, candidates), "");
  assert.equal(vectorDuplicateOf(null, candidates), "");
  assert.equal(VECTOR_DUP_COS, 0.99);
});

test("入库即生效：同图变体从三空间与发现箱隐藏，代表款可见，刷新/收藏不受影响", () => {
  const store = createStore(":memory:");
  store.upsertProducts([
    normalizeProduct(sample("B0AAAAAAA1", { imageUrl: img("71same"), reviews: 100 })),
    normalizeProduct(sample("B0AAAAAAA2", { imageUrl: img("71same"), reviews: 10 })),
    normalizeProduct(sample("B0BBBBBBB1", { imageUrl: img("72other") })),
    normalizeProduct(sample("B0NEW00001", { imageUrl: img("71same"), reviews: 1 })),
  ]);
  store.db.prepare("UPDATE products SET discoveryState = 'new' WHERE asin = 'B0NEW00001'").run();
  store.recomputeAll();

  assert.equal(store.getProduct("B0AAAAAAA2").variantOf, "B0AAAAAAA1");
  assert.equal(store.getProduct("B0AAAAAAA1").variantOf, "");
  // 产品库只显示代表款和独图款
  assert.equal(store.listProducts({ space: "1" }).total, 2);
  // 发现箱里同图的待审款也被隐藏
  assert.equal(store.counts().discovery, 0);
  assert.equal(store.counts().variantsHidden, 2);
  assert.equal(store.listDiscoveryRows().length, 0);

  store.close();
});

test("钉住保护：你 👍/收藏过的款永不被藏，反而当代表，把没动过的同图款藏掉", () => {
  const store = createStore(":memory:");
  store.upsertProducts([
    normalizeProduct(sample("B0AAAAAAA1", { imageUrl: img("71same"), reviews: 100 })),
    normalizeProduct(sample("B0AAAAAAA2", { imageUrl: img("71same"), reviews: 10 })),
    normalizeProduct(sample("B0BBBBBBB1", { imageUrl: img("72other") })),
    normalizeProduct(sample("B0BBBBBBB2", { imageUrl: img("72other") })),
  ]);
  // A2/B2 被你动过：钉住 > 评论数，它们当代表；没动过的 A1/B1 隐藏
  store.db.prepare("UPDATE products SET interest = 'interested' WHERE asin = 'B0AAAAAAA2'").run();
  store.db.prepare("UPDATE products SET tier = 'brain' WHERE asin = 'B0BBBBBBB2'").run();
  store.recomputeAll();
  assert.equal(store.getProduct("B0AAAAAAA2").variantOf, "");
  assert.equal(store.getProduct("B0BBBBBBB2").variantOf, "");
  assert.equal(store.getProduct("B0AAAAAAA1").variantOf, "B0AAAAAAA2");
  assert.equal(store.getProduct("B0BBBBBBB1").variantOf, "B0BBBBBBB2");
  assert.equal(store.counts().variantsHidden, 2);
  assert.equal(store.listProducts({ space: "1" }).total, 2);
  store.close();
});
