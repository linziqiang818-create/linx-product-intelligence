import assert from "node:assert/strict";
import test from "node:test";
import { chineseTitleFromRow, furnitureTitleZh } from "../app/title-translation.ts";

test("creates concise Chinese furniture titles from English listings", () => {
  assert.equal(
    furnitureTitleZh("Modern L-Shaped Reception Desk with Lockable Drawers and Storage"),
    "现代 · 可上锁 · 带抽屉 · 带收纳 前台接待台",
  );
  assert.equal(
    furnitureTitleZh("Heavy Duty Adjustable Industrial Shelving Unit"),
    "工业风 · 重型 · 可调节 工业置物架",
  );
});

test("prefers an imported Chinese title over automatic translation", () => {
  assert.equal(chineseTitleFromRow({ 商品标题: "Modern Desk", 中文标题: "现代办公桌" }), "现代办公桌");
  assert.equal(chineseTitleFromRow({ 商品标题: "Modern Standing Desk" }), "现代 电动升降桌");
});
