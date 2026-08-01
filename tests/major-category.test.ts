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

test("uses the Amazon category path before misleading title words", () => {
  assert.equal(majorCategoryFor({
    title: "Wooden Raised Bed with Storage for Large Dogs",
    category: "Pet Supplies:Dogs:Beds & Furniture:Beds",
  }).id, "pet-furniture");
  assert.equal(majorCategoryFor({
    title: "Modern Sideboard Style Storage Console for TV",
    category: "Home & Kitchen:Furniture:Living Room Furniture:TV & Media Furniture:Television Stands & Entertainment Centers",
  }).id, "tv-media");
  assert.equal(majorCategoryFor({
    title: "Wood Storage Cabinet with Doors",
    category: "Home & Kitchen:Furniture:Dining Room Furniture:Buffets & Sideboards",
  }).id, "sideboards-buffets");
});

test("never uses the title when the Amazon category is missing or unrecognized", () => {
  assert.equal(majorCategoryFor({ title: "Modern Reception Desk with Locking Drawers", category: "Legacy import" }).id, "unclassified");
  assert.equal(majorCategoryFor({ title: "Modern Reception Desk with Locking Drawers", category: "" }).id, "unclassified");
  assert.equal(majorCategoryFor({ title: "Cat Litter Box Cabinet", category: "宠物场景 / 猫砂柜" }).id, "unclassified");
});

test("allows a manual LINX category only while Amazon category evidence is unclassified", () => {
  assert.equal(majorCategoryFor({
    title: "Modern Reception Desk",
    category: "Legacy import",
    manualMajorCategoryId: "reception-furniture",
  }).id, "reception-furniture");
  assert.equal(majorCategoryFor({
    title: "Modern Reception Desk",
    category: "Home & Kitchen:Furniture:Kitchen Furniture:Storage Islands & Carts",
    manualMajorCategoryId: "reception-furniture",
  }).id, "kitchen-islands");
  assert.equal(majorCategoryFor({
    title: "Modern Reception Desk",
    category: "Legacy import",
    manualMajorCategoryId: "not-a-real-category",
  }).id, "unclassified");
});

test("collapses the full product pool into a manageable complete category list", () => {
  const files = ["../app/real-products.json", "../app/rejected-products.json"];
  const products = files.flatMap((path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")));
  const present = presentMajorCategories(products);
  assert.equal(present.reduce((sum, category) => sum + category.count, 0), products.length);
  assert.ok(present.length <= 22);
  assert.ok(present.length >= 10);
});
