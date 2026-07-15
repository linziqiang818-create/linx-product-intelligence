import assert from "node:assert/strict";
import test from "node:test";
import { diversifyOpportunityRows, opportunityFamily, opportunityFamilyCount } from "../app/opportunity-diversity.ts";

const products = [
  { asin: "BOOK-1", title: "Arched Bookcase", category: "Bookcases" },
  { asin: "BOOK-2", title: "Fluted Bookshelf", category: "Bookcases" },
  { asin: "BOOK-3", title: "Rounded Display Cabinet", category: "Bookcases" },
  { asin: "NAIL-1", title: "Manicure Nail Desk", category: "Salon" },
  { asin: "PET-1", title: "Reptile Terrarium Furniture", category: "Pet" },
];

test("identifies product families instead of treating every cabinet as one category", () => {
  assert.equal(opportunityFamily(products[0]), "书架与展示柜");
  assert.equal(opportunityFamily(products[3]), "美甲与沙龙工作台");
  assert.equal(opportunityFamilyCount(products), 3);
});

test("round-robins families and can cap near-identical products", () => {
  const diversified = diversifyOpportunityRows(products, 2);
  assert.deepEqual(diversified.map((product) => product.asin), ["BOOK-1", "NAIL-1", "PET-1", "BOOK-2"]);
});
