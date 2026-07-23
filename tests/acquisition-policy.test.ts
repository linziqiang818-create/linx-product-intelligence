import assert from "node:assert/strict";
import test from "node:test";
import { acquisitionPolicy, acquisitionPolicyBoundaries, currentResearchPoolSummary, salesEvidenceLabel } from "../app/acquisition-policy.ts";
import { preliminaryPriority } from "../app/acquisition-priority.ts";

test("reserves twenty percent of every research batch for unexpected opportunities", () => {
  assert.equal(Object.values(acquisitionPolicy.mix).reduce((sum, count) => sum + count, 0), acquisitionPolicy.batchSize);
  assert.equal(acquisitionPolicy.mix.exploration, 20);
  assert.equal(acquisitionPolicy.batchSize, 100);
  assert.equal(acquisitionPolicy.discoveryBatchSize, 700);
  assert.equal(acquisitionPolicy.sprint.runsPerDay, 3);
  assert.equal(acquisitionPolicy.sprint.dailyDiscoveryLimit, 2100);
  assert.equal(acquisitionPolicy.sprint.dailyFormalImportLimit, 300);
  assert.equal(acquisitionPolicy.sprint.formalImportTarget, 4200);
});

test("documents the exact composition of the current fifty-product pilot batch", () => {
  assert.equal(currentResearchPoolSummary().reduce((sum, group) => sum + group.count, 0), 50);
});

test("prevents one product family from taking over future formal batches", () => {
  assert.equal(acquisitionPolicy.diversity.minimumFamiliesPerFormalBatch, 10);
  assert.equal(acquisitionPolicy.diversity.minimumFamiliesPerTrack, 5);
  assert.equal(acquisitionPolicy.diversity.maximumProductsPerFamily, 8);
  assert.equal(acquisitionPolicy.diversity.maximumProductsPerFamilyInTop20, 4);
});

test("does not let one unavailable Amazon listing cancel the whole batch", () => {
  assert.equal(acquisitionPolicy.accessHandling.discoveryBeforeEnrichment, true);
  assert.equal(acquisitionPolicy.accessHandling.skipSingleUnavailableListing, true);
  assert.equal(acquisitionPolicy.accessHandling.cacheMissCountsAsSingleListingFailure, true);
  assert.equal(acquisitionPolicy.accessHandling.consecutiveDetailFailuresBeforeBatchStop, 3);
  assert.deepEqual(acquisitionPolicy.accessHandling.immediateStopHttpStatuses, [403, 429]);
  assert.deepEqual(acquisitionPolicy.accessHandling.immediateStopSignals, ["captcha", "robot check", "account sign-in required"]);
});

test("keeps acquisition quotas out of formal storage and classification", () => {
  assert.equal(acquisitionPolicyBoundaries.appliesTo, "acquisition-priority-and-diversity");
  assert.equal(acquisitionPolicyBoundaries.formalStorageLimit, null);
  assert.equal(acquisitionPolicyBoundaries.classificationLimit, null);
});

test("admits verified non-D products without requiring every commercial field", () => {
  assert.equal(acquisitionPolicy.minimumFormalAdmission.requiresRealAsin, true);
  assert.equal(acquisitionPolicy.minimumFormalAdmission.requiresCompleteEnglishTitle, true);
  assert.equal(acquisitionPolicy.minimumFormalAdmission.requiresCanonicalAmazonUsLink, true);
  assert.equal(acquisitionPolicy.minimumFormalAdmission.requiresTraceablePublicEvidence, true);
  assert.equal(acquisitionPolicy.minimumFormalAdmission.requiresVerifiedPublicMainImage, true);
  assert.equal(acquisitionPolicy.minimumFormalAdmission.excludesGradeD, true);
  assert.equal(acquisitionPolicy.minimumFormalAdmission.missingCommercialFieldsRemainDataPending, true);
});

test("requires a fixed acquisition funnel report after every batch", () => {
  assert.equal(acquisitionPolicy.batchReporting.requiredAfterEveryAcquisitionAction, true);
  assert.deepEqual(acquisitionPolicy.batchReporting.fields, [
    "discovered", "enteredFormalPool", "screenedOut", "screenedOutReasons", "duplicates",
    "dataPending", "formalPoolBefore", "formalPoolAfter", "candidatePoolAfter", "accessRestriction",
  ]);
});

test("labels public sales evidence without pretending an estimate is exact", () => {
  assert.deepEqual(salesEvidenceLabel({ monthlySales: 83 }), { value: "83", source: "数据源月销量" });
  assert.deepEqual(salesEvidenceLabel({ estimatedLow: 50, estimatedHigh: 100 }), { value: "50–100", source: "LINX估算区间" });
  assert.deepEqual(salesEvidenceLabel({ boughtPastMonth: 50 }), { value: "≥50", source: "Amazon近月购买提示" });
  assert.deepEqual(salesEvidenceLabel({}), { value: "—", source: "待首次监测" });
});

test("prioritizes likely company-fit products before enriching the whole pool", () => {
  const niche = preliminaryPriority({ title: "Fluted Hidden Cat Litter Box Cabinet with Sliding Door", price: 189, discoveryLane: "blue-ocean-red" });
  const ordinary = preliminaryPriority({ title: "Simple Small Side Table", price: 45, discoveryLane: "exploration" });
  const rejected = preliminaryPriority({ title: "Solid Oak Mirrored Glass Cabinet", price: 399 });
  const solidWoodClue = preliminaryPriority({ title: "TV Stand with Solid Wood Legs and Adjustable Shelves", price: 189 });
  assert.equal(niche.disposition, "priority");
  assert.ok(niche.score > ordinary.score);
  assert.equal(rejected.disposition, "trash");
  assert.notEqual(solidWoodClue.disposition, "trash");
  assert.ok(solidWoodClue.reasons.some((reason) => reason.includes("不能仅凭标题淘汰")));
});
