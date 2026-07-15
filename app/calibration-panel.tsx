"use client";
/* eslint-disable @next/next/no-img-element -- calibration uses imported marketplace image hosts */

import { useEffect, useMemo, useState } from "react";
import {
  CalibrationCandidate,
  CalibrationFeedback,
  CalibrationState,
  CalibrationVerdict,
  buildCalibrationPairs,
  calibrationReasons,
  emptyCalibrationState,
  normalizeCalibrationState,
  summarizeCalibration,
} from "./calibration";

export type CalibrationDisplayProduct = CalibrationCandidate & {
  titleZh: string;
  imageUrl?: string;
  sourceUrl: string;
  price: number;
  monthlySales: number;
  launchDays: number;
  reviews: number;
  growth: string;
  reasons: string[];
};

const storageKey = "linx-calibration-v1";

function download(name: string, content: string) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function ProductSummary({ product }: { product: CalibrationDisplayProduct }) {
  return <div className="calibration-product">
    <div className="calibration-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} /> : <span>暂无主图</span>}</div>
    <div className="calibration-copy">
      <div className="calibration-meta"><span>{product.category}</span><b className={`grade grade-${product.grade}`}>{product.grade}</b></div>
      <h3><a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.title} ↗</a></h3>
      <strong className="calibration-title-zh">{product.titleZh}</strong>
      <p className="asin">{product.asin}</p>
      <div className="calibration-stats"><span><b>${product.price}</b>售价</span><span><b>{product.monthlySales}</b>月销</span><span><b>{product.launchDays}天</b>上架</span><span><b>{product.reviews}</b>评论</span><span><b>{product.growth}</b>增长</span></div>
      <div className="calibration-why"><b>LINX 当前理由</b><p>{product.reasons.slice(0, 4).join(" · ") || "当前没有充分理由"}</p></div>
    </div>
  </div>;
}

export default function CalibrationPanel({ products }: { products: CalibrationDisplayProduct[] }) {
  const [state, setState] = useState<CalibrationState>(emptyCalibrationState);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [pairIndex, setPairIndex] = useState(0);
  const pairs = useMemo(() => buildCalibrationPairs(products), [products]);
  const current = products[Math.min(index, Math.max(0, products.length - 1))];
  const currentFeedback = current ? state.feedback[current.asin] : undefined;
  const summary = useMemo(() => summarizeCalibration(state.feedback), [state.feedback]);
  const answered = products.filter((product) => state.feedback[product.asin]).length;
  const finished = products.length > 0 && answered === products.length;

  useEffect(() => {
    const id = window.setTimeout(() => {
      try { setState(normalizeCalibrationState(JSON.parse(localStorage.getItem(storageKey) || "null"))); } catch { setState(emptyCalibrationState()); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(state)); }, [ready, state]);

  const update = (patch: Partial<CalibrationFeedback>) => {
    if (!current) return;
    const next: CalibrationFeedback = {
      asin: current.asin,
      verdict: currentFeedback?.verdict ?? "uncertain",
      reasons: currentFeedback?.reasons ?? [],
      scope: currentFeedback?.scope ?? "uncertain",
      note: currentFeedback?.note ?? "",
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    setState((old) => ({ ...old, feedback: { ...old.feedback, [current.asin]: next } }));
  };
  const choose = (verdict: CalibrationVerdict) => {
    update({ verdict, reasons: verdict === "develop" ? [] : currentFeedback?.reasons ?? [], scope: verdict === "develop" ? "product" : currentFeedback?.scope ?? "uncertain" });
    if (verdict === "develop" && index < products.length - 1) window.setTimeout(() => setIndex((value) => value + 1), 180);
  };
  const toggleReason = (reason: string) => update({ reasons: currentFeedback?.reasons.includes(reason) ? currentFeedback.reasons.filter((item) => item !== reason) : [...(currentFeedback?.reasons ?? []), reason] });
  const pair = pairs[pairIndex];
  const left = products.find((product) => product.asin === pair?.left);
  const right = products.find((product) => product.asin === pair?.right);
  const choosePair = (choice: "left" | "right" | "neither") => {
    if (!pair) return;
    setState((old) => ({ ...old, pairFeedback: { ...old.pairFeedback, [pair.id]: { pairId: pair.id, choice, updatedAt: new Date().toISOString() } } }));
    if (pairIndex < pairs.length - 1) setPairIndex((value) => value + 1);
  };

  if (!current) return <section className="panel"><div className="empty"><b>暂无可校准产品</b></div></section>;
  return <section className="calibration-shell">
    <div className="calibration-head panel">
      <div><span className="eyebrow">LINX CALIBRATION</span><h2>校准模式</h2><p>用一轮高价值判断，让 LINX 学会你的开发边界。第一版只收集可靠标签，不会自动改动 A/B/C/D。</p></div>
      <div className="calibration-progress"><b>{answered}/{products.length}</b><span>已判断</span><i><em style={{ width: `${products.length ? answered / products.length * 100 : 0}%` }} /></i></div>
    </div>

    <div className="panel calibration-workbench">
      <div className="calibration-step"><span>产品判断 {index + 1}/{products.length}</span><small>反馈当前保存在本浏览器</small></div>
      <ProductSummary product={current} />
      <div className="verdict-row">
        <button className={currentFeedback?.verdict === "develop" ? "active develop" : ""} onClick={() => choose("develop")}>✓ 可以开发</button>
        <button className={currentFeedback?.verdict === "reject" ? "active reject" : ""} onClick={() => choose("reject")}>× 不适合</button>
        <button className={currentFeedback?.verdict === "uncertain" ? "active uncertain" : ""} onClick={() => choose("uncertain")}>? 不确定</button>
      </div>
      {currentFeedback && currentFeedback.verdict !== "develop" && <div className="calibration-detail">
        <label>主要原因（可多选）</label>
        <div className="reason-chips">{calibrationReasons.map((reason) => <button key={reason} className={currentFeedback.reasons.includes(reason) ? "active" : ""} onClick={() => toggleReason(reason)}>{reason}</button>)}</div>
        <label>这个判断适用于多大范围？</label>
        <div className="scope-row"><button className={currentFeedback.scope === "category" ? "active" : ""} onClick={() => update({ scope: "category" })}>所有同类都不做</button><button className={currentFeedback.scope === "product" ? "active" : ""} onClick={() => update({ scope: "product" })}>只是不做这个产品</button><button className={currentFeedback.scope === "uncertain" ? "active" : ""} onClick={() => update({ scope: "uncertain" })}>暂不确定</button></div>
        <label>补充说明（可选）<textarea value={currentFeedback.note} onChange={(event) => update({ note: event.target.value })} placeholder="例如：去掉床体，只做书桌和收纳可以考虑" /></label>
      </div>}
      <div className="calibration-nav"><button disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>← 上一个</button><button onClick={() => setIndex((value) => Math.min(products.length - 1, value + 1))}>{currentFeedback ? "保存并下一个" : "跳过"} →</button></div>
    </div>

    {(finished || answered >= 4) && pair && left && right && <div className="panel pair-panel">
      <div className="section-title"><div><span className="eyebrow">PAIRWISE CHOICE</span><h2>成对选择 {pairIndex + 1}/{pairs.length}</h2><p>哪一个更接近你愿意开发的方向？</p></div></div>
      <div className="pair-grid"><ProductSummary product={left} /><ProductSummary product={right} /></div>
      <div className="pair-actions"><button onClick={() => choosePair("left")}>更愿意开发左边</button><button onClick={() => choosePair("neither")}>两个都不要</button><button onClick={() => choosePair("right")}>更愿意开发右边</button></div>
    </div>}

    {answered > 0 && <div className="panel calibration-summary">
      <div className="section-title"><div><span className="eyebrow">CALIBRATION SUMMARY</span><h2>本轮校准摘要</h2></div><div className="actions"><button onClick={() => download("LINX校准反馈.json", JSON.stringify(state, null, 2))}>导出校准反馈</button><button onClick={() => { if (confirm("确定清空本轮校准反馈吗？")) setState(emptyCalibrationState()); }}>重新开始</button></div></div>
      <div className="summary-grid"><span><b>{summary.develop}</b>可以开发</span><span><b>{summary.reject}</b>不适合</span><span><b>{summary.uncertain}</b>不确定</span><span><b>{summary.hardRules.length}</b>候选硬规则</span></div>
      {summary.topReasons.length > 0 && <p><b>主要原因：</b>{summary.topReasons.map(([reason, count]) => `${reason} ${count}次`).join(" · ")}</p>}
      {summary.hardRules.length > 0 && <p><b>候选硬规则：</b>{summary.hardRules.map((item) => `${products.find((product) => product.asin === item.asin)?.category ?? item.asin}（${item.reasons.join("、") || "待补原因"}）`).join("；")}</p>}
      <p className="calibration-note">完成首轮后导出反馈，下一步将把已确认判断转为黄金样本和稳定规则；不会仅凭一次点击自动泛化。</p>
    </div>}
  </section>;
}
