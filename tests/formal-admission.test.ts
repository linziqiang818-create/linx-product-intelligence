import assert from "node:assert/strict";
import test from "node:test";
import { minimumFormalAdmission } from "../app/formal-admission.ts";

const base = {
  asin: "B0DGKJH39D",
  title: "Smart FENDEE Shoe Storage Cabinet with Fluted Doors and Metal Legs",
  amazonUrl: "https://www.amazon.com/dp/B0DGKJH39D",
  discoverySource: "https://example.com/public-product/B0DGKJH39D",
  category: "Entryway Shoe Cabinets",
  imageUrl: "https://m.media-amazon.com/images/I/example.jpg",
};

test("minimum gate accepts a traceable non-D listing while commercial fields are missing", () => {
  assert.deepEqual(minimumFormalAdmission(base), {
    eligible: true,
    canonicalAmazonUrl: base.amazonUrl,
    issues: [],
  });
});

test("minimum gate accepts an ASIN-linked public catalog MAIN image with traceable evidence", () => {
  const record={...base,imageUrl:"https://catalog.example/image/B0DGKJH39D/main.jpg",imageEvidence:{kind:"public-catalog-main-image",sourceUrl:"https://catalog.example/products/B0DGKJH39D",asin:base.asin}};
  assert.equal(minimumFormalAdmission(record).eligible,true);
});

test("minimum gate rejects invalid identity, incomplete title, link, evidence, or grade D", () => {
  assert.equal(minimumFormalAdmission({ ...base, asin: "bad" }).eligible, false);
  assert.equal(minimumFormalAdmission({ ...base, title: "Cabinet" }).eligible, false);
  assert.equal(minimumFormalAdmission({ ...base, amazonUrl: "https://www.amazon.com/s?k=cabinet" }).eligible, false);
  assert.equal(minimumFormalAdmission({ ...base, imageUrl: "https://example.com/image.jpg", discoverySource: undefined, category: undefined }).eligible, false);
  assert.equal(minimumFormalAdmission({ ...base, imageUrl: undefined }).eligible, false);
  assert.equal(minimumFormalAdmission(base, true).eligible, false);
});
