import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(projectRoot, "public");
await mkdir(publicRoot, { recursive: true });
await Promise.all([
  copyFile(join(projectRoot, "app", "real-products.json"), join(publicRoot, "real-products.json")),
  copyFile(join(projectRoot, "app", "rejected-products.json"), join(publicRoot, "rejected-products.json")),
]);
console.log("Prepared runtime product data in public/.");
