import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fullTitleZh } from "../app/full-title-translations.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["real-products.json", "rejected-products.json"];
const placeholder = /待自动翻译|待补充中文标题/;
const force = process.argv.includes("--all");
const preservedManualTitles = new Set(["B0FXRGJ4S9", "B0DSW9NXM6"]);

for (const filename of files) {
  const path = join(projectRoot, "app", filename);
  const temporaryPath = `${path}.tmp`;
  const products = JSON.parse(await readFile(path, "utf8"));
  let changed = 0;

  for (const product of products) {
    const current = String(product.titleZh ?? "").trim();
    if (preservedManualTitles.has(product.asin) && current) continue;
    if (!force && current && !placeholder.test(current)) continue;
    product.titleZh = fullTitleZh(product.asin, "", String(product.title ?? ""), String(product.category ?? ""));
    if (!/[\u3400-\u9fff]/.test(product.titleZh) || placeholder.test(product.titleZh)) {
      throw new Error(`${filename} ${product.asin}: failed to generate a usable Chinese title`);
    }
    changed += 1;
  }

  await writeFile(temporaryPath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
  console.log(`${filename}: backfilled ${changed}, total ${products.length}`);
}
