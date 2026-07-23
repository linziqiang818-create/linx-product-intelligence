import assert from "node:assert/strict";
import test from "node:test";
import { emptyLearningState } from "../app/learning-state.ts";
import { buildLearnedGradeMap } from "../app/preference-learning.ts";

const products = [
  { asin: "A1", title: "Fluted Coffee Bar Cabinet", category: "Bar Cabinets" },
  { asin: "A2", title: "Arched Coffee Bar Cabinet", category: "Bar Cabinets" },
  { asin: "A3", title: "Rattan Coffee Bar Cabinet", category: "Bar Cabinets" },
  { asin: "NEW", title: "Modern Coffee Bar Cabinet", category: "Bar Cabinets" },
];

test("learns a repeated family preference after three explicit examples", () => {
  const state = emptyLearningState();
  state.gradeOverrides = Object.fromEntries(["A1", "A2", "A3"].map((asin) => [asin, { grade: "A" as const, updatedAt: "2026-07-23T00:00:00.000Z" }]));
  const learned = buildLearnedGradeMap(products, state).get("NEW");
  assert.deepEqual(learned, { grade: "A", family: "咖啡吧与酒柜", evidenceCount: 3 });
});

test("does not generalize sparse feedback or D disposal decisions", () => {
  const sparse = emptyLearningState();
  sparse.gradeOverrides = Object.fromEntries(["A1", "A2"].map((asin) => [asin, { grade: "C" as const, updatedAt: "2026-07-23T00:00:00.000Z" }]));
  assert.equal(buildLearnedGradeMap(products, sparse).get("NEW"), undefined);

  const disposed = emptyLearningState();
  disposed.gradeOverrides = Object.fromEntries(["A1", "A2", "A3"].map((asin) => [asin, { grade: "D" as const, updatedAt: "2026-07-23T00:00:00.000Z" }]));
  assert.equal(buildLearnedGradeMap(products, disposed).get("NEW"), undefined);
});
