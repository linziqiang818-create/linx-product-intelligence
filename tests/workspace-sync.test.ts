import assert from "node:assert/strict";
import test from "node:test";
import { mergeWorkspaceRecords, newerWorkspaceRecords, splitWorkspaceRecords, type WorkspaceRecord } from "../app/workspace-sync.ts";

type Product = { asin: string; title: string };

test("newer per-ASIN product edits win across devices", () => {
  const home: Record<string, WorkspaceRecord<Product>> = { ASIN000001: { asin: "ASIN000001", location: "active", product: { asin: "ASIN000001", title: "Home" }, updatedAt: "2026-08-01T00:00:00.000Z" } };
  const office: Record<string, WorkspaceRecord<Product>> = { ASIN000001: { asin: "ASIN000001", location: "active", product: { asin: "ASIN000001", title: "Office" }, updatedAt: "2026-08-02T00:00:00.000Z" } };
  assert.equal(mergeWorkspaceRecords(home, office).ASIN000001.product?.title, "Office");
  assert.deepEqual(newerWorkspaceRecords(home, office), []);
  assert.equal(newerWorkspaceRecords(office, home).length, 1);
});

test("large product imports are split into bounded patches", () => {
  const records: WorkspaceRecord<Product>[] = Array.from({ length: 60 }, (_, index) => ({
    asin: `ASIN${String(index).padStart(6, "0")}`,
    location: "active",
    product: { asin: `ASIN${String(index).padStart(6, "0")}`, title: "Imported ".repeat(20) },
    updatedAt: "2026-08-02T00:00:00.000Z",
  }));
  const chunks = splitWorkspaceRecords(records, 2_000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => JSON.stringify({ records: chunk }).length <= 2_000));
  assert.equal(chunks.flat().length, records.length);
});
