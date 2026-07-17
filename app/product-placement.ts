import { assess, type OpportunityInput } from "./opportunity.ts";
import { classifyOpportunityTrack, trackLabels, type OpportunityTrack } from "./opportunity-track.ts";
import { isPotentialProduct } from "./product-potential.ts";
import { gradeFromDecision, type Grade } from "./recommendation-grade.ts";

export const productPlacementClassifierVersion = "2026-07-17-v1";

export type ProductOrigin = "real-products" | "historical" | "daily" | "import" | "candidate-enrichment";
export type ProductDestination = "garbage" | OpportunityTrack;

export type FormalProductRecord = {
  asin: string;
  title: string;
  category?: string;
  price?: number;
  monthlySales?: number;
  launchDays?: number;
  salesGrowth?: number;
  rating?: number;
  reviews?: number;
  packageGrossKg?: number;
  packageDimensionsCm?: string;
  weight?: number;
  dimensions?: string;
  material?: string;
  estimatedMargin?: number;
  priceUplift?: number;
  sourceUrl?: string;
  manualFavorite?: boolean;
};

export type ProductPlacement = {
  asin: string;
  grade: Grade;
  destination: ProductDestination;
  opportunityTrack: OpportunityTrack | null;
  opportunityTrackLabel: string | null;
  potential: boolean;
  needsData: boolean;
  favorite: boolean;
  favoriteSource: "manual";
  score: number;
  reasons: string[];
  trace: {
    asin: string;
    origin: ProductOrigin;
    classifierVersion: string;
    primaryPlacement: ProductDestination;
  };
  assessment: ReturnType<typeof assess>;
};

function opportunityInputFor(product: FormalProductRecord): OpportunityInput {
  return {
    asin: product.asin,
    title: product.title,
    category: product.category ?? "",
    price: Number(product.price ?? 0),
    monthlySales: Number(product.monthlySales ?? 0),
    launchDays: Number(product.launchDays ?? 9999),
    salesGrowth: Number(product.salesGrowth ?? 0),
    rating: Number(product.rating ?? 0),
    reviews: Number(product.reviews ?? 0),
    packageGrossKg: Number(product.packageGrossKg ?? (product.weight ?? 0) / 2.205),
    packageDimensionsCm: product.packageDimensionsCm ?? product.dimensions ?? "",
    material: product.material ?? "",
    estimatedMargin: Number(product.estimatedMargin ?? 0),
    priceUplift: Number(product.priceUplift ?? 0),
    sourceUrl: product.sourceUrl ?? "",
  };
}

export function classifyFormalProduct(product: FormalProductRecord, origin: ProductOrigin): ProductPlacement {
  const input = opportunityInputFor(product);
  const assessment = assess(input);
  const grade = gradeFromDecision(assessment.decision);
  const opportunity = grade === "D"
    ? null
    : classifyOpportunityTrack(
        { title: input.title, category: input.category, price: input.price, reviews: input.reviews, rating: input.rating },
        assessment,
      );
  const opportunityTrack = opportunity?.track ?? null;
  const destination: ProductDestination = grade === "D" ? "garbage" : opportunityTrack ?? "unmatched";

  return {
    asin: input.asin,
    grade,
    destination,
    opportunityTrack,
    opportunityTrackLabel: opportunityTrack ? trackLabels[opportunityTrack] : null,
    potential: isPotentialProduct(input),
    needsData: assessment.dataStatus === "needs_data",
    favorite: product.manualFavorite === true,
    favoriteSource: "manual",
    score: assessment.score,
    reasons: [...assessment.reasons, ...(opportunity?.reasons ?? [])],
    trace: {
      asin: input.asin,
      origin,
      classifierVersion: productPlacementClassifierVersion,
      primaryPlacement: destination,
    },
    assessment,
  };
}

export function classifyFormalProductPool(products: readonly FormalProductRecord[], origin: ProductOrigin) {
  return products.map((product) => classifyFormalProduct(product, origin));
}

export type PlacementAudit = {
  total: number;
  grades: Record<Grade, number>;
  destinations: Record<ProductDestination, number>;
  labels: { potential: number; needsData: number; favorite: number };
  overlaps: { potentialAndNeedsData: number; potentialAndFavorite: number; needsDataAndFavorite: number; allThree: number };
  traceable: number;
  errors: string[];
  valid: boolean;
};

export function auditProductPlacements(placements: readonly ProductPlacement[]): PlacementAudit {
  const grades: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  const destinations: Record<ProductDestination, number> = { garbage: 0, "red-ocean-blue": 0, "blue-ocean-red": 0, unmatched: 0 };
  const labels = { potential: 0, needsData: 0, favorite: 0 };
  const overlaps = { potentialAndNeedsData: 0, potentialAndFavorite: 0, needsDataAndFavorite: 0, allThree: 0 };
  const errors: string[] = [];
  const seen = new Set<string>();
  let traceable = 0;

  for (const placement of placements) {
    grades[placement.grade]++;
    destinations[placement.destination]++;
    if (placement.potential) labels.potential++;
    if (placement.needsData) labels.needsData++;
    if (placement.favorite) labels.favorite++;
    if (placement.potential && placement.needsData) overlaps.potentialAndNeedsData++;
    if (placement.potential && placement.favorite) overlaps.potentialAndFavorite++;
    if (placement.needsData && placement.favorite) overlaps.needsDataAndFavorite++;
    if (placement.potential && placement.needsData && placement.favorite) overlaps.allThree++;

    if (seen.has(placement.asin)) errors.push(`${placement.asin}: 正式产品重复归位`);
    seen.add(placement.asin);
    if (placement.trace.asin === placement.asin && placement.trace.primaryPlacement === placement.destination && placement.trace.classifierVersion) traceable++;
    else errors.push(`${placement.asin}: 缺少可追溯的主归位`);
    if (placement.grade === "D" && (placement.destination !== "garbage" || placement.opportunityTrack !== null)) errors.push(`${placement.asin}: D 级泄漏到机会线`);
    if (placement.grade !== "D" && (placement.destination === "garbage" || placement.opportunityTrack === null)) errors.push(`${placement.asin}: 非 D 产品没有唯一机会方向`);
  }

  if (Object.values(grades).reduce((sum, count) => sum + count, 0) !== placements.length) errors.push("主等级计数与正式产品总数不一致");
  if (Object.values(destinations).reduce((sum, count) => sum + count, 0) !== placements.length) errors.push("主归位计数与正式产品总数不一致");
  if (traceable !== placements.length) errors.push("存在无法追溯到唯一主归位的正式产品");

  return { total: placements.length, grades, destinations, labels, overlaps, traceable, errors, valid: errors.length === 0 };
}
