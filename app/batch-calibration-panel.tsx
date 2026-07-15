"use client";
/* eslint-disable @next/next/no-img-element -- marketplace images use arbitrary Amazon hosts */

import { CSSProperties, useEffect, useMemo, useState } from "react";
import {
  BatchCalibrationCandidate,
  BatchCalibrationState,
  BatchGroupDecision,
  TopAuditDecision,
  batchCoverage,
  buildProductGroups,
  emptyBatchCalibrationState,
  normalizeBatchCalibrationState,
} from "./batch-calibration";

const storageKey = "linx-batch-calibration-v1";
const groupChoices: Array<[BatchGroupDecision, string]> = [
  ["priority", "优先研究"], ["normal", "普通备选"], ["low", "可行但低兴趣"], ["reject", "整组不做"], ["split", "组内差异大"],
];
const auditChoices: Array<[TopAuditDecision, string]> = [
  ["correct", "位置正确"], ["high", "排名太高"], ["low", "排名太低"], ["exclude", "不应出现"],
];
const interestOrder = { priority: 0, normal: 1, unrated: 1, low: 2 } as const;
const gradeOrder = { A: 0, B: 1, C: 2, D: 3 } as const;

function saveJson(state: BatchCalibrationState) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" }));
  anchor.download = "LINX批量校准反馈.json";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export default function BatchCalibrationPanel({ products }: { products: BatchCalibrationCandidate[] }) {
  const groups = useMemo(() => buildProductGroups(products), [products]);
  const topProducts = useMemo(() => [...products]
    .filter((product) => product.grade !== "D")
    .sort((a, b) => interestOrder[a.interestTier] - interestOrder[b.interestTier] || gradeOrder[a.grade] - gradeOrder[b.grade] || b.score - a.score)
    .slice(0, 20), [products]);
  const [state, setState] = useState<BatchCalibrationState>(emptyBatchCalibrationState);
  const [ready, setReady] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const coverage = useMemo(() => batchCoverage(groups, state), [groups, state]);
  const audited = topProducts.filter((product) => state.audit[product.asin]).length;
  const unresolved = coverage.splitProducts + (topProducts.length - audited);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try { setState(normalizeBatchCalibrationState(JSON.parse(localStorage.getItem(storageKey) || "null"))); } catch { setState(emptyBatchCalibrationState()); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(state)); }, [ready, state]);

  const setGroupDecision = (ids: string[], decision: BatchGroupDecision) => {
    const updatedAt = new Date().toISOString();
    setState((old) => ({ ...old, groups: { ...old.groups, ...Object.fromEntries(ids.map((id) => [id, { decision, updatedAt }])) } }));
    setSelectedGroups(new Set());
  };
  const setAuditDecision = (asin: string, decision: TopAuditDecision) => setState((old) => ({ ...old, audit: { ...old.audit, [asin]: { decision, updatedAt: new Date().toISOString() } } }));
  const toggleGroup = (id: string) => setSelectedGroups((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <section className="batch-calibration">
    <div className="panel batch-head">
      <div><span className="eyebrow">LINX BATCH CALIBRATION</span><h2>批量分组校准</h2><p>相似产品整组判断，再快速复核 Top 20。前两轮 28 个黄金样本继续保留，不再按 14 款重复循环。</p></div>
      <div className="coverage-ring" style={{ "--coverage": `${coverage.percent * 3.6}deg` } as CSSProperties}><b>{coverage.percent}%</b><span>产品覆盖率</span></div>
    </div>

    <div className="batch-kpis">
      <div><b>{groups.length}</b><span>相似产品组</span></div><div><b>{coverage.coveredProducts}/{coverage.totalProducts}</b><span>已覆盖产品</span></div><div><b>{audited}/{topProducts.length}</b><span>Top 20 已复核</span></div><div><b>{unresolved}</b><span>剩余不确定项</span></div>
    </div>

    <section className="panel batch-section">
      <div className="section-title"><div><span className="eyebrow">STEP 1 · PRODUCT FAMILIES</span><h2>整组判断</h2><p>如果组内不能使用同一个结论，选择“组内差异大”，LINX 后续只拆这一组。</p></div><div className="actions"><button onClick={() => setSelectedGroups(new Set(groups.filter((group) => !state.groups[group.id]).map((group) => group.id)))}>全选未判断组</button><button onClick={() => saveJson(state)}>导出反馈</button><button onClick={() => { if (confirm("确定清空批量校准和 Top 20 复核吗？前两轮黄金样本不会删除。")) setState(emptyBatchCalibrationState()); }}>清空本页</button></div></div>
      {selectedGroups.size > 0 && <div className="batch-bulk"><b>已选 {selectedGroups.size} 组</b>{groupChoices.map(([value, label]) => <button key={value} onClick={() => setGroupDecision([...selectedGroups], value)}>{label}</button>)}</div>}
      <div className="group-grid">{groups.map((group) => {
        const selected = selectedGroups.has(group.id);
        const feedback = state.groups[group.id]?.decision;
        return <article className={`group-card ${selected ? "selected" : ""}`} key={group.id}>
          <header><label><input type="checkbox" checked={selected} onChange={() => toggleGroup(group.id)} /> 多选</label><span>{group.products.length} 个产品</span></header>
          <div className="group-title"><div><h3>{group.name}</h3><p>{group.description}</p></div>{feedback && <strong className={`group-decision decision-${feedback}`}>{groupChoices.find(([value]) => value === feedback)?.[1]}</strong>}</div>
          <div className="representatives">{group.representatives.map((product) => <a href={product.sourceUrl} target="_blank" rel="noreferrer" key={product.asin} title={product.title}><span>{product.imageUrl ? <img src={product.imageUrl} alt={product.title} /> : "暂无图片"}</span><b>{product.titleZh}</b><small>{product.asin} · {product.grade}</small></a>)}</div>
          <div className="group-actions">{groupChoices.map(([value, label]) => <button className={feedback === value ? "active" : ""} key={value} onClick={() => setGroupDecision([group.id], value)}>{label}</button>)}</div>
        </article>;
      })}</div>
    </section>

    <section className="panel batch-section">
      <div className="section-title"><div><span className="eyebrow">STEP 2 · TOP 20 AUDIT</span><h2>Top 20 快速复核</h2><p>只检查最终榜单位置，不需要重新判断产品全部条件。</p></div><button onClick={() => { const updatedAt = new Date().toISOString(); setState((old) => ({ ...old, audit: { ...old.audit, ...Object.fromEntries(topProducts.filter((product) => !old.audit[product.asin]).map((product) => [product.asin, { decision: "correct" as const, updatedAt }])) } })); }}>其余位置都正确</button></div>
      <div className="audit-list">{topProducts.map((product, index) => {
        const decision = state.audit[product.asin]?.decision;
        return <article className="audit-row" key={product.asin}>
          <b className="audit-rank">#{index + 1}</b><div className="audit-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} /> : "—"}</div><div className="audit-product"><a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.titleZh}</a><span>{product.asin} · {product.category} · {product.grade} · 月销 {product.monthlySales}</span></div>
          <div className="audit-actions">{auditChoices.map(([value, label]) => <button className={decision === value ? "active" : ""} key={value} onClick={() => setAuditDecision(product.asin, value)}>{label}</button>)}</div>
        </article>;
      })}</div>
    </section>

    <div className="panel batch-finish"><b>{coverage.percent === 100 && audited === topProducts.length ? "批量校准已完成" : "完成标准"}</b><span>产品覆盖率 100% 且 Top 20 全部复核后告诉我；“组内差异大”的产品会自动进入少量边界复核。</span></div>
  </section>;
}
