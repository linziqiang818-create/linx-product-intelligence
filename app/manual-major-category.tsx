"use client";

import { createContext, useContext, type ReactNode } from "react";
import { amazonMajorCategoryFor, majorCategories, type MajorCategoryProduct } from "./major-category";

type ManualCategoryProduct = MajorCategoryProduct & {
  asin: string;
};

type AssignCategory = (asin: string, categoryId: string) => void;

const ManualCategoryContext = createContext<AssignCategory>(() => undefined);

export function ManualCategoryProvider({ onAssign, children }: { onAssign: AssignCategory; children: ReactNode }) {
  return <ManualCategoryContext.Provider value={onAssign}>{children}</ManualCategoryContext.Provider>;
}

export function ManualMajorCategoryField({ product }: { product: ManualCategoryProduct }) {
  const assign = useContext(ManualCategoryContext);
  if (amazonMajorCategoryFor(product).id !== "unclassified") return null;
  return <label className="manual-major-category" title={product.category ? `Amazon 原始类目：${product.category}` : "Amazon 实际类目待补"}>
    <span>{product.manualMajorCategoryId ? "人工大类目" : "未分类 · 手动归类"}</span>
    <select value={product.manualMajorCategoryId ?? ""} onChange={(event) => assign(product.asin, event.target.value)} aria-label={`为 ${product.asin} 选择 LINX 大类目`}>
      <option value="">保持未分类</option>
      {majorCategories.filter((category) => category.id !== "unclassified").map((category) => <option key={category.id} value={category.id}>{category.zh} / {category.en}</option>)}
    </select>
  </label>;
}
