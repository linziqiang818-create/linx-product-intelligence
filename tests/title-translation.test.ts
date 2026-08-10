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

test("repairs generic or mismatched imported Chinese titles", () => {
  assert.match(chineseTitleFromRow({ 商品标题: "55 Gallon Aquarium Stand with Storage", 小类目: "Aquarium Stands", 中文标题: "家居产品，适用于沙龙" }), /鱼缸底柜/);
  assert.doesNotMatch(chineseTitleFromRow({ 商品标题: "Mobile Chicken Coop with Wheels", 小类目: "Small Animal Outdoor Pens", 中文标题: "Mobile 家居产品，适用于沙龙" }), /沙龙/);
  assert.match(chineseTitleFromRow({ 商品标题: "Mobile Chicken Coop with Wheels", 小类目: "Small Animal Outdoor Pens", 中文标题: "Mobile 家居产品，适用于沙龙" }), /鸡舍/);
  assert.match(furnitureTitleZh("Hall Tree with Bench and Shoe Storage"), /门厅衣帽柜/);
  assert.match(furnitureTitleZh("Commercial Utility Cart with Wheels"), /多功能推车/);
  assert.equal(chineseTitleFromRow({ 商品标题: "Modern Manicure Desk", 中文标题: "现代美甲桌，适用于沙龙" }), "现代美甲桌，适用于沙龙");
});
