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

// Preference lab, first 30-product challenge batch, confirmed 2026-07-15.
// These are product-level willingness signals, never hard reject rules.
export const preferenceResearchAsins = [
  "B0F6BP73WJ", "B0DQPXHV82", "B0FDGHM391", "B0FSZV4H21", "B0F6CNTRHW", "B0FCMBRH91",
  "B0DN13DKK5", "B0GYCYSDNN", "B0DL5Q9319", "B0GTKYY5YJ", "B0DWFGYWLN", "B0GZ7ZGLY8",
  "B0DRRTR25P", "B0H4Q13TCT", "B0DZ5CHFZM", "B0FJ83YQ3H", "B0GDW6562N", "B0CDWGVNQT",
] as const;

export const preferencePassAsins = [
  "B0GH651S4V", "B0DZ6DK5MM", "B0H1MBRW2G", "B0DHVR9HSM", "B0FX4K9TQY", "B0C1ZBWY2K",
  "B0DG5T64TF", "B0GXKNSYGT", "B0FN3T3KQ2", "B0GZMP2S5F", "B0GWR1M1CX", "B0BHWBZ94J",
  "B0F93P2QMD", "B0F2SZCWSP",
] as const;

export function calibratedProductDisposition(asin: string) {
  return [...roundOneGoldenSamples, ...roundTwoGoldenSamples].find((sample) => sample.asin === asin);
}

const specializedScenarioTerms = /coffee bar|mini fridge cabinet|reception desk|front counter/i;
const integratedFunctionTerms = /fridge|wine|lockable|keyboard|drawer|storage|shelf|cabinet/i;
const bedTerms = /\bbed\b|bed frame|loft bed/i;
const sculpturalBedTerms = /half[- ]moon|curved|airframe|arched base|round cushioned/i;
const distinctiveCasegoodTerms = /fluted|wave|ripple|arched|rounded corner/i;
const casegoodSurfaceTerms = /cabinet|sideboard|dresser|bookcase|bookshelf|credenza/i;
const specializedWorkTerms = /reception|front desk|manicure|nail desk|filing cabinet|file cabinet/i;
const workStructureTerms = /lockable|drawer|storage|extendable|dust collector|keyboard tray|cable grommet/i;
const repeatedLowInterestTerms = /furniture[- ]style dog crate|dog crate furniture|foldable shoe rack|electric standing desk|height adjustable standing desk/i;

export function calibratedInterestProfile(input: { asin: string; title: string; category: string }) {
  const preferenceResearch = preferenceResearchAsins.includes(input.asin as typeof preferenceResearchAsins[number]);
  const preferencePass = preferencePassAsins.includes(input.asin as typeof preferencePassAsins[number]);
  const sample = roundTwoGoldenSamples.find((item) => item.asin === input.asin);
  const text = `${input.category} ${input.title}`;
  const reasons: string[] = [];
  const tier: GoldenInterest | "unrated" = preferenceResearch ? "priority" : preferencePass ? "low" : sample?.interest ?? "unrated";
  let adjustment = preferenceResearch ? 6 : preferencePass ? -6 : sample?.interest === "priority" ? 8 : sample?.interest === "low" ? -8 : 0;
  if (preferenceResearch) reasons.push("偏好挑战：愿意继续投入时间研究此产品");
  else if (preferencePass) reasons.push("偏好挑战：理论可行但当前没有研究兴趣");
  else if (sample?.interest === "priority") reasons.push("第二轮校准：想优先研究");
  else if (sample?.interest === "low") reasons.push("第二轮校准：理论可行但当前兴趣较低");
  if (specializedScenarioTerms.test(text) && integratedFunctionTerms.test(text)) {
    adjustment += 3;
    reasons.push("校准偏好：细分场景与一体化功能结合");
  }
  if (distinctiveCasegoodTerms.test(text) && casegoodSurfaceTerms.test(text)) {
    adjustment += 3;
    reasons.push("校准偏好：柜体具有明确的造型识别度");
  }
  if (specializedWorkTerms.test(text) && workStructureTerms.test(text)) {
    adjustment += 3;
    reasons.push("校准偏好：专业工作场景与实用结构结合");
  }
  if (repeatedLowInterestTerms.test(text)) {
    adjustment -= 3;
    reasons.push("校准偏好：该通用产品方向连续出现低兴趣反馈");
  }
  if (bedTerms.test(text) && !sculpturalBedTerms.test(text)) {
    adjustment -= 4;
    reasons.push("校准偏好：普通床类方向当前优先度较低");
  }
  return { tier, adjustment, reasons };
}

const ceilingStorageRackTerms = /ceiling[- ]mounted (?:storage )?racks?|overhead garage storage racks?|garage ceiling storage racks?|ceiling storage racks?/i;

export function calibratedHardRejectReason(input: { title: string; category: string }) {
  const text = `${input.category} ${input.title}`;
  return ceilingStorageRackTerms.test(text)
    ? "公司校准确认：吊顶或顶置车库储物架属于不开发的标准化品类"
    : "";
}
