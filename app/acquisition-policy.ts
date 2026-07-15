export const acquisitionPolicy = {
  batchSize: 50,
  mix: {
    redOceanBlue: 20,
    blueOceanRed: 20,
    exploration: 10,
  },
  cadenceDays: {
    normal: 7,
    priority: 3,
  },
  minimumPriceUsd: 100,
} as const;

export const redOceanBlueSeeds = [
  "sideboard buffet cabinet arched fluted",
  "pantry cabinet tambour curved scalloped",
  "bookcase cabinet rattan cane asymmetric",
  "storage cabinet wave ribbed geometric",
];

export const blueOceanRedSeeds = [
  "reptile enclosure furniture cabinet",
  "washer dryer workstation laundry table",
  "hidden litter box enclosure furniture",
  "tilt out trash cabinet kitchen island",
  "manicure nail tech desk salon station",
  "reception checkout counter desk",
  "craft sewing workstation cabinet",
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
