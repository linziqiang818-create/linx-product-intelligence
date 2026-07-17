import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("portable HTML starts LINX after its root exists and has visible diagnostics", () => {
  const html = readFileSync(new URL("../.run/LINX.html", import.meta.url), "utf8");
  const rootPosition = html.indexOf('<div id="root"></div>');
  const diagnosticsPosition = html.indexOf('<script id="linx-startup-diagnostics">');
  const appPosition = html.indexOf('<script id="linx-app-bundle">');
  const diagnostics = html.match(/<script id="linx-startup-diagnostics">([\s\S]*?)<\/script>/)?.[1] ?? "";
  const app = html.match(/<script id="linx-app-bundle">([\s\S]*)<\/script><\/body>/)?.[1] ?? "";

  assert.ok(rootPosition >= 0);
  assert.ok(diagnosticsPosition > rootPosition);
  assert.ok(appPosition > diagnosticsPosition);
  assert.equal((html.match(/<script[^>]+src=/g) ?? []).length, 0);
  assert.equal((html.match(/<link[^>]+rel=["']stylesheet/g) ?? []).length, 0);
  assert.equal(app.includes("import.meta"), false);
  assert.ok(diagnostics.includes("unhandledrejection"));
  assert.ok(app.length > 100_000);
  assert.doesNotThrow(() => new Function(diagnostics));
  assert.doesNotThrow(() => new Function(app));
});
