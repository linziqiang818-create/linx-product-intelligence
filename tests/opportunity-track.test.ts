import assert from "node:assert/strict";
import test from "node:test";
import { classifyOpportunityTrack } from "../app/opportunity-track.ts";

const assessment = { companyFit: 82, hiddenOpportunity: 65, demand: 55, hardRejected: false };

test("puts styled mainstream cabinets into red-ocean blue opportunities", () => {
  const result = classifyOpportunityTrack({ title: "Fluted Arched Sideboard Cabinet", category: "Sideboard", price: 189, reviews: 44, rating: 4.4 }, assessment);
  assert.equal(result.track, "red-ocean-blue");
  assert.ok(result.reasons.some((reason) => reason.includes("造型") || reason.includes("门板")));
});

test("puts niche scenario furniture into blue-ocean red opportunities", () => {
  const result = classifyOpportunityTrack({ title: "Laundry Washer Dryer Workstation with Storage", category: "Laundry Furniture", price: 219, reviews: 18, rating: 4.2 }, assessment);
  assert.equal(result.track, "blue-ocean-red");
  assert.ok(result.reasons.some((reason) => reason.includes("洗衣")));
});

test("does not force ordinary commodity furniture into either opportunity track", () => {
  const result = classifyOpportunityTrack({ title: "Standard 5 Shelf Bookcase", category: "Bookcase", price: 119, reviews: 400, rating: 4.5 }, assessment);
  assert.equal(result.track, "unmatched");
});
