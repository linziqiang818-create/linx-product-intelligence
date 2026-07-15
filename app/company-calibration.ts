export type GoldenVerdict = "develop" | "reject" | "uncertain";
export type GoldenScope = "category" | "product" | "uncertain";

export type GoldenSample = {
  asin: string;
  verdict: GoldenVerdict;
  scope: GoldenScope;
  reasons: string[];
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

const ceilingStorageRackTerms = /ceiling[- ]mounted (?:storage )?racks?|overhead garage storage racks?|garage ceiling storage racks?|ceiling storage racks?/i;

export function calibratedHardRejectReason(input: { title: string; category: string }) {
  const text = `${input.category} ${input.title}`;
  return ceilingStorageRackTerms.test(text)
    ? "公司校准确认：吊顶或顶置车库储物架属于不开发的标准化品类"
    : "";
}
