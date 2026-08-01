"use client";
/* eslint-disable @next/next/no-img-element -- product images come from marketplace URLs */

import { useMemo, useRef, useState } from "react";
import PaginationControls, { usePagination } from "./pagination";
import { fullTitleZh } from "./full-title-translations";
import { ManualMajorCategoryField } from "./manual-major-category";
import ProductDecisionActions from "./product-decision-actions";
import type { Grade } from "./recommendation-grade";

type GarbageProduct = {
  asin: string;
  title: string;
  titleZh?: string;
  category: string;
  manualMajorCategoryId?: string;
  price: number;
  sourceUrl: string;
  imageUrl?: string;
  hardRejectReasons?: string[];
};

function GarbageImage({ product }: { product: GarbageProduct }) {
  const [failed, setFailed] = useState(false);
  return <span className="table-product-image garbage-image">{product.imageUrl && !failed
    ? <img src={product.imageUrl} alt={`${product.title} 主图`} loading="lazy" onError={() => setFailed(true)} />
    : <small>{failed ? "主图加载失败" : "主图待补"}</small>}
  </span>;
}

export default function GarbageBin({ products, selected, favorites, toggleSelected, selectVisible, onFavorite, onFavoriteSelected, onGradeSelected, onRecycleSelected, onGrade, onRecycle }: {
  products: GarbageProduct[];
  selected: Set<string>;
  favorites: Set<string>;
  toggleSelected: (asin: string) => void;
  selectVisible: (products: Array<{ asin: string }>, checked: boolean) => void;
  onFavorite: (asin: string) => void;
  onFavoriteSelected: () => void;
  onGradeSelected: (grade: Grade) => void;
  onRecycleSelected: () => void;
  onGrade: (product: GarbageProduct, grade: Grade) => void;
  onRecycle: (product: GarbageProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) => `${product.asin} ${product.title} ${fullTitleZh(product.asin, product.titleZh, product.title, product.category)} ${product.category}`.toLowerCase().includes(normalized));
  }, [products, query]);
  const pager = usePagination(filtered, query.trim().toLowerCase());
  const anchor = useRef<HTMLElement>(null);
  const goPage = (page: number) => {
    pager.setPage(page);
    window.requestAnimationFrame(() => anchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const pageSelected = pager.pageItems.filter((product) => selected.has(product.asin)).length;
  const controls = () => <PaginationControls page={pager.page} totalPages={pager.totalPages} start={pager.start} end={pager.end} total={filtered.length} pageSize={pager.pageSize} pageSelection={{ checked: pager.pageItems.length > 0 && pageSelected === pager.pageItems.length, selectedCount: pageSelected, total: pager.pageItems.length, onChange: (checked) => selectVisible(pager.pageItems, checked) }} onPageChange={goPage} onPageSizeChange={pager.setPageSize} />;
  const visibleSelected = filtered.filter((product) => selected.has(product.asin)).length;
  const allSelected = filtered.length > 0 && visibleSelected === filtered.length;

  return <section className="panel rejected-panel" ref={anchor}>
    <div className="section-title">
      <div>
        <span className="eyebrow">D-LIST REVIEW</span>
        <h2>淘汰复核库</h2>
        <p>这里是系统筛选后认为不适合当前开发方向的产品，不代表永远不能做。保留完整证据供你持续纠正误判；你确认绝不开发的产品再放入回收站。</p>
      </div>
      <div className="actions"><span className="tag">D 类 · {products.length} 款淘汰</span></div>
    </div>
    <div className="table-search-bar">
      <label>复核检索<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 ASIN、英文/中文标题或类目" /></label>
      <span>{filtered.length} 款匹配</span>
    </div>
    <div className="bulk-bar">
      <label><input type="checkbox" checked={allSelected} onChange={(event) => selectVisible(filtered, event.target.checked)} /><span>{allSelected ? "取消全部筛选结果" : "选择全部筛选结果"}</span></label>
      <span className="result-count">{filtered.length} 个结果</span>
      {selected.size > 0 && <div className="bulk-actions"><b>已选 {selected.size}</b><button onClick={onFavoriteSelected}>♥ 批量收藏</button><span className="bulk-grade-label">批量定级</span>{(["A", "B", "C", "D"] as Grade[]).map((grade) => <button className={`bulk-grade bulk-grade-${grade}`} key={grade} onClick={() => onGradeSelected(grade)}>{grade}</button>)}<button className="danger-action" onClick={onRecycleSelected}>批量回收</button></div>}
    </div>
    {controls()}
    <div className="table-wrap">
      <table>
        <thead><tr><th className="check-col"></th><th>主图 / ASIN / 商品</th><th>类目</th><th>价格</th><th>淘汰依据</th><th>操作</th></tr></thead>
        <tbody>{pager.pageItems.map(product => <tr key={product.asin} className={selected.has(product.asin) ? "selected-row" : ""}>
          <td><input type="checkbox" checked={selected.has(product.asin)} onChange={() => toggleSelected(product.asin)} /></td>
          <td><div className="table-product"><GarbageImage product={product} /><button className={`heart ${favorites.has(product.asin) ? "active" : ""}`} onClick={() => onFavorite(product.asin)} aria-label={favorites.has(product.asin) ? "取消收藏" : "收藏产品"}>♥</button><div><b>{product.asin}</b><span><a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.title}</a><small className="title-zh">{fullTitleZh(product.asin, product.titleZh, product.title, product.category)}</small><ManualMajorCategoryField product={product} /></span></div></div></td>
          <td><span className="category-ellipsis" title={product.category}>{product.category}</span></td>
          <td>{product.price > 0 ? `$${product.price}` : "待补"}</td>
          <td><div className="rejection-reason"><span className="risk risk-高">筛选依据</span><small>{product.hardRejectReasons?.slice(0, 3).join("；") || "系统判断暂不适合当前开发方向，等待人工复核"}</small></div></td>
          <td><ProductDecisionActions grade="D" onGrade={(grade) => onGrade(product, grade)} onRecycle={() => onRecycle(product)} compact /></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <div className="empty table-empty"><b>{products.length ? "没有匹配记录" : "淘汰库为空"}</b><span>{products.length ? "请更换 ASIN、标题或类目关键词。" : "系统判断不适合当前开发方向的产品会进入这里，等待你的复核。"}</span></div>}
    </div>
    {controls()}
  </section>;
}
