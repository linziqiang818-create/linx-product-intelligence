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
const diagnostics = `<script id="linx-startup-diagnostics">(()=>{const show=(value)=>{const root=document.getElementById("root");if(!root)return;const panel=document.createElement("main");panel.style.cssText="max-width:760px;margin:64px auto;padding:28px;border:1px solid #d9b5af;border-radius:14px;background:#fff7f5;color:#6f211b;font:16px/1.6 system-ui,sans-serif";const title=document.createElement("h1");title.textContent="LINX 启动失败";const help=document.createElement("p");help.textContent="请把本页完整截图发给 Codex，错误信息如下：";const details=document.createElement("pre");details.style.cssText="white-space:pre-wrap;overflow-wrap:anywhere";details.textContent=String(value||"未知错误");panel.append(title,help,details);root.replaceChildren(panel)};window.addEventListener("error",event=>show(event.error?.stack||event.message));window.addEventListener("unhandledrejection",event=>show(event.reason?.stack||event.reason))})();</script>`;

html = html
  .replace(stylesheet[0], () => `<style>${css}</style>`)
  .replace(moduleScript[0], "")
  .replace("</body>", () => `${diagnostics}<script id="linx-app-bundle">${javascript}</script></body>`);

const rootPosition = html.indexOf('<div id="root"></div>');
const appPosition = html.indexOf('<script id="linx-app-bundle">');
if (rootPosition < 0 || appPosition < 0 || appPosition < rootPosition) {
  throw new Error("Portable app bundle must run after the LINX root element exists.");
}

await mkdir(outputRoot, { recursive: true });
await writeFile(outputFile, html, "utf8");

console.log(`Portable LINX file created: ${outputFile}`);
