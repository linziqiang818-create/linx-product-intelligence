import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the furniture selection workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>LINX｜AI Product Intelligence<\/title>/i);
  assert.match(html, /LIN/);
  assert.match(html, /开发机会/);
  assert.match(html, /我的收藏/);
  assert.match(html, /选择全部筛选结果/);
  assert.match(html, /当前开发机会/);
  const paginationSource = readFileSync(new URL("../app/pagination-core.ts", import.meta.url), "utf8");
  assert.match(paginationSource, /PRODUCT_PAGE_SIZE\s*=\s*90/);
  assert.match(paginationSource, /MAX_PRODUCT_PAGE_SIZE\s*=\s*150/);
  assert.match(paginationSource, /PRODUCT_PAGE_SIZE_OPTIONS\s*=\s*\[60,\s*90,\s*150\]/);
  const products = JSON.parse(readFileSync(new URL("../public/real-products.json", import.meta.url), "utf8"));
  assert.ok(products.length > 2_000);
  assert.ok(products.every((product) => /^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]{10}$/.test(product.sourceUrl)));
});

test("every product-bearing navigation uses the shared capped paginator", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const garbage = readFileSync(new URL("../app/garbage-bin.tsx", import.meta.url), "utf8");
  const recycle = readFileSync(new URL("../app/recycle-bin.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/<Cards rows=/g) ?? []).length, 5);
  assert.match(page, /function Cards[\s\S]*?pager\.pageItems\.map/);
  assert.match(page, /function Table[\s\S]*?pager\.pageItems\.map/);
  assert.match(garbage, /pager\.pageItems\.map/);
  assert.match(recycle, /pager\.pageItems\.map/);
});

test("product imports are cumulative ASIN updates and cannot replace history", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /按 ASIN 累计追加\/更新/);
  assert.doesNotMatch(source, /importMode|导入后替换当前批次/);
});

test("keeps durable preference actions and removes the redundant candidate-list entry", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/product-decision-actions.tsx", import.meta.url), "utf8");
  assert.match(page, /30天回收站/);
  assert.match(page, /云端学习档案/);
  assert.doesNotMatch(page, /\["候选清单"/);
  assert.match(actions, /\["A", "B", "C", "D"\]/);
  assert.match(actions, /decision-recycle/);
});

test("product decisions keep the current page and every product area exposes favorites", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const garbage = readFileSync(new URL("../app/garbage-bin.tsx", import.meta.url), "utf8");
  const recycle = readFileSync(new URL("../app/recycle-bin.tsx", import.meta.url), "utf8");
  assert.match(page, /usePagination\(rows,paginationKey\)/);
  assert.match(page, /usePagination\(data,"product-library"\)/);
  assert.doesNotMatch(page, /resetKey=rows\.map/);
  assert.match(garbage, /usePagination\(filtered, query\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(recycle, /usePagination\(filtered, query\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(garbage, /className=\{`heart/);
  assert.match(recycle, /className=\{`heart/);
  assert.match(garbage, /category-ellipsis/);
});
