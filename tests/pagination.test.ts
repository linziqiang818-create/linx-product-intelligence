import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PRODUCT_PAGE_SIZE,
  PRODUCT_PAGE_SIZE,
  PRODUCT_PAGE_SIZE_OPTIONS,
  paginateItems,
} from "../app/pagination-core.ts";

const products = Array.from({ length: 2_551 }, (_, index) => index + 1);

test("defaults to a shorter sixty-product page and never exceeds 150 products", () => {
  assert.equal(PRODUCT_PAGE_SIZE, 60);
  assert.equal(MAX_PRODUCT_PAGE_SIZE, 150);
  assert.deepEqual(PRODUCT_PAGE_SIZE_OPTIONS, [30, 60, 90, 150]);
  assert.equal(paginateItems(products, 1, PRODUCT_PAGE_SIZE).pageItems.length, 60);
  assert.equal(paginateItems(products, 1, 999).pageItems.length, 150);
});

test("clamps page navigation and keeps the final page within the selected size", () => {
  const finalPage = paginateItems(products, 999, 90);
  assert.equal(finalPage.page, finalPage.totalPages);
  assert.ok(finalPage.pageItems.length > 0);
  assert.ok(finalPage.pageItems.length <= 90);
  assert.equal(finalPage.end, products.length);
});
