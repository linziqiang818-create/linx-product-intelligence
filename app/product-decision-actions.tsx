"use client";

import type { Grade } from "./recommendation-grade";

export default function ProductDecisionActions({ grade, onGrade, onRecycle, compact = false, showRecycle = true }: {
  grade: Grade;
  onGrade: (grade: Grade) => void;
  onRecycle: () => void;
  compact?: boolean;
  showRecycle?: boolean;
}) {
  return <div className={`decision-actions ${compact ? "compact" : ""}`} aria-label="人工分类与回收操作">
    {(["A", "B", "C", "D"] as Grade[]).map((value) => <button
      type="button"
      key={value}
      className={`decision-grade grade-${value} ${grade === value ? "active" : ""}`}
      title={value === "A" ? "重点考虑开发" : value === "B" ? "一般产品" : value === "C" ? "不感兴趣" : "移入淘汰库"}
      onClick={(event) => { event.stopPropagation(); onGrade(value); }}
    >{value}</button>)}
    {showRecycle && <button type="button" className="decision-recycle" title="没有参考意义，放入30天回收站" onClick={(event) => { event.stopPropagation(); onRecycle(); }}>回收</button>}
  </div>;
}
