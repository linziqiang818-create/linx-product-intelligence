"use client";
/* eslint-disable @next/next/no-img-element -- marketplace images use arbitrary Amazon hosts */

import { useEffect, useMemo, useState } from "react";
import {
  batchCoverage,
  buildChallengePairs,
  buildProductGroups,
  emptyBatchCalibrationState,
  normalizeBatchCalibrationState,
  selectChallengeCandidates,
  selectUnpairedChallengers,
} from "./batch-calibration";
import type { BatchCalibrationCandidate, BatchCalibrationState, BatchGroupDecision, ChallengeDecision, ResearchDecision } from "./batch-calibration";
import ProductDecisionActions from "./product-decision-actions";
import type { Grade } from "./recommendation-grade";

const storageKey = "linx-batch-calibration-v1";
const groupChoices: Array<[BatchGroupDecision, string]> = [
  ["priority", "优先研究"], ["normal", "普通备选"], ["low", "可行但低兴趣"], ["reject", "整组不做"], ["split", "组内差异大"],
];
const researchChoices: Array<[ResearchDecision, string]> = [
  ["research", "值得花 30 分钟研究"], ["hold", "先保留"], ["pass", "没有兴趣"],
];
const challengeLabels: Record<ChallengeDecision, string> = { challenger: "选择新品挑战者", anchor: "选择现有候选", both: "两个都研究", neither: "两个都不研究" };
const interestOrder = { priority: 0, normal: 1, unrated: 1, low: 2 } as const;
const gradeOrder = { A: 0, B: 1, C: 2, D: 3 } as const;

function saveJson(state: BatchCalibrationState) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" }));
  anchor.download = "LINX偏好校准反馈.json";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function ProductImage({ product }: { product: BatchCalibrationCandidate }) {
  return <span className="research-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.title} /> : "暂无图片"}</span>;
}

function ResearchCard({ product, decision, onDecision, onGrade, onRecycle, compact = false }: { product: BatchCalibrationCandidate; decision?: ResearchDecision; onDecision: (decision: ResearchDecision) => void; onGrade: (grade: Grade) => void; onRecycle: () => void; compact?: boolean }) {
  return <article className={`research-card ${compact ? "compact" : ""} ${decision ? `research-${decision}` : ""}`}>
    <a href={product.sourceUrl} target="_blank" rel="noreferrer" title={product.title}><ProductImage product={product} /></a>
    <div className="research-copy"><span>{product.category} · {product.grade}</span><a href={product.sourceUrl} target="_blank" rel="noreferrer">{product.titleZh}</a><small>{product.asin} · 月销 {product.monthlySales} · ${product.price}</small></div>
    <div className="research-actions">{researchChoices.map(([value, label]) => <button className={decision === value ? "active" : ""} key={value} onClick={() => onDecision(value)}>{compact && value === "research" ? "想研究" : compact && value === "hold" ? "保留" : compact && value === "pass" ? "没兴趣" : label}</button>)}</div>
    <ProductDecisionActions grade={product.grade} onGrade={onGrade} onRecycle={onRecycle} compact />
  </article>;
}

export default function BatchCalibrationPanel({ products, value, onChange, onSave, onGrade, onRecycle }: { products: BatchCalibrationCandidate[]; value?: BatchCalibrationState; onChange?: (state: BatchCalibrationState) => void; onSave?: () => void; onGrade: (product: BatchCalibrationCandidate, grade: Grade) => void; onRecycle: (product: BatchCalibrationCandidate) => void }) {
  const groups = useMemo(() => buildProductGroups(products), [products]);
  const candidatePool = useMemo(() => [...products]
    .filter((product) => product.grade !== "D")
    .sort((a, b) => interestOrder[a.interestTier] - interestOrder[b.interestTier] || gradeOrder[a.grade] - gradeOrder[b.grade] || b.score - a.score)
    .slice(0, 20), [products]);
  const [localState, setLocalState] = useState<BatchCalibrationState>(emptyBatchCalibrationState);
  const state = value ?? localState;
  const setState = (updater: BatchCalibrationState | ((old: BatchCalibrationState) => BatchCalibrationState)) => {
    const next = typeof updater === "function" ? updater(state) : updater;
    if (onChange) onChange(next); else setLocalState(next);
  };
  const [ready, setReady] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [challengePage, setChallengePage] = useState(0);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const coverage = useMemo(() => batchCoverage(groups, state), [groups, state]);
  const candidateAsins = useMemo(() => new Set(candidatePool.map((product) => product.asin)), [candidatePool]);
  const challengeUniverse = useMemo(() => selectChallengeCandidates(groups, state, candidateAsins), [groups, state, candidateAsins]);
  const challengePageCount = Math.max(1, Math.ceil(challengeUniverse.length / 30));
  const challengeBatch = useMemo(() => challengeUniverse.slice(challengePage * 30, challengePage * 30 + 30), [challengeUniverse, challengePage]);
  const researchedChallengers = useMemo(() => challengeUniverse.filter((product) => state.research[product.asin]?.decision === "research"), [challengeUniverse, state.research]);
  const anchors = useMemo(() => {
    if (candidatePool.length <= 3) return candidatePool;
    return [candidatePool[0], candidatePool[Math.floor(candidatePool.length / 2)], candidatePool[candidatePool.length - 1]];
  }, [candidatePool]);
  const challengePairs = useMemo(() => buildChallengePairs(selectUnpairedChallengers(researchedChallengers, state), anchors).slice(0, 6), [researchedChallengers, anchors, state]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.asin, product])), [products]);
  const challengeHistory = useMemo(() => Object.entries(state.challenges).map(([id, result]) => ({ id, result, challenger: productMap.get(result.challengerAsin), anchor: productMap.get(result.anchorAsin) })).filter((item) => item.challenger && item.anchor), [state.challenges, productMap]);
  const candidateReviewed = candidatePool.filter((product) => state.research[product.asin]).length;
  const explorationReviewed = challengeUniverse.filter((product) => state.research[product.asin]).length;
  const comparisonCount = Object.keys(state.challenges).length;

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!value) {
        try { setLocalState(normalizeBatchCalibrationState(JSON.parse(localStorage.getItem(storageKey) || "null"))); } catch { setLocalState(emptyBatchCalibrationState()); }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [value]);
  useEffect(() => { if (ready && !value) localStorage.setItem(storageKey, JSON.stringify(state)); }, [ready, state, value]);

  const setResearch = (asin: string, decision: ResearchDecision, source: "candidate" | "challenge") => setState((old) => ({ ...old, research: { ...old.research, [asin]: { decision, source, updatedAt: new Date().toISOString() } } }));
  const setGroupDecision = (ids: string[], decision: BatchGroupDecision) => {
    const updatedAt = new Date().toISOString();
    setState((old) => ({ ...old, groups: { ...old.groups, ...Object.fromEntries(ids.map((id) => [id, { decision, updatedAt }])) } }));
    setSelectedGroups(new Set());
  };
  const setChallenge = (id: string, challengerAsin: string, anchorAsin: string, decision: ChallengeDecision) => setState((old) => ({ ...old, challenges: { ...old.challenges, [id]: { decision, challengerAsin, anchorAsin, updatedAt: new Date().toISOString() } } }));
  const toggleGroup = (id: string) => setSelectedGroups((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const holdRemainingCandidates = () => { const updatedAt = new Date().toISOString(); setState((old) => ({ ...old, research: { ...old.research, ...Object.fromEntries(candidatePool.filter((product) => !old.research[product.asin]).map((product) => [product.asin, { decision: "hold" as const, source: "candidate" as const, updatedAt }])) } })); };
  const holdChallengeBatch = () => { const updatedAt = new Date().toISOString(); setState((old) => ({ ...old, research: { ...old.research, ...Object.fromEntries(challengeBatch.filter((product) => !old.research[product.asin]).map((product) => [product.asin, { decision: "hold" as const, source: "challenge" as const, updatedAt }])) } })); };

  return <section className="batch-calibration preference-lab">
    <div className="panel batch-head">
      <div><span className="eyebrow">LINX PREFERENCE LAB</span><h2>偏好校准与新品挑战</h2><p>不再判断抽象名次。先回答“是否值得花 30 分钟研究”，再用具体产品之间的选择逐渐建立你的真实排序标准。</p></div>
      <div className="calibration-status"><b>{coverage.decidedGroups}/{groups.length}</b><span>产品组已判断</span><i>{candidateReviewed}/20 快速判断已完成</i><button className="primary" onClick={onSave}>保存本次反思</button></div>
    </div>

    <div className="batch-kpis">
      <div><b>{coverage.splitProducts}</b><span>差异组产品优先探索</span></div><div><b>{candidateReviewed}/20</b><span>快速判断已完成</span></div><div><b>{explorationReviewed}/{challengeUniverse.length}</b><span>探索样品已看</span></div><div><b>{comparisonCount}</b><span>具体偏好选择</span></div>
    </div>

    <section className="panel batch-section">
      <div className="section-title"><div><span className="eyebrow">STEP 1 · QUICK REVIEW</span><h2>快速判断</h2><p>这 20 个产品都可以保留。只有真正愿意继续花时间核算和研究的，才选择“值得花 30 分钟研究”。</p></div><button onClick={holdRemainingCandidates}>其余全部先保留</button></div>
      <div className="research-list">{candidatePool.map((product) => <ResearchCard key={product.asin} product={product} decision={state.research[product.asin]?.decision} onDecision={(decision) => setResearch(product.asin, decision, "candidate")} onGrade={(grade) => onGrade(product, grade)} onRecycle={() => onRecycle(product)} />)}</div>
    </section>

    <section className="panel batch-section">
      <div className="section-title"><div><span className="eyebrow">STEP 2 · EXPLORATION</span><h2>新品挑战池</h2><p>优先展示“组内差异大”的产品，再覆盖其他方向。只标记让你明显想研究或明显没兴趣的产品；没有强烈感觉可以整批先保留。</p></div>{challengeBatch.length > 0 && <div className="actions"><button disabled={challengePage === 0} onClick={() => setChallengePage((page) => Math.max(0, page - 1))}>上一批</button><span className="batch-page">{challengePage + 1}/{challengePageCount}</span><button disabled={challengePage >= challengePageCount - 1} onClick={() => setChallengePage((page) => Math.min(challengePageCount - 1, page + 1))}>下一批</button><button onClick={holdChallengeBatch}>本批其余先保留</button></div>}</div>
      {challengeBatch.length > 0 ? <div className="exploration-grid">{challengeBatch.map((product) => <ResearchCard compact key={product.asin} product={product} decision={state.research[product.asin]?.decision} onDecision={(decision) => setResearch(product.asin, decision, "challenge")} onGrade={(grade) => onGrade(product, grade)} onRecycle={() => onRecycle(product)} />)}</div> : <div className="empty"><b>当前产品已经全部看过</b><span>下一步可导入新的市场样品，继续挑战现有候选池。</span></div>}
    </section>

    <section className="panel batch-section">
      <div className="section-title"><div><span className="eyebrow">STEP 3 · HEAD-TO-HEAD</span><h2>具体产品二选一</h2><p>只比较你标记为“想研究”的挑战产品。问题只有一个：如果这周只能研究其中一个，你会选哪个？</p></div></div>
      {challengePairs.length > 0 ? <div className="duel-list">{challengePairs.map((pair) => <article className="duel" key={pair.id}>
        <div className="duel-product"><ProductImage product={pair.challenger} /><b>{pair.challenger.titleZh}</b><small>新品挑战者 · {pair.challenger.asin}</small><ProductDecisionActions grade={pair.challenger.grade} onGrade={(grade) => onGrade(pair.challenger, grade)} onRecycle={() => onRecycle(pair.challenger)} compact /></div>
        <div className="duel-question"><span>本周只研究一个</span><button onClick={() => setChallenge(pair.id, pair.challenger.asin, pair.anchor.asin, "challenger")}>选左边</button><button onClick={() => setChallenge(pair.id, pair.challenger.asin, pair.anchor.asin, "anchor")}>选右边</button><button onClick={() => setChallenge(pair.id, pair.challenger.asin, pair.anchor.asin, "both")}>两个都研究</button><button onClick={() => setChallenge(pair.id, pair.challenger.asin, pair.anchor.asin, "neither")}>两个都不研究</button></div>
        <div className="duel-product"><ProductImage product={pair.anchor} /><b>{pair.anchor.titleZh}</b><small>现有产品 · {pair.anchor.asin}</small><ProductDecisionActions grade={pair.anchor.grade} onGrade={(grade) => onGrade(pair.anchor, grade)} onRecycle={() => onRecycle(pair.anchor)} compact /></div>
      </article>)}</div> : <div className="empty"><b>{researchedChallengers.length ? "本轮对比已完成" : "先从新品挑战池挑出想研究的产品"}</b><span>LINX 会自动安排它与现有候选产品对比。</span></div>}
      {challengeHistory.length > 0 && <div className="duel-history"><h3>已完成选择</h3>{challengeHistory.map(({ id, result, challenger, anchor }) => <div key={id}><span>{challenger!.titleZh}</span><b>{challengeLabels[result.decision]}</b><span>{anchor!.titleZh}</span></div>)}</div>}
    </section>

    <section className="panel group-review">
      <div className="section-title"><div><span className="eyebrow">PRODUCT FAMILY SETTINGS</span><h2>产品组判断已完成</h2><p>“组内差异大”已经视为有效结论，并优先进入上方挑战池，不再降低完成率。</p></div><div className="actions"><button onClick={() => setShowGroups((value) => !value)}>{showGroups ? "收起产品组" : "查看或调整产品组"}</button><button onClick={() => saveJson(state)}>导出反馈</button></div></div>
      {showGroups && <><div className="batch-bulk"><b>已选 {selectedGroups.size} 组</b>{groupChoices.map(([value, label]) => <button disabled={!selectedGroups.size} key={value} onClick={() => setGroupDecision([...selectedGroups], value)}>{label}</button>)}</div><div className="group-grid">{groups.map((group) => { const selected = selectedGroups.has(group.id); const feedback = state.groups[group.id]?.decision; return <article className={`group-card ${selected ? "selected" : ""}`} key={group.id}><header><label><input type="checkbox" checked={selected} onChange={() => toggleGroup(group.id)} /> 多选</label><span>{group.products.length} 个产品</span></header><div className="group-title"><div><h3>{group.name}</h3><p>{group.description}</p></div>{feedback && <strong className={`group-decision decision-${feedback}`}>{groupChoices.find(([value]) => value === feedback)?.[1]}</strong>}</div><div className="group-actions">{groupChoices.map(([value, label]) => <button className={feedback === value ? "active" : ""} key={value} onClick={() => setGroupDecision([group.id], value)}>{label}</button>)}</div></article>; })}</div></>}
    </section>

    <div className="panel batch-finish"><b>何时形成可靠标准？</b><span>连续两批新样品很难替换候选池，并且候选研究清单保持约 80% 稳定时，LINX 才会开始显示具体优先顺序。</span></div>
  </section>;
}
