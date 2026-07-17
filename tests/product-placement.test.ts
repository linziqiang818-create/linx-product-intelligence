import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  auditProductPlacements,
  classifyFormalProduct,
  classifyFormalProductPool,
  type FormalProductRecord,
  type ProductOrigin,
} from "../app/product-placement.ts";

const base: FormalProductRecord = {
  asin: "PLACEMENT01",
  title: "Fluted Craft Station Cabinet with Drawers and Foldable Worktop",
  category: "Craft Room Furniture",
  price: 189,
  monthlySales: 120,
  launchDays: 120,
  salesGrowth: 0.22,
  rating: 4.1,
  reviews: 60,
  packageGrossKg: 24,
  packageDimensionsCm: "95 x 48 x 24 cm",
  material: "Engineered wood and MDF",
  estimatedMargin: 24,
  priceUplift: 5,
  sourceUrl: "https://www.amazon.com/dp/PLACEMENT01",
};

function businessSnapshot(origin: ProductOrigin) {
  const placement = classifyFormalProduct(base, origin);
  return {
    grade: placement.grade,
    destination: placement.destination,
    opportunityTrack: placement.opportunityTrack,
    potential: placement.potential,
    needsData: placement.needsData,
    score: placement.score,
    reasons: placement.reasons,
  };
}

test("uses one classifier for historical, daily, import, real and enriched products", () => {
  const origins: ProductOrigin[] = ["real-products", "historical", "daily", "import", "candidate-enrichment"];
  const snapshots = origins.map(businessSnapshot);
  snapshots.slice(1).forEach((snapshot) => assert.deepEqual(snapshot, snapshots[0]));
});

test("classifies every product without Top N or family capacity limits", () => {
  const products = Array.from({ length: 1205 }, (_, index) => ({ ...base, asin: `UNLIMIT${String(index).padStart(4, "0")}` }));
  const placements = classifyFormalProductPool(products, "historical");
  const audit = auditProductPlacements(placements);
  assert.equal(placements.length, products.length);
  assert.equal(audit.total, products.length);
  assert.equal(audit.traceable, products.length);
  assert.equal(audit.valid, true);
});

test("keeps D exclusive to garbage and reports any opportunity-line leak", () => {
  const rejected = classifyFormalProduct({
    ...base,
    asin: "HARDREJECT",
    title: "Tempered Glass Mirrored Display Cabinet",
    material: "Tempered glass and steel",
  }, "daily");
  assert.equal(rejected.grade, "D");
  assert.equal(rejected.destination, "garbage");
  assert.equal(rejected.opportunityTrack, null);
  assert.equal(auditProductPlacements([rejected]).valid, true);

  const leaked = { ...rejected, destination: "red-ocean-blue" as const, opportunityTrack: "red-ocean-blue" as const };
  const audit = auditProductPlacements([leaked]);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some((error) => error.includes("D 级泄漏")));
});

test("keeps potential, data pending and favorites orthogonal to the B grade and opportunity line", () => {
  const placement = classifyFormalProduct({
    ...base,
    asin: "ORTHOGONAL",
    packageGrossKg: 0,
    packageDimensionsCm: "",
    manualFavorite: true,
  }, "candidate-enrichment");
  assert.equal(placement.grade, "B");
  assert.equal(placement.destination, "blue-ocean-red");
  assert.equal(placement.potential, true);
  assert.equal(placement.needsData, true);
  assert.equal(placement.favorite, true);
  assert.equal(placement.favoriteSource, "manual");
  const audit = auditProductPlacements([placement]);
  assert.equal(audit.overlaps.allThree, 1);
  assert.equal(audit.valid, true);
});

test("maps A, B, C and D to the agreed business meanings", () => {
  const priority = classifyFormalProduct({ ...base, asin: "B0F6BP73WJ", title: "Fluted Coffee Bar Cabinet with Fridge and Wine Storage", category: "Bar Cabinets" }, "historical");
  const normal = classifyFormalProduct(base, "historical");
  const lowInterest = classifyFormalProduct({ ...base, asin: "B0FJ2H1DG6", title: "Metal Loft Bed with Desk and Drawers", category: "Beds" }, "historical");
  const hardReject = classifyFormalProduct({ ...base, asin: "GRADE-D", title: "Heavy Duty Steel Utility Rack", category: "Garage Storage", material: "Powder-coated steel" }, "historical");
  assert.equal(priority.grade, "A");
  assert.equal(normal.grade, "B");
  assert.equal(lowInterest.grade, "C");
  assert.equal(hardReject.grade, "D");
});

test("gives every real product exactly one traceable primary placement", () => {
  const products = JSON.parse(readFileSync(new URL("../app/real-products.json", import.meta.url), "utf8")) as FormalProductRecord[];
  const placements = classifyFormalProductPool(products, "real-products");
  const audit = auditProductPlacements(placements);
  assert.equal(placements.length, products.length);
  assert.equal(audit.traceable, products.length);
  assert.equal(audit.grades.A + audit.grades.B + audit.grades.C + audit.grades.D, products.length);
  assert.equal(Object.values(audit.destinations).reduce((sum, count) => sum + count, 0), products.length);
  assert.equal(audit.valid, true, audit.errors.join("\n"));
});
