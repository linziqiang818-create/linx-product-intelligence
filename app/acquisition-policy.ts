export const acquisitionPolicy = {
  batchSize: 100,
  discoveryBatchSize: 700,
  initialCandidatePoolTarget: 20000,
  weeklyCandidateExpansion: 3500,
  sprint: {
    durationDays: 14,
    runsPerDay: 3,
    hoursLocal: [9, 14, 19],
    dailyDiscoveryLimit: 2100,
    dailyFormalImportLimit: 300,
    formalImportTarget: 4200,
  },
  steady: {
    runsPerDay: 1,
    dailyDiscoveryLimit: 700,
    dailyFormalImportLimit: 100,
  },
  mix: {
    redOceanBlue: 40,
    blueOceanRed: 40,
    exploration: 20,
  },
  diversity: {
    minimumFamiliesPerFormalBatch: 10,
    minimumFamiliesPerTrack: 5,
    maximumProductsPerFamily: 8,
    maximumProductsPerFamilyInTop20: 4,
  },
  accessHandling: {
    discoveryBeforeEnrichment: true,
    skipSingleUnavailableListing: true,
    cacheMissCountsAsSingleListingFailure: true,
    consecutiveDetailFailuresBeforeBatchStop: 3,
    immediateStopHttpStatuses: [403, 429],
    immediateStopSignals: ["captcha", "robot check", "account sign-in required"],
  },
  minimumFormalAdmission: {
    requiresRealAsin: true,
    requiresCompleteEnglishTitle: true,
    requiresCanonicalAmazonUsLink: true,
    requiresTraceablePublicEvidence: true,
    excludesGradeD: true,
    missingCommercialFieldsRemainDataPending: true,
  },
  cadenceDays: {
    normal: 7,
    priority: 3,
  },
  minimumPriceUsd: 100,
} as const;

// Batch sizes, family quotas and Top 20 diversity only control what gets
// enriched first. They never cap the formal pool or any business placement.
export const acquisitionPolicyBoundaries = {
  appliesTo: "acquisition-priority-and-diversity",
  formalStorageLimit: null,
  classificationLimit: null,
} as const;

export const redOceanBlueSeeds = [
  "sideboard buffet cabinet arched fluted",
  "pantry cabinet tambour curved scalloped",
  "bookcase cabinet rattan cane asymmetric",
  "storage cabinet wave ribbed geometric",
  "coffee bar cabinet mini fridge fluted",
  "tv stand media console curved tambour",
  "dresser chest rounded fluted modern",
  "shoe cabinet hall tree entryway distinctive",
];

export const blueOceanRedSeeds = [
  "reptile enclosure furniture cabinet",
  "washer dryer workstation laundry table",
  "hidden litter box enclosure furniture",
  "tilt out trash cabinet kitchen island",
  "manicure nail tech desk salon station",
  "reception checkout counter desk",
  "craft sewing workstation cabinet",
  "vinyl record player storage cabinet",
  "printer stand filing workstation cabinet",
  "pet feeding station furniture storage",
];

export const publicObservationFields = [
  "price",
  "rating",
  "reviews",
  "bsr",
  "boughtPastMonth",
  "itemWeight",
  "packageWeight",
  "dimensions",
  "dateFirstAvailable",
] as const;

export type SalesEvidence = {
  monthlySales?: number;
  estimatedLow?: number;
  estimatedHigh?: number;
  boughtPastMonth?: number;
};

export function salesEvidenceLabel(evidence: SalesEvidence) {
  if ((evidence.monthlySales ?? 0) > 0) return { value: String(evidence.monthlySales), source: "数据源月销量" };
  if ((evidence.estimatedLow ?? 0) > 0 && (evidence.estimatedHigh ?? 0) >= (evidence.estimatedLow ?? 0)) {
    return { value: `${evidence.estimatedLow}–${evidence.estimatedHigh}`, source: "LINX估算区间" };
  }
  if ((evidence.boughtPastMonth ?? 0) > 0) return { value: `≥${evidence.boughtPastMonth}`, source: "Amazon近月购买提示" };
  return { value: "—", source: "待首次监测" };
}

export function currentResearchPoolSummary() {
  return [
    { name: "拱形 / 波纹柜", count: 14, track: "红海中的蓝海" },
    { name: "商业前台", count: 6, track: "蓝海中的红海" },
    { name: "美甲 / 理发工作台", count: 8, track: "蓝海中的红海" },
    { name: "隐藏垃圾柜 / 厨房岛台", count: 12, track: "蓝海中的红海" },
    { name: "猫砂柜", count: 10, track: "蓝海中的红海" },
  ] as const;
}
