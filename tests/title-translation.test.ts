import assert from "node:assert/strict";
import test from "node:test";
import { chineseTitleFromRow, furnitureTitleZh } from "../app/title-translation.ts";
import { fullTitleTranslations, fullTitleZh } from "../app/full-title-translations.ts";

test("generates readable Chinese development titles when imports do not provide one", () => {
  assert.match(furnitureTitleZh("Modern L-Shaped Reception Desk"), /现代.*前台接待台/);
  const bedTitle = furnitureTitleZh("Queen Platform Bed Frame with Storage Headboard and Charging Station, White");
  assert.match(bedTitle, /床架/);
  assert.match(bedTitle, /储物床头板/);
  assert.match(bedTitle, /充电站/);
  assert.match(bedTitle, /白色/);
  assert.equal(Object.keys(fullTitleTranslations).length, 50);
  assert.ok(Object.values(fullTitleTranslations).every((title) => title.length >= 20));
  assert.match(fullTitleZh("B0GDQCBKDW"), /L形.*可上锁抽屉.*70\.9/);
});

test("prefers an imported Chinese title over automatic translation", () => {
  assert.equal(chineseTitleFromRow({ 商品标题: "Modern Desk", 中文标题: "现代办公桌" }), "现代办公桌");
  assert.match(chineseTitleFromRow({ 商品标题: "Modern Standing Desk" }), /现代.*办公桌/);
});
