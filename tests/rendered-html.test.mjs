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
  assert.match(html, /机会筛选/);
  assert.match(html, /收藏夹/);
  assert.match(html, /选择当前结果/);
  assert.match(html, /个进入初筛排名/);
  const products = JSON.parse(readFileSync(new URL("../public/real-products.json", import.meta.url), "utf8"));
  assert.ok(products.length > 2_000);
  assert.ok(products.every((product) => /^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]{10}$/.test(product.sourceUrl)));
});
