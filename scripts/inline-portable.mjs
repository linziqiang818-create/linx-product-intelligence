import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = join(projectRoot, "dist-pages");
const outputRoot = join(projectRoot, ".run");
const outputFile = join(outputRoot, "LINX.html");

let html = await readFile(join(buildRoot, "index.html"), "utf8");

const stylesheet = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/i);
const moduleScript = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["'][^>]*><\/script>/i);

if (!stylesheet || !moduleScript) {
  throw new Error("Portable build assets were not found in dist-pages/index.html.");
}
if (!html.includes("</body>")) {
  throw new Error("Portable build body closing tag was not found.");
}

const localAsset = (assetPath) => join(buildRoot, assetPath.replace(/^\.\//, "").replace(/^\//, ""));
const css = await readFile(localAsset(stylesheet[1]), "utf8");
const javascript = (await readFile(localAsset(moduleScript[1]), "utf8"))
  .replaceAll("import.meta.url", "document.baseURI")
  .replace(/<\/script/gi, "<\\/script");

html = html
  .replace(stylesheet[0], () => `<style>${css}</style>`)
  .replace(moduleScript[0], "")
  .replace("</body>", () => `<script>${javascript}</script></body>`);

await mkdir(outputRoot, { recursive: true });
await writeFile(outputFile, html, "utf8");

console.log(`Portable LINX file created: ${outputFile}`);
