import fs from "node:fs";
import path from "node:path";
import { collapseProductVariants, variantFamilyKey, type VariantProduct } from "../app/product-variants.ts";

type Product = VariantProduct & Record<string, unknown>;
type ArchivedVariant = {
  archivedAt: string;
  pool: string;
  canonicalAsin: string;
  canonicalParentAsin: string;
  familyKey: string;
  product: Product;
};

const root = path.resolve(import.meta.dirname, "..");
const apply = process.argv.includes("--apply");
const archivedAt = new Date().toISOString();
const poolFiles = ["real-products.json", "rejected-products.json"];
const archivePath = path.join(root, "app", "product-variant-archive.json");
const existingArchive = fs.existsSync(archivePath)
  ? JSON.parse(fs.readFileSync(archivePath, "utf8")) as ArchivedVariant[]
  : [];
const archiveByAsin = new Map(existingArchive.map((entry) => [entry.product.asin, entry]));
const report: Record<string, unknown> = { apply, archivedAt, pools: {} };

for (const file of poolFiles) {
  const filePath = path.join(root, "app", file);
  const products = JSON.parse(fs.readFileSync(filePath, "utf8")) as Product[];
  const collapsed = collapseProductVariants(products) as Product[];
  const keptAsins = new Set(collapsed.map((product) => product.asin));
  const canonicalByFamily = new Map(collapsed.map((product) => [variantFamilyKey(product), product]));
  const removed = products.filter((product) => !keptAsins.has(product.asin));

  for (const product of removed) {
    const canonical = canonicalByFamily.get(variantFamilyKey(product));
    if (!canonical) throw new Error(`Missing canonical product for ${product.asin}`);
    archiveByAsin.set(product.asin, {
      archivedAt,
      pool: file,
      canonicalAsin: canonical.asin,
      canonicalParentAsin: String(canonical.parentAsin ?? canonical.asin),
      familyKey: variantFamilyKey(product),
      product,
    });
  }

  report.pools[file] = {
    before: products.length,
    after: collapsed.length,
    variantGroups: collapsed.filter((product) => Number(product.variantCount ?? 1) > 1).length,
    variantsArchived: removed.length,
  };
  if (apply) fs.writeFileSync(filePath, `${JSON.stringify(collapsed, null, 2)}\n`);
}

if (apply) {
  const archive = [...archiveByAsin.values()].sort((a, b) => a.product.asin.localeCompare(b.product.asin));
  fs.writeFileSync(archivePath, `${JSON.stringify(archive, null, 2)}\n`);
}

report.archiveBefore = existingArchive.length;
report.archiveAfter = archiveByAsin.size;
console.log(JSON.stringify(report, null, 2));
