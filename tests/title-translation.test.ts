import assert from "node:assert/strict";
import test from "node:test";
import { chineseTitleFromRow, furnitureTitleZh } from "../app/title-translation.ts";
import { fullTitleTranslations, fullTitleZh } from "../app/full-title-translations.ts";

test("does not show keyword summaries as Chinese titles", () => {
  assert.equal(furnitureTitleZh("Modern L-Shaped Reception Desk"), "中文完整标题待自动翻译");
  assert.equal(Object.keys(fullTitleTranslations).length, 50);
  assert.ok(Object.values(fullTitleTranslations).every((title) => title.length >= 20));
  assert.match(fullTitleZh("B0GDQCBKDW"), /L形.*可上锁抽屉.*70\.9/);
});

test("prefers an imported Chinese title over automatic translation", () => {
  assert.equal(chineseTitleFromRow({ 商品标题: "Modern Desk", 中文标题: "现代办公桌" }), "现代办公桌");
  assert.equal(chineseTitleFromRow({ 商品标题: "Modern Standing Desk" }), "中文完整标题待自动翻译");
});
