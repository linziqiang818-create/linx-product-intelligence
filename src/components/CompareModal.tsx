import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { compact, kg, money, percent, useApp } from "../store";
import { MATERIAL_LABELS, type Product } from "../types";
import { TierBadge, Thumb } from "./ProductCard";
import { CloseIcon } from "./icons";

export default function CompareModal() {
  const { compare, setCompare, cache, openDetail } = useApp();
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!compare.length) {
      setProducts([]);
      return;
    }
    Promise.all(compare.map((asin) => cache.get(asin) ?? api.product(asin))).then(setProducts).catch(() => setProducts([]));
  }, [compare, cache]);

  useEffect(() => {
    if (!compare.length) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCompare([]);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compare, setCompare]);

  if (!compare.length) return null;
  const rows: { label: string; render: (p: Product) => string | number }[] = [
    { label: "价格", render: (p) => money(p.price) },
    { label: "月销", render: (p) => (p.monthlySalesRange ? `${compact(p.monthlySales)} (${p.monthlySalesRange})` : compact(p.monthlySales)) },
    { label: "增长", render: (p) => percent(p.salesGrowth) },
    { label: "评分 / 评论", render: (p) => `${p.rating || "—"} / ${compact(p.reviews)}` },
    { label: "预估利润率", render: (p) => (p.marginEst > 0 ? `${Math.round(p.marginEst)}%` : "—") },
    { label: "包装毛重", render: (p) => kg(p.packageGrossKg) },
    { label: "材质", render: (p) => MATERIAL_LABELS[p.materialGroup] ?? p.materialGroup },
    { label: "推荐分", render: (p) => Math.round(p.finalScore) },
    { label: "标签", render: (p) => p.tags.join("、") || "—" },
  ];
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setCompare([])}>
      <section className="modal compare">
        <header className="modal-head">
          <h2>并排对比</h2>
          <button className="btn btn-icon" onClick={() => setCompare([])} aria-label="关闭"><CloseIcon size={14} /></button>
        </header>
        <div className="compare-grid" style={{ gridTemplateColumns: `120px repeat(${products.length}, minmax(0, 1fr))` }}>
          <div className="compare-label" />
          {products.map((p) => (
            <div key={p.asin} className="compare-col-head" onClick={() => openDetail(p.asin)} role="button" tabIndex={0}>
              <Thumb product={p} size="small" />
              <b>{p.titleZh || p.title}</b>
              <TierBadge product={p} />
            </div>
          ))}
          {rows.map((row) => (
            <Fragment key={row.label}>
              <div className="compare-label">{row.label}</div>
              {products.map((p) => (
                <div key={p.asin} className="compare-cell">{row.render(p)}</div>
              ))}
            </Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}
