import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { majorCategories, majorCategoryFor, majorCategoryLabel, presentMajorCategories } from "../app/major-category.ts";

const examples = [
  ["Fluted Buffet Cabinet", "Home & Kitchen:Furniture:Dining Room Furniture:Buffets & Sideboards", "sideboards-buffets"],
  ["Arched Bookshelf", "Home & Kitchen:Furniture:Home Office Furniture:Bookcases", "bookcases-display"],
  ["Rolling Kitchen Island", "Home & Kitchen:Furniture:Kitchen Furniture:Storage Islands & Carts", "kitchen-islands"],
  ["Modern Reception Desk", "Office Products:Office Furniture & Lighting:Tables:Reception Room Tables", "reception-furniture"],
] as const;

test("maps representative Amazon furniture nodes to stable bilingual major categories", () => {
  for (const [title, category, expected] of examples) {
    const product = { title, category };
    assert.equal(majorCategoryFor(product).id, expected);
    assert.match(majorCategoryLabel(product), /.+ \/ .+/);
  }
  assert.ok(majorCategories.every((category) => category.zh && category.en));
});

test("collapses the full product pool into a manageable complete category list", () => {
  const files = ["../app/real-products.json", "../app/rejected-products.json"];
  const products = files.flatMap((path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")));
  const present = presentMajorCategories(products);
  assert.equal(present.reduce((sum, category) => sum + category.count, 0), products.length);
  assert.ok(present.length <= 21);
  assert.ok(present.length >= 10);
});
