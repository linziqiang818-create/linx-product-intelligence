import assert from "node:assert/strict";
import test from "node:test";
import { minimumFormalAdmission } from "../app/formal-admission.ts";

const base = {
  asin: "B0DGKJH39D",
  title: "Smart FENDEE Shoe Storage Cabinet with Fluted Doors and Metal Legs",
  amazonUrl: "https://www.amazon.com/dp/B0DGKJH39D",
  discoverySource: "https://example.com/public-product/B0DGKJH39D",
  category: "Entryway Shoe Cabinets",
};

test("minimum gate accepts a traceable non-D listing while commercial fields are missing", () => {
  assert.deepEqual(minimumFormalAdmission(base), {
    eligible: true,
    canonicalAmazonUrl: base.amazonUrl,
    issues: [],
  });
});

test("minimum gate rejects invalid identity, incomplete title, link, evidence, or grade D", () => {
  assert.equal(minimumFormalAdmission({ ...base, asin: "bad" }).eligible, false);
  assert.equal(minimumFormalAdmission({ ...base, title: "Cabinet" }).eligible, false);
  assert.equal(minimumFormalAdmission({ ...base, amazonUrl: "https://www.amazon.com/s?k=cabinet" }).eligible, false);
  assert.equal(minimumFormalAdmission({ ...base, discoverySource: undefined, category: undefined }).eligible, false);
  assert.equal(minimumFormalAdmission(base, true).eligible, false);
});
