"use client";

import { useMemo } from "react";
import type { DiversityProduct } from "./opportunity-diversity";
import type { LearningState } from "./learning-state";
import { unreportedLearningEvents, weeklyLearningSummary } from "./learning-review";
import { buildPreferenceRules } from "./preference-learning";

export default function LearningReviewPanel({
  products,
  learning,
  onGenerate,
  onRuleStatus,
}: {
  products: DiversityProduct[];
  learning: LearningState;
  onGenerate: () => void;
  onRuleStatus: (family: string, status: "active" | "paused") => void;
}) {
  const pending = useMemo(() => unreportedLearningEvents(learning), [learning]);
  const weekly = useMemo(() => weeklyLearningSummary(learning), [learning]);
  const rules = useMemo(() => buildPreferenceRules(products, learning), [products, learning]);
  const active = rules.filter((rule) => rule.status === "active").length;
  const paused = rules.filter((rule) => rule.status === "paused").length;
  const latest = learning.reflectionReports[0];

  return <section className="learning-review">
    <div className="panel learning-review-head">
      <div><span className="eyebrow">LEARNING REVIEW</span><h2>学习复盘与规则管理</h2><p>把你的每次操作变成可核对的证据。软偏好只调整产品排序，不会自动改动 ABCD；D 类永不向同类产品传播。</p></div>
      <button className="primary" disabled={!pending.length} onClick={onGenerate}>生成本次复盘（{pending.length} 条）</button>
    </div>
    <div className="learning-kpis">
      <div><b>{weekly.eventCount}</b><span>近 7 天反馈</span><small>{weekly.productCount} 款 · {weekly.sessionCount} 次校准</small></div>
      <div><b>{active}</b><span>生效软偏好</span><small>{paused} 条已暂停</small></div>
      <div><b>{learning.reflectionReports.length}</b><span>累计复盘</span><small>近 7 天 {weekly.reportCount} 份</small></div>
      <div><b>{latest?.contradictions.length ?? 0}</b><span>最近矛盾</span><small>需要继续观察</small></div>
    </div>
    {latest && <section className="panel reflection-card">
      <div className="section-title"><div><span className="eyebrow">LATEST SESSION</span><h2>最近一次复盘</h2><p>{new Date(latest.createdAt).toLocaleString("zh-CN")} · {latest.eventIds.length} 条操作证据</p></div><span className="tag">A {latest.gradeCounts.A} · B {latest.gradeCounts.B} · C {latest.gradeCounts.C} · D {latest.gradeCounts.D}</span></div>
      <div className="reflection-families">{latest.familySignals.slice(0, 12).map((signal) => <div key={signal.family}><b>{signal.family}</b><span>{signal.conclusion}</span><small>{signal.asins.length} 款 · {signal.eventCount} 次操作</small></div>)}</div>
      {latest.contradictions.length > 0 && <div className="learning-conflicts"><b>需要复核</b>{latest.contradictions.map((item) => <span key={item}>{item}</span>)}</div>}
    </section>}
    <section className="panel">
      <div className="section-title"><div><span className="eyebrow">SOFT PREFERENCE RULES</span><h2>我目前学到的软偏好</h2><p>至少 5 个不同 ASIN、跨 2 次校准且一致率达到 75% 才会生效。未达门槛的证据继续积累。</p></div></div>
      <div className="rule-table">
        <div className="rule-row rule-head"><span>产品家族</span><span>倾向</span><span>证据</span><span>一致率</span><span>影响范围</span><span>状态</span></div>
        {rules.map((rule) => <div className="rule-row" key={rule.family}>
          <span><b>{rule.family}</b><small>{rule.evidenceAsins.slice(0, 4).join("、")}</small></span>
          <span><b className={`grade grade-${rule.grade}`}>{rule.grade}</b></span>
          <span>{rule.evidenceCount}/5 款<small>{rule.sessionCount}/2 次校准</small></span>
          <span>{Math.round(rule.consensus * 100)}%</span>
          <span>{rule.affectedCount} 款排序</span>
          <span>{rule.status === "collecting" ? <em>积累中</em> : <button onClick={() => onRuleStatus(rule.family, rule.status === "paused" ? "active" : "paused")}>{rule.status === "paused" ? "恢复" : "暂停"}</button>}</span>
        </div>)}
        {!rules.length && <div className="empty"><b>还没有足够的偏好证据</b><span>去“偏好校准”完成产品判断，系统会在这里解释学到了什么。</span></div>}
      </div>
    </section>
  </section>;
}
