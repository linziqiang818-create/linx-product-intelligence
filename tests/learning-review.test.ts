import assert from "node:assert/strict";
import test from "node:test";
import { appendLearningEvent, appendReflectionReport, emptyLearningState } from "../app/learning-state.ts";
import { buildReflectionReport, unreportedLearningEvents, weeklyLearningSummary } from "../app/learning-review.ts";

const products = [{ asin: "ASIN1", title: "Fluted Storage Cabinet", category: "Storage Cabinets" }];

test("builds a real report from only unreported events", () => {
  let state = emptyLearningState("2026-07-23T00:00:00.000Z");
  state = appendLearningEvent(state, { id: "one", kind: "grade", value: "A", asin: "ASIN1", createdAt: "2026-07-23T01:00:00.000Z", sessionId: "session" });
  state = appendLearningEvent(state, { id: "two", kind: "grade", value: "C", asin: "ASIN1", createdAt: "2026-07-23T02:00:00.000Z", sessionId: "session" });
  const report = buildReflectionReport(products, state, "2026-07-23T03:00:00.000Z", "report")!;
  assert.equal(report.eventIds.length, 2);
  assert.equal(report.gradeCounts.A, 1);
  assert.equal(report.gradeCounts.C, 1);
  assert.equal(report.contradictions.length, 1);
  state = appendReflectionReport(state, report);
  assert.equal(unreportedLearningEvents(state).length, 0);
  assert.equal(buildReflectionReport(products, state), null);
});

test("summarizes the latest seven days by event, product and session", () => {
  let state = emptyLearningState("2026-07-23T00:00:00.000Z");
  state = appendLearningEvent(state, { id: "recent", kind: "research", value: "research", asin: "ASIN1", createdAt: "2026-07-22T00:00:00.000Z", sessionId: "session" });
  state = appendLearningEvent(state, { id: "old", kind: "research", value: "hold", asin: "ASIN1", createdAt: "2026-07-01T00:00:00.000Z", sessionId: "old" });
  const summary = weeklyLearningSummary(state, Date.parse("2026-07-23T00:00:00.000Z"));
  assert.deepEqual(summary, { eventCount: 1, productCount: 1, sessionCount: 1, reportCount: 0 });
});
