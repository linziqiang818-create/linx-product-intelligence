export type GoldenVerdict = "develop" | "reject" | "uncertain";
export type GoldenScope = "category" | "product" | "uncertain";
export type GoldenInterest = "priority" | "normal" | "low";

export type GoldenSample = {
  asin: string;
  verdict: GoldenVerdict;
  scope: GoldenScope;
  reasons: string[];
  interest?: GoldenInterest;
};

// Round 1, confirmed by the user on 2026-07-15.
// "develop" means theoretically eligible for further evaluation. It does not
// mean preferred, prioritized, or approved for development.
export const roundOneGoldenSamples: GoldenSample[] = [
  { asin: "B0G4HKTHJX", verdict: "reject", scope: "product", reasons: ["利润或售价空间不足"] },
  { asin: "B0FDGHM391", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0GH651S4V", verdict: "uncertain", scope: "product", reasons: ["市场已经成熟，不是机会"] },
  { asin: "B0GJSV5B5T", verdict: "reject", scope: "category", reasons: ["标品、差异化不足"] },
  { asin: "B0FSZV4H21", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0F6CNTRHW", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0FCMBRH91", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0DN13DKK5", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0GYCYSDNN", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0GHRLD6VG", verdict: "reject", scope: "product", reasons: ["标品、差异化不足", "造型不认可"] },
  { asin: "B0G2SL7CWK", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0DL5Q9319", verdict: "develop", scope: "product", reasons: [] },
  { asin: "B0GM6FJRWK", verdict: "reject", scope: "product", reasons: ["标品、差异化不足", "造型不认可", "市场已经成熟，不是机会"] },
  { asin: "B0GGMCB4V3", verdict: "reject", scope: "product", reasons: ["标品、差异化不足"] },
];

export const roundOneCalibrationAsins = roundOneGoldenSamples.map((sample) => sample.asin);

// Round 2 focuses on the current ranking boundary and deliberately excludes
// round-one products. These samples separate theoretical eligibility from the
// user's actual willingness to investigate a direction.
export const roundTwoCalibrationAsins = [
  "B0FR8R2QV7",
  "B0FJ2H1DG6",
  "B0DWFGYWLN",
  "B0GWR1M1CX",
  "B0DWMNGBKD",
  "B0FKTML5HX",
  "B0DF2CDWPF",
  "B0F6BP73WJ",
  "B0D78W597V",
  "B0C68MNQ1K",
  "B0F2SZCWSP",
  "B0DQPXHV82",
  "B0F2H5FNPJ",
  "B0GR3V3WDP",
] as const;

export const roundTwoGoldenSamples: GoldenSample[] = [
  { asin: "B0FR8R2QV7", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0FJ2H1DG6", verdict: "develop", scope: "product", reasons: [], interest: "low" },
  { asin: "B0DWFGYWLN", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0GWR1M1CX", verdict: "develop", scope: "product", reasons: [], interest: "low" },
  { asin: "B0DWMNGBKD", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0FKTML5HX", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0DF2CDWPF", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0F6BP73WJ", verdict: "develop", scope: "product", reasons: [], interest: "priority" },
  { asin: "B0D78W597V", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0C68MNQ1K", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0F2SZCWSP", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
  { asin: "B0DQPXHV82", verdict: "develop", scope: "product", reasons: [], interest: "priority" },
  { asin: "B0F2H5FNPJ", verdict: "develop", scope: "product", reasons: [], interest: "low" },
  { asin: "B0GR3V3WDP", verdict: "develop", scope: "product", reasons: [], interest: "normal" },
];

export const roundThreeCalibrationAsins = [
  "B0DD7LTW9P",
  "B0CTZW95B8",
  "B0FNR3ZNJ8",
  "B0GT3KDQVM",
  "B0DRVY5SQ3",
  "B0H4Q13TCT",
  "B0DRRTR25P",
  "B0FX4K9TQY",
  "B0DHVR9HSM",
  "B0GZ7ZGLY8",
  "B0CDWGVNQT",
  "B0H1MBRW2G",
  "B0GVND5SDV",
  "B0G2ML6N49",
] as const;

export const activeCalibrationRound = 3;
export const activeCalibrationAsins: readonly string[] = roundThreeCalibrationAsins;

export function calibratedProductDisposition(asin: string) {
  return [...roundOneGoldenSamples, ...roundTwoGoldenSamples].find((sample) => sample.asin === asin);
}

const specializedScenarioTerms = /coffee bar|mini fridge cabinet|reception desk|front counter/i;
const integratedFunctionTerms = /fridge|wine|lockable|keyboard|drawer|storage|shelf|cabinet/i;
const bedTerms = /\bbed\b|bed frame|loft bed/i;
const sculpturalBedTerms = /half[- ]moon|curved|airframe|arched base|round cushioned/i;

export function calibratedInterestProfile(input: { asin: string; title: string; category: string }) {
  const sample = roundTwoGoldenSamples.find((item) => item.asin === input.asin);
  const text = `${input.category} ${input.title}`;
  const reasons: string[] = [];
  let adjustment = sample?.interest === "priority" ? 8 : sample?.interest === "low" ? -8 : 0;
  if (sample?.interest === "priority") reasons.push("第二轮校准：想优先研究");
  if (sample?.interest === "low") reasons.push("第二轮校准：理论可行但当前兴趣较低");
  if (specializedScenarioTerms.test(text) && integratedFunctionTerms.test(text)) {
    adjustment += 3;
    reasons.push("校准偏好：细分场景与一体化功能结合");
  }
  if (bedTerms.test(text) && !sculpturalBedTerms.test(text)) {
    adjustment -= 4;
    reasons.push("校准偏好：普通床类方向当前优先度较低");
  }
  return { tier: sample?.interest ?? "unrated" as GoldenInterest | "unrated", adjustment, reasons };
}

const ceilingStorageRackTerms = /ceiling[- ]mounted (?:storage )?racks?|overhead garage storage racks?|garage ceiling storage racks?|ceiling storage racks?/i;

export function calibratedHardRejectReason(input: { title: string; category: string }) {
  const text = `${input.category} ${input.title}`;
  return ceilingStorageRackTerms.test(text)
    ? "公司校准确认：吊顶或顶置车库储物架属于不开发的标准化品类"
    : "";
}
