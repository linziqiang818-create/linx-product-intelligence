import { readFile, writeFile } from "node:fs/promises";
import { classifySolidWoodEvidence } from "../app/selection-policy.ts";
import { minimumFormalAdmission } from "../app/formal-admission.ts";
import { classifyFormalProduct, classifyFormalProductPool } from "../app/product-placement.ts";

const realPath = new URL("../app/real-products.json", import.meta.url);
const rejectedPath = new URL("../app/rejected-products.json", import.meta.url);
const statePath = new URL("../app/acquisition-state.json", import.meta.url);

const [real, rejected, state] = await Promise.all(
  [realPath, rejectedPath, statePath].map(async (path) =>
    JSON.parse(await readFile(path, "utf8")),
  ),
);

if (
  state.lastSolidWoodReaudit?.reviewed === 214 &&
  state.lastSolidWoodReaudit.formalPoolAfter === real.length &&
  state.lastSolidWoodReaudit.rejectedPoolAfter === rejected.length
) {
  console.log(
    JSON.stringify(
      { alreadyApplied: true, ...state.lastSolidWoodReaudit },
      null,
      2,
    ),
  );
  process.exit(0);
}

// Snapshot of the legacy rule that produced the 214-item review set.
const legacySolidWoodTerms =
  /solid wood|solid oak|solid pine|solid walnut|hardwood|rubberwood|纯实木|全实木/i;
const legacyPanelMaterialTerms =
  /mdf|particle board|engineered wood|fiberboard|melamine|laminate|刨花板|密度板|人造板|三聚氰胺/i;

const isLegacySolidWoodRejection = (product) => {
  const text = `${product.category ?? ""} ${product.title ?? ""} ${product.material ?? ""}`;
  return legacySolidWoodTerms.test(text) && !legacyPanelMaterialTerms.test(text);
};

const reviewed = rejected.filter(isLegacySolidWoodRejection);
if (reviewed.length !== 214) {
  throw new Error(`Expected the fixed 214-ASIN review set, found ${reviewed.length}.`);
}

const reviewedAt = new Date().toISOString();
const existingRealAsins = new Set(real.map((product) => product.asin));
const restored = [];
const keptRejected = [];
const duplicates = [];
const admissionPending = [];
const evidenceStatuses = {};
const keptReasons = {};

for (const product of reviewed) {
  const solidWoodEvidence = classifySolidWoodEvidence(
    product.title ?? "",
    product.material ?? "",
  );
  evidenceStatuses[solidWoodEvidence.status] =
    (evidenceStatuses[solidWoodEvidence.status] ?? 0) + 1;

  const placement = classifyFormalProduct(product, "import");
  const review = {
    reviewedAt,
    trigger: "legacy-solid-wood-keyword-rule",
    evidenceStatus: solidWoodEvidence.status,
    evidenceReason: solidWoodEvidence.reason,
    amazonDetailVerification: "pending-access-retry",
    evidenceScope:
      "SellerSprite import record fields and canonical Amazon URL; no current Amazon detail-page confirmation",
  };

  if (placement.grade === "D") {
    const reasons = placement.assessment.hardRejectReasons;
    for (const reason of reasons) keptReasons[reason] = (keptReasons[reason] ?? 0) + 1;
    keptRejected.push({
      ...product,
      grade: "D",
      rejectionReason: reasons.join("；"),
      materialReview: {
        ...review,
        decision: "kept-rejected",
      },
    });
    continue;
  }

  const admission = minimumFormalAdmission(product, false);
  if (!admission.eligible) {
    admissionPending.push({ asin: product.asin, issues: admission.issues });
    keptRejected.push({
      ...product,
      materialReview: {
        ...review,
        decision: "admission-pending",
        admissionIssues: admission.issues,
      },
    });
    continue;
  }

  if (existingRealAsins.has(product.asin)) {
    duplicates.push(product.asin);
    continue;
  }

  const {
    grade: _grade,
    rejectionReason: _rejectionReason,
    movedToTrashAt: _movedToTrashAt,
    ...formalProduct
  } = product;
  void _grade;
  void _rejectionReason;
  void _movedToTrashAt;
  restored.push({
    ...formalProduct,
    sourceUrl: admission.canonicalAmazonUrl,
    materialReview: {
      ...review,
      decision: "restored-formal-pool",
    },
    restoredFromTrashAt: reviewedAt,
    restoredFromTrashReason:
      "Legacy solid-wood keyword evidence did not meet the whole-product material threshold.",
  });
  existingRealAsins.add(product.asin);
}

const reviewedAsins = new Set(reviewed.map((product) => product.asin));
const nextReal = [...real, ...restored];
const nextRejected = [
  ...rejected.filter((product) => !reviewedAsins.has(product.asin)),
  ...keptRejected,
];

const realPlacements = classifyFormalProductPool(nextReal, "real-products");
const grades = realPlacements.reduce(
  (counts, placement) => {
    counts[placement.grade] += 1;
    return counts;
  },
  { A: 0, B: 0, C: 0, D: 0 },
);
const restoredNeedsData = restored.filter(
  (product) => classifyFormalProduct(product, "real-products").needsData,
).length;

state.lastSolidWoodReaudit = {
  reviewedAt,
  reviewed: reviewed.length,
  evidenceStatuses,
  restoredFormal: restored.length,
  restoredNeedsData,
  keptRejected: keptRejected.length,
  keptReasons,
  duplicates: duplicates.length,
  duplicateAsins: duplicates,
  admissionPending: admissionPending.length,
  admissionPendingDetails: admissionPending,
  formalPoolBefore: real.length,
  formalPoolAfter: nextReal.length,
  rejectedPoolBefore: rejected.length,
  rejectedPoolAfter: nextRejected.length,
  formalGradesAfter: grades,
  publicAccess:
    "Stopped after three consecutive Cache miss results on different Amazon ASIN detail pages; no captcha or HTTP 403/429 was observed.",
  note:
    "Only explicit whole-product material evidence remains a solid-wood D. Title claims, generic wood species, local solid-wood components and material conflicts are not D by themselves.",
};

await Promise.all([
  writeFile(realPath, `${JSON.stringify(nextReal, null, 2)}\n`, "utf8"),
  writeFile(rejectedPath, `${JSON.stringify(nextRejected, null, 2)}\n`, "utf8"),
  writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8"),
]);

console.log(
  JSON.stringify(
    {
      reviewed: reviewed.length,
      evidenceStatuses,
      restoredFormal: restored.length,
      restoredNeedsData,
      keptRejected: keptRejected.length,
      keptReasons,
      duplicates: duplicates.length,
      admissionPending: admissionPending.length,
      formalPoolBefore: real.length,
      formalPoolAfter: nextReal.length,
      rejectedPoolBefore: rejected.length,
      rejectedPoolAfter: nextRejected.length,
      formalGradesAfter: grades,
    },
    null,
    2,
  ),
);
