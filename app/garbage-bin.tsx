"use client";
/* eslint-disable @next/next/no-img-element -- product images come from marketplace URLs */

import { useMemo, useRef, useState } from "react";
import PaginationControls, { usePagination } from "./pagination";
import { fullTitleZh } from "./full-title-translations";
import ProductDecisionActions from "./product-decision-actions";
import type { Grade } from "./recommendation-grade";

type GarbageProduct = {
  asin: string;
  title: string;
  titleZh?: string;
  category: string;
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

export default function GarbageBin({ products, onGrade, onRecycle }: {
  products: GarbageProduct[];
  onGrade: (product: GarbageProduct, grade: Grade) => void;
  onRecycle: (product: GarbageProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) => `${product.asin} ${product.title} ${fullTitleZh(product.asin, product.titleZh, product.title, product.category)} ${product.category}`.toLowerCase().includes(normalized));
  }, [products, query]);
  const pager = usePagination(filtered);
  const anchor = useRef<HTMLElement>(null);
  const goPage = (page: number) => {
    pager.setPage(page);
    window.requestAnimationFrame(() => anchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const controls = () => <PaginationControls page={pager.page} totalPages={pager.totalPages} start={pager.start} end={pager.end} total={filtered.length} onPageChange={goPage} />;

  return <section className="panel rejected-panel" ref={anchor}>
    <div className="section-title">
      <div>
        <span className="eyebrow">HARD REJECTION REVIEW</span>
        <h2>淘汰复核库</h2>
        <p>只收纳确认触发硬性禁做条件的产品。保留主图、双语标题、原链接和淘汰依据，便于逐条复核是否误筛。</p>
      </div>
      <div className="actions"><span className="tag">D 类 · {products.length} 款淘汰</span></div>
    </div>
    <div className="table-search-bar">
      <label>复核检索<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 ASIN、英文/中文标题或类目" /></label>
      <span>{filtered.length} 款匹配</span>
    </div>
    {controls()}
    <div className="table-wrap">
      <table>
        <thead><tr><th>主图 / ASIN / 商品</th><th>类目</th><th>价格</th><th>淘汰依据</th><th>操作</th></tr></thead>
        <tbody>{pager.pageItems.map(product => <tr key={product.asin}>
          <td><div className="table-product"><GarbageImage product={product} /><div><b>{product.asin}</b><span><a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.title}</a><small className="title-zh">{fullTitleZh(product.asin, product.titleZh, product.title, product.category)}</small></span></div></div></td>
          <td>{product.category}</td>
          <td>{product.price > 0 ? `$${product.price}` : "待补"}</td>
          <td><div className="rejection-reason"><span className="risk risk-高">硬性条件</span><small>{product.hardRejectReasons?.slice(0, 3).join("；") || "已触发硬性禁做规则"}</small></div></td>
          <td><ProductDecisionActions grade="D" onGrade={(grade) => onGrade(product, grade)} onRecycle={() => onRecycle(product)} compact /></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <div className="empty table-empty"><b>{products.length ? "没有匹配记录" : "淘汰库为空"}</b><span>{products.length ? "请更换 ASIN、标题或类目关键词。" : "只有确认不符合公司硬性条件的产品才会进入这里。"}</span></div>}
    </div>
    {controls()}
  </section>;
}
