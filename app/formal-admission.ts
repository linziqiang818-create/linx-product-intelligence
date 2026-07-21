export type MinimumAdmissionRecord = {
  asin: string;
  title: string;
  amazonUrl?: string;
  sourceUrl?: string;
  discoverySource?: string;
  category?: string;
  imageUrl?: string;
  imageEvidence?: {
    kind?: string;
    sourceUrl?: string;
    asin?: string;
  };
  admissionEvidence?: {
    sourceUrl?: string;
    observedAt?: string;
    kind?: string;
  };
};

export type MinimumAdmissionResult = {
  eligible: boolean;
  canonicalAmazonUrl: string;
  issues: string[];
};

const asinPattern = /^[A-Z0-9]{10}$/;

function isPublicHttpUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function canonicalAmazonUrl(asin: string) {
  return `https://www.amazon.com/dp/${asin}`;
}

/**
 * Minimum gate for the cumulative formal pool. Commercial fields such as
 * price, reviews, BSR and dimensions are deliberately not part of this gate:
 * absent observations remain data-pending and must never be synthesized.
 */
export function minimumFormalAdmission(
  record: MinimumAdmissionRecord,
  hardRejected = false,
): MinimumAdmissionResult {
  const asin = record.asin.trim().toUpperCase();
  const expectedUrl = canonicalAmazonUrl(asin);
  const listingUrl = record.amazonUrl ?? record.sourceUrl ?? "";
  const issues: string[] = [];

  if (!asinPattern.test(asin)) issues.push("invalid ASIN");
  if (record.title.trim().length <= 10 || !/[A-Za-z]/.test(record.title)) issues.push("incomplete English title");
  if (listingUrl !== expectedUrl) issues.push("missing canonical Amazon US link");
  const hasVerifiedMainImage =
    (record.imageUrl?.startsWith("https://m.media-amazon.com/") ?? false) ||
    (isPublicHttpUrl(record.imageUrl) &&
      record.imageEvidence?.kind === "public-catalog-main-image" &&
      record.imageEvidence.asin === asin &&
      isPublicHttpUrl(record.imageEvidence.sourceUrl));
  if (!hasVerifiedMainImage) issues.push("missing verified public main image");

  const hasPublicEvidence =
    (record.imageUrl?.startsWith("https://m.media-amazon.com/") ?? false) ||
    (Boolean(record.category?.trim()) && isPublicHttpUrl(record.discoverySource)) ||
    isPublicHttpUrl(record.admissionEvidence?.sourceUrl);
  if (!hasPublicEvidence) issues.push("missing traceable public evidence");
  if (hardRejected) issues.push("grade D hard rejection");

  return { eligible: issues.length === 0, canonicalAmazonUrl: expectedUrl, issues };
}
