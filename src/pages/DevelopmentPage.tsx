import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useToast } from "../store";
import type { DevelopmentDecision, DevelopmentFacts, DevelopmentReason, DevelopmentReasonDefinition, DevelopmentRevision, DevelopmentSample, ReferenceScope } from "../types";

const DECISION_LABELS: Record<DevelopmentDecision, string> = { unconfirmed: "未确认", want: "想开发", maybe: "待考虑", reject: "不开发" };
const SCOPE_LABELS: Record<ReferenceScope, string> = { unspecified: "尚未确定", whole: "整款作为参考", local: "只借鉴局部", both: "整款和局部" };
const FACT_LABELS: Record<string, string> = {
  title: "英文标题", category: "类目", brand: "品牌", price: "售价 USD", monthlySales: "月销量", monthlySalesRange: "月销来源区间",
  reviews: "评论数", rating: "评分", launchDays: "上架天数", dateFirstAvailable: "上架日期", bsr: "BSR",
  material: "材质", sellingPoints: "卖点", painPoints: "用户痛点记录", packageGrossKg: "包装毛重 kg",
  packageDimensionsCm: "包装尺寸", dimensions: "商品尺寸", itemWeightLb: "商品重量 lb", imageUrl: "主图 URL",
};
const EDIT_FACTS = ["title", "category", "price", "monthlySales", "reviews", "rating", "launchDays", "material", "painPoints", "packageGrossKg", "packageDimensionsCm", "imageUrl"];
const NUMBER_FACTS = new Set(["price", "monthlySales", "reviews", "rating", "launchDays", "packageGrossKg"]);
const initialAsin = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("asin")?.toUpperCase() ?? "";

type Draft = { decision: DevelopmentDecision; reasons: DevelopmentReason[]; referenceScope: ReferenceScope; specificFeature: string; note: string };
const fromSample = (sample: DevelopmentSample, preferWant: boolean): Draft => ({
  decision: sample.decision === "unconfirmed" && preferWant ? "want" : sample.decision,
  reasons: sample.decision === "unconfirmed" && sample.suggestion && !sample.suggestion.stale ? sample.suggestion.reasons : sample.confirmedReasons,
  referenceScope: sample.referenceScope, specificFeature: sample.specificFeature, note: sample.note,
});

export default function DevelopmentPage() {
  const { notify } = useToast();
  const [inputs, setInputs] = useState("");
  const [rows, setRows] = useState<DevelopmentSample[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<DevelopmentDecision | "">("");
  const [sample, setSample] = useState<DevelopmentSample | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reasonDefs, setReasonDefs] = useState<DevelopmentReasonDefinition[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [selectedCode, setSelectedCode] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [showFacts, setShowFacts] = useState(false);
  const [factDraft, setFactDraft] = useState<Partial<DevelopmentFacts>>({});
  const [revisions, setRevisions] = useState<DevelopmentRevision[] | null>(null);
  const touchedReasons = useRef(false);
  const selectedAsin = useRef("");
  const attemptedFetch = useRef(new Set<string>());
  const attemptedSuggest = useRef(new Set<string>());

  const refreshList = useCallback(async (decision: DevelopmentDecision | "" = filter, nextPage = 1, append = false) => {
    const result = await api.developmentList(decision, nextPage);
    setRows((previous) => append ? [...previous, ...result.rows.filter((row) => !previous.some((old) => old.asin === row.asin))] : result.rows);
    setTotal(result.total);
    setPage(result.page);
  }, [filter]);

  const maybeSuggest = useCallback(async (current: DevelopmentSample, enabled = aiConfigured) => {
    if (!enabled || !current.facts.title || current.decision !== "unconfirmed" || (current.suggestion && !current.suggestion.stale) || attemptedSuggest.current.has(current.asin)) return;
    attemptedSuggest.current.add(current.asin);
    setBusy("AI 正在给出候选原因…");
    try {
      const result = await api.developmentSuggest(current.asin);
      setSample((old) => old?.asin === result.asin ? result : old);
      if (selectedAsin.current === current.asin && result.decision === "unconfirmed" && !touchedReasons.current && result.suggestion && !result.suggestion.stale) setDraft((old) => old ? { ...old, reasons: result.suggestion!.reasons } : old);
    } catch (e) { setError(`${(e as Error).message}；可直接人工标注。`); }
    finally { setBusy(""); }
  }, [aiConfigured]);

  const openSample = useCallback(async (asin: string, preferWant = false, aiEnabled = aiConfigured) => {
    selectedAsin.current = asin;
    setError("");
    setRevisions(null);
    setShowFacts(false);
    touchedReasons.current = false;
    setBusy("读取样本…");
    try {
      let current = await api.developmentSample(asin);
      setSample(current);
      setDraft(fromSample(current, preferWant));
      setFactDraft({});
      window.history.replaceState(null, "", `#/development?asin=${encodeURIComponent(asin)}`);
      if (current.factsSource === "pending" && !attemptedFetch.current.has(asin)) {
        attemptedFetch.current.add(asin);
        setBusy("正在获取 Amazon 产品事实…");
        try {
          current = await api.developmentFetch(asin);
          setSample(current);
          setDraft(fromSample(current, preferWant));
        } catch (e) { setError(`${(e as Error).message}；可手工补录事实。`); }
      }
      setBusy("");
      void maybeSuggest(current, aiEnabled);
    } catch (e) { setError((e as Error).message); setBusy(""); }
  }, [maybeSuggest]);

  useEffect(() => {
    let active = true;
    Promise.all([api.developmentList(), api.developmentReasons(), api.status()]).then(([list, reasons, status]) => {
      if (!active) return;
      setRows(list.rows); setTotal(list.total); setReasonDefs(reasons.reasons); setAiConfigured(status.aiConfigured);
      const target = initialAsin() || list.rows.find((row) => row.decision === "unconfirmed")?.asin || list.rows[0]?.asin;
      if (target) void openSample(target, false, status.aiConfigured);
    }).catch((e) => { if (active) setError((e as Error).message); });
    return () => { active = false; };
    // 首次进入页面加载一次；筛选由按钮事件触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addInputs = async () => {
    const lines = inputs.split(/[\n,;]+/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy("正在建立样本…"); setError("");
    try {
      const result = await api.developmentCreate(lines);
      const asins = [...new Set(result.rows.map((row) => row.asin).filter((asin): asin is string => Boolean(asin)))];
      const errors = result.rows.filter((row) => row.error);
      setInputs("");
      setQueue(asins);
      await refreshList("", 1);
      if (asins[0]) await openSample(asins[0], true);
      notify(`已加入 ${asins.length} 个开发样本${errors.length ? `，${errors.length} 条无效` : ""}`, "success");
      if (errors.length) setError(errors.map((row) => `${row.input}：${row.error}`).join("；"));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const selectFilter = async (next: DevelopmentDecision | "") => {
    setFilter(next);
    try { await refreshList(next); } catch (e) { setError((e as Error).message); }
  };

  const save = async (andNext: boolean) => {
    if (!sample || !draft || busy) return;
    if (draft.decision === "unconfirmed") { setError("请选择想开发、待考虑或不开发；撤回已有确认请使用下方按钮。"); return; }
    setBusy("保存判断…"); setError("");
    try {
      const result = await api.developmentConfirm(sample.asin, {
        decision: draft.decision, confirmedReasons: draft.reasons, referenceScope: draft.referenceScope,
        specificFeature: draft.specificFeature, note: draft.note, suggestionId: sample.suggestion?.stale ? null : sample.suggestion?.id ?? null,
      });
      setSample(result.sample);
      setDraft(fromSample(result.sample, false));
      setRevisions((await api.developmentRevisions(sample.asin)).rows);
      notify(result.changed ? "判断已保存，历史版本已保留" : "判断没有变化", "success");
      await refreshList();
      if (andNext) {
        const nextQueue = queue.filter((asin) => asin !== sample.asin);
        setQueue(nextQueue);
        const next = nextQueue[0] || rows.find((row) => row.asin !== sample.asin && row.decision === "unconfirmed")?.asin;
        if (next) await openSample(next, Boolean(nextQueue.length));
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); void save(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const withdraw = async () => {
    if (!sample || sample.decision === "unconfirmed" || busy) return;
    setBusy("撤回确认…"); setError("");
    try {
      const result = await api.developmentConfirm(sample.asin, { decision: "unconfirmed", confirmedReasons: [], referenceScope: "unspecified", specificFeature: "", note: "", suggestionId: null, withdraw: true });
      setSample(result.sample); setDraft(fromSample(result.sample, false));
      setRevisions((await api.developmentRevisions(sample.asin)).rows);
      notify("确认已撤回，旧判断保留在历史中", "success");
      await refreshList();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const saveFacts = async () => {
    if (!sample || busy) return;
    setBusy("保存事实…"); setError("");
    try {
      const result = await api.developmentFacts(sample.asin, factDraft);
      setSample(result); setFactDraft({}); setShowFacts(false);
      notify("事实已保存；旧 AI 建议如有将标为过期", "success");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };

  const fetchFacts = async () => {
    if (!sample || busy) return;
    setBusy("正在获取 Amazon 产品事实…"); setError("");
    try { const result = await api.developmentFetch(sample.asin); setSample(result); notify("产品事实已更新", "success"); }
    catch (e) { setError(`${(e as Error).message}；可手工补录事实。`); }
    finally { setBusy(""); }
  };

  const generate = async () => {
    if (!sample || busy) return;
    setBusy("AI 正在给出候选原因…"); setError("");
    try {
      const result = await api.developmentSuggest(sample.asin);
      setSample(result);
      if (!touchedReasons.current && sample.decision === "unconfirmed") setDraft((old) => old ? { ...old, reasons: result.suggestion?.reasons ?? old.reasons } : old);
      notify("AI 建议已生成，请核对后确认", "success");
    } catch (e) { setError(`${(e as Error).message}；可直接人工标注。`); }
    finally { setBusy(""); }
  };

  const toggleSuggested = (reason: DevelopmentReason) => {
    touchedReasons.current = true;
    setDraft((old) => {
      if (!old) return old;
      const exists = old.reasons.some((item) => item.reason_code === reason.reason_code && item.detail === reason.detail);
      return { ...old, reasons: exists ? old.reasons.filter((item) => !(item.reason_code === reason.reason_code && item.detail === reason.detail)) : [...old.reasons, reason] };
    });
  };

  const addReason = () => {
    const definition = reasonDefs.find((item) => item.code === selectedCode);
    if (!definition) return;
    touchedReasons.current = true;
    setDraft((old) => old ? { ...old, reasons: [...old.reasons, { reason_code: definition.code, category: definition.category, scope: definition.code === "SPECIFIC_FEATURE_REFERENCE" ? "local" : "whole", detail: "" }] } : old);
    setSelectedCode("");
  };

  const updateReason = (index: number, patch: Partial<DevelopmentReason>) => {
    touchedReasons.current = true;
    setDraft((old) => old ? { ...old, reasons: old.reasons.map((reason, i) => i === index ? { ...reason, ...patch } : reason) } : old);
  };

  const labelFor = (code: string) => reasonDefs.find((reason) => reason.code === code)?.label ?? code;

  return <section className="development-page">
    <header className="space-head">
      <div><span className="kicker">Development calibration</span><h1>开发样本</h1><p>记录你为何愿意投入开发资源。这里的判断不会改变产品库、适配池或第二大脑。</p></div>
    </header>
    <div className="dev-import panel">
      <label htmlFor="dev-inputs">粘贴 Amazon 链接或 ASIN，每行一个</label>
      <div><textarea id="dev-inputs" value={inputs} onChange={(e) => setInputs(e.target.value)} rows={3} placeholder="https://www.amazon.com/dp/B0..." />
        <button className="btn btn-primary" disabled={Boolean(busy) || !inputs.trim()} onClick={addInputs}>加入开发样本</button></div>
      <p className="muted">从这里批量加入时，界面会预选“想开发”；点击确认前仍是未确认样本。</p>
    </div>
    {error && <p className="dev-error" role="alert">{error}</p>}
    {busy && <p className="dev-busy" role="status"><span className="spinner" aria-hidden="true" />{busy}</p>}
    <div className="dev-layout">
      <aside className="dev-list panel" aria-label="开发样本列表">
        <div className="dev-list-head"><h2>样本队列</h2><span>{total} 条</span></div>
        <div className="dev-filters" aria-label="按决策筛选">
          {(["", "unconfirmed", "want", "maybe", "reject"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => void selectFilter(value)}>{value ? DECISION_LABELS[value] : "全部"}</button>)}
        </div>
        {rows.length === 0 && <p className="muted dev-empty">还没有符合条件的样本。</p>}
        <div className="dev-list-items">
          {rows.map((item) => <button key={item.asin} className={`dev-list-item ${sample?.asin === item.asin ? "active" : ""}`} onClick={() => void openSample(item.asin)}>
            {item.facts.imageUrl ? <img src={String(item.facts.imageUrl)} alt="" loading="lazy" /> : <span className="dev-list-noimage">无图</span>}
            <span><b>{String(item.facts.title || item.asin)}</b><small>{item.asin} · {DECISION_LABELS[item.decision]}</small></span>
          </button>)}
        </div>
        {rows.length < total && <button className="btn btn-sm dev-more" onClick={() => void refreshList(filter, page + 1, true)}>加载更多</button>}
      </aside>
      <div className="dev-work">
        {!sample || !draft ? <div className="panel dev-empty">选择一个样本开始标注。</div> : <>
          <div className="panel dev-product">
            {sample.facts.imageUrl && <img src={String(sample.facts.imageUrl)} alt={String(sample.facts.title || sample.asin)} />}
            <div><h2>{String(sample.facts.title || sample.asin)}</h2><p className="muted">{sample.asin} · {sample.linkedProduct ? "关联正式产品" : "独立样本"} · 事实来源：{sample.factsSource}</p>
              <div className="dev-fact-summary">{["price", "monthlySales", "reviews", "rating", "launchDays", "category"].map((key) => <span key={key}><small>{FACT_LABELS[key]}</small><b>{sample.facts[key] ?? "未知"}</b></span>)}</div>
              <div className="dev-actions"><a href={sample.sourceUrl} target="_blank" rel="noreferrer">在 Amazon 查看 ↗</a><button className="btn btn-sm" disabled={Boolean(busy)} onClick={fetchFacts}>刷新事实</button><button className="btn btn-sm" onClick={() => setShowFacts((value) => !value)}>{showFacts ? "收起事实" : "补充事实"}</button></div>
            </div>
          </div>
          {showFacts && <div className="panel dev-fact-editor"><h3>产品事实</h3><p className="muted">只填有证据的字段；留空表示未知。</p><div className="dev-fact-grid">
            {EDIT_FACTS.map((key) => <label key={key}><span>{FACT_LABELS[key]}</span><input type={NUMBER_FACTS.has(key) ? "number" : "text"} value={String(factDraft[key] ?? sample.facts[key] ?? "")} onChange={(e) => setFactDraft((old) => ({ ...old, [key]: e.target.value }))} /></label>)}
          </div><button className="btn btn-primary btn-sm" disabled={Boolean(busy) || !Object.keys(factDraft).length} onClick={saveFacts}>保存事实</button></div>}
          <div className="panel dev-suggestion"><div className="dev-section-head"><div><h3>AI 猜测</h3><p className="muted">只供参考，点击保存判断后才成为你的确认原因。</p></div><button className="btn btn-sm" disabled={!aiConfigured || Boolean(busy) || !sample.facts.title} onClick={generate}>{sample.suggestion ? "重新生成" : "生成建议"}</button></div>
            {!aiConfigured && <p className="muted">AI 未配置，可直接选择原因并保存。</p>}
            {sample.suggestion?.stale && <p className="dev-warning">产品事实已变化，这批建议基于旧事实。请重新生成或自行核对。</p>}
            {sample.suggestion && <div className="dev-suggested-list">{sample.suggestion.reasons.map((reason, index) => {
              const selected = draft.reasons.some((item) => item.reason_code === reason.reason_code && item.detail === reason.detail);
              return <button key={`${reason.reason_code}-${index}`} className={`dev-suggested ${selected ? "selected" : ""}`} onClick={() => toggleSuggested(reason)} aria-pressed={selected}>
                <b>{selected ? "✓ " : "+ "}{labelFor(reason.reason_code)}</b><span>{reason.detail}</span>
              </button>;
            })}</div>}
            {sample.suggestion?.unknowns.length ? <p className="muted">证据不足：{sample.suggestion.unknowns.join("；")}</p> : null}
          </div>
          <div className="panel dev-confirm"><h3>我的判断</h3>
            <div className="dev-decisions" role="group" aria-label="开发决策">{(["want", "maybe", "reject"] as const).map((value) => <button key={value} className={draft.decision === value ? "active" : ""} onClick={() => setDraft({ ...draft, decision: value })} aria-pressed={draft.decision === value}>{DECISION_LABELS[value]}</button>)}</div>
            <label className="dev-field"><span>整体参考范围</span><select value={draft.referenceScope} onChange={(e) => setDraft({ ...draft, referenceScope: e.target.value as ReferenceScope })}>{Object.entries(SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {(draft.referenceScope === "local" || draft.referenceScope === "both") && <label className="dev-field"><span>具体借鉴部位</span><input value={draft.specificFeature} onChange={(e) => setDraft({ ...draft, specificFeature: e.target.value })} placeholder="例如：门板波纹、旋转结构、抽屉布局" /></label>}
            <div className="dev-section-head"><h4>确认原因</h4><div className="dev-add-reason"><select aria-label="选择标准原因" value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)}><option value="">增加标准原因…</option>{reasonDefs.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select><button className="btn btn-sm" disabled={!selectedCode} onClick={addReason}>添加</button></div></div>
            {draft.reasons.length === 0 && <p className="muted">还没有确认原因。证据不足时可以保留为空。</p>}
            <div className="dev-confirmed-list">{draft.reasons.map((reason, index) => <div className="dev-confirmed" key={`${reason.reason_code}-${index}`}>
              <b>{labelFor(reason.reason_code)}</b><select aria-label={`${labelFor(reason.reason_code)}适用范围`} value={reason.scope} onChange={(e) => updateReason(index, { scope: e.target.value as "whole" | "local" })}><option value="whole">整款</option><option value="local">局部</option></select>
              <input aria-label={`${labelFor(reason.reason_code)}补充说明`} value={reason.detail} onChange={(e) => updateReason(index, { detail: e.target.value })} placeholder={reason.reason_code === "OTHER" ? "请填写具体原因" : "可补充具体依据"} />
              <button className="btn btn-sm" aria-label={`移除${labelFor(reason.reason_code)}`} onClick={() => { touchedReasons.current = true; setDraft({ ...draft, reasons: draft.reasons.filter((_, i) => i !== index) }); }}>移除</button>
            </div>)}</div>
            <label className="dev-field"><span>我的补充备注</span><textarea rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="可记录判断条件、后续要核实的问题" /></label>
            <div className="dev-footer"><button className="btn btn-primary" disabled={Boolean(busy) || draft.decision === "unconfirmed"} onClick={() => void save(true)}>保存并下一条 <kbd>Ctrl+Enter</kbd></button><button className="btn" disabled={Boolean(busy) || draft.decision === "unconfirmed"} onClick={() => void save(false)}>只保存</button>{sample.decision !== "unconfirmed" && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={withdraw}>撤回确认</button>}</div>
          </div>
          <details key={sample.asin} className="panel dev-history" onToggle={(e) => { if (e.currentTarget.open && !revisions) void api.developmentRevisions(sample.asin).then((result) => setRevisions(result.rows)).catch((err) => setError((err as Error).message)); }}><summary>历史人工判断</summary>
            {revisions?.length ? revisions.map((revision) => <div key={revision.id} className="dev-revision"><time>{new Date(revision.createdAt).toLocaleString("zh-CN")}</time><b>{DECISION_LABELS[revision.decision]}</b><span>{revision.confirmedReasons.map((reason) => labelFor(reason.reason_code)).join("、") || "未记录原因"}</span><small>{SCOPE_LABELS[revision.referenceScope]}{revision.specificFeature ? `：${revision.specificFeature}` : ""}{revision.note ? ` · ${revision.note}` : ""}</small><small>当时 AI 猜测：{revision.suggestionId ? revision.aiSuggestedReasons.map((reason) => labelFor(reason.reason_code)).join("、") || "未给出原因" : "无"}</small></div>) : <p className="muted">暂无历史确认。</p>}
          </details>
        </>}
      </div>
    </div>
  </section>;
}
