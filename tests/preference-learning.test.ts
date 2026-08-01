import assert from "node:assert/strict";
import test from "node:test";
import { appendLearningEvent, emptyLearningState, recycleProduct, setPreferenceRuleStatus } from "../app/learning-state.ts";
import { buildLearnedGradeMap, buildPreferenceRules, buildPreferenceSignalRules } from "../app/preference-learning.ts";

const products = Array.from({ length: 6 }, (_, index) => ({
  asin: `NEW${index}`,
  title: `Fluted Storage Cabinet ${index}`,
  category: "Storage Cabinets",
}));

function learnedState(count = 5) {
  let state = emptyLearningState("2026-07-01T00:00:00.000Z");
  for (let index = 0; index < count; index++) {
    const createdAt = `2026-07-${String(index < 3 ? 1 : 2).padStart(2, "0")}T0${index}:00:00.000Z`;
    state = {
      ...state,
      gradeOverrides: { ...state.gradeOverrides, [`NEW${index}`]: { grade: "A", updatedAt: createdAt } },
    };
    state = appendLearningEvent(state, { id: `grade-${index}`, kind: "grade", value: "A", asin: `NEW${index}`, createdAt, sessionId: index < 3 ? "session-one" : "session-two" });
  }
  return state;
}

test("requires five ASINs, two sessions and 75 percent agreement", () => {
  const sparse = learnedState(4);
  assert.equal(buildLearnedGradeMap(products, sparse).size, 0);

  const state = learnedState(5);
  const rules = buildPreferenceRules(products, state);
  assert.equal(rules[0].status, "active");
  assert.equal(rules[0].evidenceCount, 5);
  assert.equal(rules[0].sessionCount, 2);
  assert.equal(buildLearnedGradeMap(products, state).get("NEW5")?.grade, "A");
});

test("paused rules stop affecting ranking and D never propagates", () => {
  let state = learnedState(5);
  const family = buildPreferenceRules(products, state)[0].family;
  state = setPreferenceRuleStatus(state, family, "paused");
  assert.equal(buildLearnedGradeMap(products, state).size, 0);

  state = {
    ...state,
    preferenceRuleSettings: {},
    gradeOverrides: Object.fromEntries(products.slice(0, 5).map((product, index) => [product.asin, { grade: "D" as const, updatedAt: `2026-07-0${index + 1}T00:00:00.000Z` }])),
  };
  assert.equal(buildPreferenceRules(products, state).length, 0);
});

test("recycle decisions teach soft avoidance without creating D", () => {
  let state = emptyLearningState("2026-07-01T00:00:00.000Z");
  for (let index = 0; index < 10; index++) {
    const asin = `RECYCLE${index}`;
    const product = { asin, title: `Simple Standard Utility Shelf ${index}`, category: "Utility Shelves", reviews: 1500, complexity: 2, differentiation: 2 };
    const createdAt = `2026-07-0${index < 5 ? 1 : 2}T${String(index).padStart(2, "0")}:00:00.000Z`;
    state = recycleProduct(state, product, "C", new Date(createdAt));
    state = appendLearningEvent(state, { id: `recycle-${index}`, kind: "recycle", value: "recycle", asin, createdAt, sessionId: index < 5 ? "session-one" : "session-two" });
  }
  const target = { asin: "RECYCLE-TARGET", title: "Simple Standard Utility Shelf New", category: "Utility Shelves", reviews: 1800, complexity: 2, differentiation: 2 };
  const signalRule = buildPreferenceSignalRules([target], state).find((rule) => rule.ruleKey === "signal:competition:very-high");
  const learned = buildLearnedGradeMap([target], state).get(target.asin);
  assert.equal(signalRule?.status, "active");
  assert.equal(signalRule?.direction, "avoid");
  assert.equal(learned?.grade, "C");
  assert.ok((learned?.adjustment ?? 0) < 0);
  assert.notEqual(learned?.grade, "D");
});
