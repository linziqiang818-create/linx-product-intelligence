import assert from "node:assert/strict";
import test from "node:test";
import { hasImportCellValue, prepareProductImport, type ProductImportPatch } from "../app/product-import.ts";

type Product = {
  asin: string;
  title: string;
  imageUrl?: string;
  importedAt?: string;
  price: number;
  reviews: number;
  note: string;
  material: string;
};

const existing: Product = {
  asin: "B0OLD00001",
  title: "Existing Fluted Cabinet",
  imageUrl: "https://images.example.com/old.jpg",
  importedAt: "2026-07-01T00:00:00.000Z",
  price: 159.99,
  reviews: 88,
  note: "保留人工备注",
  material: "Engineered wood",
};

function patch(product: Product, providedFields: Array<keyof Product>, rowNumber: number): ProductImportPatch<Product> {
  return { product, providedFields, rowNumber };
}

test("treats numeric zero as provided but empty strings as missing", () => {
  assert.equal(hasImportCellValue(0), true);
  assert.equal(hasImportCellValue("  "), false);
  assert.equal(hasImportCellValue(undefined), false);
});

test("updates an old ASIN with provided fields without erasing old evidence", () => {
  const preview = prepareProductImport([existing], [patch({
    ...existing,
    imageUrl: "",
    price: 169.99,
    reviews: 0,
    note: "",
    material: "",
    importedAt: "2026-08-10T00:00:00.000Z",
  }, ["price", "reviews", "importedAt"], 2)]);
  const updated = preview.rows[0].product;
  assert.equal(preview.updateCount, 1);
  assert.equal(updated.price, 169.99);
  assert.equal(updated.reviews, 0);
  assert.equal(updated.note, existing.note);
  assert.equal(updated.material, existing.material);
  assert.equal(updated.imageUrl, existing.imageUrl);
  assert.equal(preview.missingImageCount, 0);
});

test("keeps a new missing-image product importable and marks it for follow-up", () => {
  const preview = prepareProductImport([], [patch({
    asin: "B0NEW00001",
    title: "New Craft Storage Workstation",
    imageUrl: "",
    price: 229,
    reviews: 12,
    note: "",
    material: "MDF",
  }, ["asin", "title", "price", "reviews", "material"], 3)]);
  assert.equal(preview.newCount, 1);
  assert.equal(preview.missingImageCount, 1);
  assert.equal(preview.rows[0].missingImage, true);
  assert.equal(preview.skippedRows.length, 0);
});

test("coalesces duplicate spreadsheet rows using the last non-empty fields", () => {
  const first = patch({ ...existing, asin: "B0DUP00001", title: "Duplicate Cabinet", price: 149, note: "第一行备注" }, ["asin", "title", "price", "note", "imageUrl"], 2);
  const second = patch({ ...first.product, price: 179, note: "", material: "MDF and metal" }, ["price", "material"], 5);
  const preview = prepareProductImport([], [first, second]);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.duplicateRowCount, 1);
  assert.deepEqual(preview.rows[0].rowNumbers, [2, 5]);
  assert.equal(preview.rows[0].product.price, 179);
  assert.equal(preview.rows[0].product.note, "第一行备注");
  assert.equal(preview.rows[0].product.material, "MDF and metal");
});

test("allows a partial update without a title but skips a titleless new ASIN", () => {
  const oldUpdate = patch({ ...existing, title: "", price: 179 }, ["price"], 2);
  const newWithoutTitle = patch({ ...existing, asin: "B0NEW00002", title: "", price: 199 }, ["asin", "price"], 3);
  const preview = prepareProductImport([existing], [oldUpdate, newWithoutTitle]);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].product.title, existing.title);
  assert.equal(preview.skippedRows.length, 1);
  assert.match(preview.skippedRows[0].reason, /英文标题/);
});
