// 类目中文词典：Amazon 类目路径片段 → 中文。找不到的片段保留原文。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let dictionary = {};
try {
  dictionary = JSON.parse(readFileSync(join(here, "data", "category-zh.json"), "utf8"));
} catch {
  dictionary = {};
}

const SEPARATOR = /[/:>›»|]/;

export const categoryDictionary = dictionary;

export function segmentsOf(category) {
  return String(category ?? "").split(SEPARATOR).map((s) => s.trim()).filter(Boolean);
}

export function translateSegment(segment) {
  return dictionary[segment] ?? segment;
}

// 叶子类目中文（最后一段）
export function categoryLeafZh(category) {
  const segments = segmentsOf(category);
  return translateSegment(segments.at(-1) ?? "");
}

// 整条路径翻译，用 › 连接
export function categoryPathZh(category) {
  return segmentsOf(category).map(translateSegment).join(" › ");
}
