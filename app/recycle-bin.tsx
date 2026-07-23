"use client";
/* eslint-disable @next/next/no-img-element -- product images come from marketplace URLs */

import { useMemo, useRef, useState } from "react";
import { daysUntilPurge, type RecycledProduct } from "./learning-state";
import PaginationControls, { usePagination } from "./pagination";
import ProductDecisionActions from "./product-decision-actions";
import type { Grade } from "./recommendation-grade";
import { fullTitleZh } from "./full-title-translations";

type DisplayProduct = { asin: string; title: string; titleZh?: string; category: string; price: number; sourceUrl: string; imageUrl?: string };

export default function RecycleBin({ entries, favorites, toggleFavorite, restore }: { entries: RecycledProduct[]; favorites: Set<string>; toggleFavorite: (asin: string) => void; restore: (asin: string, grade: Grade) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => entries.filter((entry) => {
    const product = entry.product as unknown as DisplayProduct;
    return !query.trim() || `${entry.asin} ${product.title} ${product.titleZh} ${product.category}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [entries, query]);
  const pager = usePagination(filtered, query.trim().toLowerCase());
  const anchor = useRef<HTMLElement>(null);
  const goPage = (page: number) => { pager.setPage(page); window.requestAnimationFrame(() => anchor.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const controls = () => <PaginationControls page={pager.page} totalPages={pager.totalPages} start={pager.start} end={pager.end} total={filtered.length} pageSize={pager.pageSize} onPageChange={goPage} onPageSizeChange={pager.setPageSize} />;
  return <section className="panel recycle-panel" ref={anchor}>
    <div className="section-title"><div><span className="eyebrow">30-DAY RECYCLE BIN</span><h2>回收站</h2><p>只放你结合实际情况后确认绝不可能开发的产品，即使它表面符合部分硬性要求。30天内仍可恢复；到期后清除详情，仅保留防止重复导入的 ASIN 标记。</p></div><span className="tag">{entries.length} 款等待清理</span></div>
    <div className="table-search-bar"><label>回收站检索<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 ASIN、英文/中文标题或类目" /></label><span>{filtered.length} 款匹配</span></div>
    {controls()}
    <div className="table-wrap"><table><thead><tr><th>主图 / ASIN / 商品</th><th>原等级</th><th>自动清除</th><th>恢复为</th></tr></thead><tbody>{pager.pageItems.map((entry) => {
      const product = entry.product as unknown as DisplayProduct;
      return <tr key={entry.asin}><td><div className="table-product"><span className="table-product-image">{product.imageUrl ? <img src={product.imageUrl} alt={`${product.title} 主图`} loading="lazy" /> : <small>主图待补</small>}</span><button className={`heart ${favorites.has(entry.asin) ? "active" : ""}`} onClick={() => toggleFavorite(entry.asin)} aria-label={favorites.has(entry.asin) ? "取消收藏" : "收藏产品"}>♥</button><div><b>{entry.asin}</b><span><a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.title}</a><small className="title-zh">{fullTitleZh(entry.asin, product.titleZh, product.title, product.category)}</small></span></div></div></td><td><b className={`grade grade-${entry.previousGrade}`}>{entry.previousGrade}</b></td><td><strong>{daysUntilPurge(entry.purgeAt)} 天后</strong><small className="recycle-date">{new Date(entry.purgeAt).toLocaleDateString("zh-CN")}</small></td><td><ProductDecisionActions grade={entry.previousGrade} onGrade={(grade) => restore(entry.asin, grade)} onRecycle={() => {}} compact showRecycle={false} /></td></tr>;
    })}</tbody></table>{!filtered.length && <div className="empty table-empty"><b>{entries.length ? "没有匹配记录" : "回收站为空"}</b><span>只有你结合实际情况后确认绝不可能开发的产品才进入这里。</span></div>}</div>
    {controls()}
  </section>;
}
