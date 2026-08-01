import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collapseProductVariants, normalizedVariantFamilyTitle, productIdentityAsins, variantFamilyKey } from "../app/product-variants.ts";

test("groups size and color SKUs into one product family", () => {
  const products = [
    { asin: "B0GLPSKBTW", parentAsin: "B0GLQ2XJTM", brand: "Evermagin", title: "Evermagin Oak Queen Floating Bed Frame with LED Lights, Fluted 12In High Platform Bed No Headboard, Heavy Duty Mid Century Modern Float Metal Bedframe, No Box Spring Needed (Oak, Queen-12in high)" },
    { asin: "B0GLPYLXB8", parentAsin: "B0GLPYLXB8", brand: "Evermagin", title: "Evermagin Oak King Floating Bed Frame with LED Lights, Fluted 12in High Platform Bed No Headboard, Heavy Duty Mid Century Modern Float Metal Bedframe, No Box Spring Needed (Oak, King-12in high)" },
  ];
  const collapsed = collapseProductVariants(products);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].parentAsin, "B0GLQ2XJTM");
  assert.deepEqual(collapsed[0].variantAsins.sort(), ["B0GLPSKBTW", "B0GLPYLXB8"]);
});

test("keeps unrelated short or weakly described products separate", () => {
  assert.notEqual(
    variantFamilyKey({ asin: "B012345678", title: "Oak Bed" }),
    variantFamilyKey({ asin: "B087654321", title: "Oak Bed" }),
  );
});

test("formal pools contain one record per high-confidence product family", () => {
  for (const file of ["real-products.json", "rejected-products.json"]) {
    const products = JSON.parse(readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8"));
    assert.equal(collapseProductVariants(products).length, products.length, file);
    assert.equal(new Set(products.map(variantFamilyKey)).size, products.length, file);
  }
});

test("the screenshot Evermagin variants normalize to one family", () => {
  const queen = normalizedVariantFamilyTitle("Evermagin Oak Queen Floating Bed Frame with led Lights, Fluted 12In High Platform Bed No Headboard, Heavy Duty Mid Century Modern Float Metal Bedframe, No Box Spring Needed (Oak, Queen-12in high)");
  const king = normalizedVariantFamilyTitle("Evermagin Oak King Floating Bed Frame with led Lights, Fluted 12in High Platform Bed No Headboard, Heavy Duty Mid Century Modern Float Metal Bedframe, No Box Spring Needed (Oak, King-14in high)");
  assert.equal(queen, king);
});

test("keeps parent and child ASINs available for manual feedback migration", () => {
  assert.deepEqual(productIdentityAsins({
    asin: "B0GLPSKBTW",
    parentAsin: "B0GLQ2XJTM",
    variantAsins: ["B0GLPSKBTW", "B0GLPSZHDR", "B0GLPYLXB8"],
    title: "Evermagin Floating Bed Frame",
  }).sort(), ["B0GLPSKBTW", "B0GLPSZHDR", "B0GLPYLXB8", "B0GLQ2XJTM"]);
});
