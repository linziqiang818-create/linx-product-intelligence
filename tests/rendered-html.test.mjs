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

test("card and D-list pagination can select only the current page", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const garbage = readFileSync(new URL("../app/garbage-bin.tsx", import.meta.url), "utf8");
  const pagination = readFileSync(new URL("../app/pagination.tsx", import.meta.url), "utf8");
  assert.match(page, /pageSelection=\{\{checked:pager\.pageItems\.length/);
  assert.match(page, /toggleSelected\(p\.asin\)/);
  assert.match(garbage, /selectVisible\(pager\.pageItems, checked\)/);
  assert.match(pagination, /全选当前页/);
  assert.match(pagination, /取消当前页/);
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

test("syncs learning decisions as bounded cloud patches instead of whole profiles", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(page, /method:"PATCH"/);
  assert.match(page, /splitLearningPatch/);
  assert.match(page, /fetchCloudLearningMeta/);
  assert.match(page, /setInterval\(\(\)=>\{void pull\(\)\},5000\)/);
  assert.match(page, /learningPatchCount\(createLearningPatch\(latestLearning\.current,cloudLearning\.current\)\)/);
  assert.doesNotMatch(page, /body:JSON\.stringify\(\{state:next\}\)/);
  assert.match(worker, /linx_learning_entries/);
  assert.match(worker, /ON CONFLICT\(kind, entry_key\) DO UPDATE/);
  assert.doesNotMatch(worker, /SET payload = \?1, revision = revision \+ 1/);
  assert.match(worker, /searchParams\.get\("meta"\) === "1"/);
});

test("syncs product imports and edits as per-ASIN cloud records", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(page, /queueWorkspaceProducts\(incoming,"active",importedAt\)/);
  assert.match(page, /queueWorkspaceProducts\(\[normalized\]\)/);
  assert.match(page, /linx-product-overrides-v1/);
  assert.match(page, /fetchCloudWorkspaceMeta/);
  assert.match(worker, /linx_product_overrides/);
  assert.match(worker, /excluded\.updated_at > linx_product_overrides\.updated_at/);
});

test("unclassified products expose a durable bilingual manual category control", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../app/manual-major-category.tsx", import.meta.url), "utf8");
  const learning = readFileSync(new URL("../app/learning-state.ts", import.meta.url), "utf8");
  assert.match(page, /ManualCategoryProvider/);
  assert.match(page, /kind:"category"/);
  assert.match(picker, /未分类 · 手动归类/);
  assert.match(picker, /category\.zh.*category\.en/);
  assert.match(learning, /categoryOverrides/);
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

test("multi-select supports bulk A B C D and recycle across review pages", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const garbage = readFileSync(new URL("../app/garbage-bin.tsx", import.meta.url), "utf8");
  assert.match(page, /const gradeSelected=\(grade:Grade\)/);
  assert.match(page, /const recycleSelected=\(\)=>/);
  assert.match(page, /\(\["A","B","C","D"\] as Grade\[\]\)\.map/);
  assert.match(page, /批量回收/);
  assert.match(page, /kind:"grade"/);
  assert.match(page, /kind:"recycle"/);
  assert.match(garbage, /onGradeSelected/);
  assert.match(garbage, /onRecycleSelected/);
  assert.match(garbage, /toggleSelected/);
});
