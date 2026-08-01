export type VariantProduct = {
  asin: string;
  title: string;
  parentAsin?: string;
  brand?: string;
  imageUrl?: string;
  titleZh?: string;
  admissionEvidence?: unknown;
  reviews?: number;
  monthlySalesEstimate?: { max?: number };
  variantAsins?: string[];
  variantCount?: number;
};

const validAsin = (value: unknown) => /^[A-Z0-9]{10}$/.test(String(value ?? "").toUpperCase());
const variantWords = /\b(?:california king|queen|king|twin xl|twin|full|black|white|walnut|brown|beige|gray|grey|oak|natural|rustic)\b/g;
const variantNumber = /\b\d+(?:\.\d+)?\s*(?:inch|in|ft|cm|mm)?\b/g;
const trailingVariant = /\([^)]*(?:color|size|inch|queen|king|twin|full|oak|black|white|walnut|brown)[^)]*\)\s*$/i;

export function normalizedVariantFamilyTitle(title: string) {
  return String(title ?? "")
    .toLowerCase()
    .replace(trailingVariant, " ")
    .replace(variantWords, " ")
    .replace(variantNumber, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function variantFamilyKey(product: VariantProduct) {
  const normalizedTitle = normalizedVariantFamilyTitle(product.title);
  if (normalizedTitle.length >= 70) {
    const brand = String(product.brand ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    return `title:${brand}|${normalizedTitle}`;
  }
  const parent = validAsin(product.parentAsin) ? String(product.parentAsin).toUpperCase() : String(product.asin).toUpperCase();
  return `parent:${parent}`;
}

export function productIdentityAsins(product: VariantProduct) {
  return [...new Set([
    product.asin,
    product.parentAsin,
    ...(product.variantAsins ?? []),
  ].filter((asin): asin is string => validAsin(asin)).map((asin) => asin.toUpperCase()))];
}

function completeness(product: VariantProduct) {
  const parent = String(product.parentAsin ?? "").toUpperCase();
  return Number(validAsin(parent) && parent !== product.asin.toUpperCase()) * 20
    + Number(Boolean(product.imageUrl)) * 5
    + Number(Boolean(product.titleZh)) * 4
    + Number(Boolean(product.admissionEvidence)) * 3
    + Math.min(4, Math.log10(Math.max(1, Number(product.reviews ?? 0))))
    + Math.min(3, Math.log10(Math.max(1, Number(product.monthlySalesEstimate?.max ?? 0))));
}

export function collapseProductVariants<T extends VariantProduct>(products: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    const key = variantFamilyKey(product);
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }

  return [...groups.values()].map((group) => {
    const ranked = [...group].sort((a, b) => completeness(b) - completeness(a));
    const representative = ranked[0];
    const variantAsins = [...new Set(group.flatMap((product) => [
      product.asin.toUpperCase(),
      ...(product.variantAsins ?? []).map((asin) => asin.toUpperCase()),
    ]))];
    const verifiedParents = [...new Set(group
      .map((product) => String(product.parentAsin ?? "").toUpperCase())
      .filter(validAsin))];
    const representativeParent = String(representative.parentAsin ?? "").toUpperCase();
    const parentAsin = validAsin(representativeParent)
      ? representativeParent
      : verifiedParents[0] ?? representative.asin.toUpperCase();

    if (variantAsins.length === 1) {
      const {
        variantAsins: _variantAsins,
        variantCount: _variantCount,
        relatedParentAsins: _relatedParentAsins,
        ...single
      } = representative as T & { relatedParentAsins?: string[] };
      void _variantAsins;
      void _variantCount;
      void _relatedParentAsins;
      return single as T & { parentAsin?: string; variantAsins?: string[]; variantCount?: number };
    }

    return {
      ...representative,
      parentAsin,
      variantAsins,
      variantCount: variantAsins.length,
      ...(verifiedParents.length > 1 ? { relatedParentAsins: verifiedParents } : {}),
    };
  });
}
