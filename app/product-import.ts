export type ProductImportPatch<T extends { asin: string; title: string; imageUrl?: string; importedAt?: string }> = {
  product: T;
  providedFields: Array<keyof T>;
  rowNumber: number;
};

export type ProductImportPreviewRow<T> = {
  product: T;
  status: "new" | "update";
  missingImage: boolean;
  rowNumbers: number[];
};

export type ProductImportPreview<T> = {
  rows: ProductImportPreviewRow<T>[];
  newCount: number;
  updateCount: number;
  missingImageCount: number;
  duplicateRowCount: number;
  skippedRows: Array<{ rowNumber: number; asin: string; reason: string }>;
};

export function hasImportCellValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function mergeProvidedProductFields<T extends { asin: string; title: string; imageUrl?: string; importedAt?: string }>(
  existing: T,
  incoming: T,
  providedFields: readonly (keyof T)[],
) {
  const merged = { ...existing } as T;
  for (const field of providedFields) {
    if (field === "asin") continue;
    merged[field] = incoming[field];
  }
  merged.asin = existing.asin.toUpperCase();
  return merged;
}

function coalescePatches<T extends { asin: string; title: string; imageUrl?: string; importedAt?: string }>(
  patches: readonly ProductImportPatch<T>[],
) {
  const byAsin = new Map<string, ProductImportPatch<T> & { rowNumbers: number[] }>();
  let duplicateRowCount = 0;
  for (const patch of patches) {
    const asin = String(patch.product.asin ?? "").trim().toUpperCase();
    const normalized = { ...patch.product, asin };
    const previous = byAsin.get(asin);
    if (!previous) {
      byAsin.set(asin, { ...patch, product: normalized, rowNumbers: [patch.rowNumber] });
      continue;
    }
    duplicateRowCount += 1;
    const providedFields = [...new Set([...previous.providedFields, ...patch.providedFields])];
    byAsin.set(asin, {
      product: mergeProvidedProductFields(previous.product, normalized, patch.providedFields),
      providedFields,
      rowNumber: previous.rowNumber,
      rowNumbers: [...previous.rowNumbers, patch.rowNumber],
    });
  }
  return { patches: [...byAsin.values()], duplicateRowCount };
}

export function prepareProductImport<T extends { asin: string; title: string; imageUrl?: string; importedAt?: string }>(
  existingProducts: readonly T[],
  sourcePatches: readonly ProductImportPatch<T>[],
): ProductImportPreview<T> {
  const existing = new Map(existingProducts.map((product) => [product.asin.toUpperCase(), product]));
  const { patches, duplicateRowCount } = coalescePatches(sourcePatches);
  const rows: ProductImportPreviewRow<T>[] = [];
  const skippedRows: ProductImportPreview<T>["skippedRows"] = [];

  for (const patch of patches) {
    const asin = patch.product.asin.toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      skippedRows.push({ rowNumber: patch.rowNumber, asin, reason: "ASIN 必须是 10 位字母或数字" });
      continue;
    }
    const previous = existing.get(asin);
    const product = previous
      ? mergeProvidedProductFields(previous, patch.product, patch.providedFields)
      : patch.product;
    if (!String(product.title ?? "").trim()) {
      skippedRows.push({ rowNumber: patch.rowNumber, asin, reason: "新产品缺少英文标题" });
      continue;
    }
    rows.push({
      product: { ...product, asin },
      status: previous ? "update" : "new",
      missingImage: !String(product.imageUrl ?? "").trim(),
      rowNumbers: patch.rowNumbers,
    });
  }

  return {
    rows,
    newCount: rows.filter((row) => row.status === "new").length,
    updateCount: rows.filter((row) => row.status === "update").length,
    missingImageCount: rows.filter((row) => row.missingImage).length,
    duplicateRowCount,
    skippedRows,
  };
}
