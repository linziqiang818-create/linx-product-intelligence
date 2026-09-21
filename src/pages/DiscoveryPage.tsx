import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { amazonUrl, compact, kg, money, useApp, useToast } from "../store";
import type { DiscoverState, DiscoveryConfig, Product } from "../types";
import { Thumb } from "../components/ProductCard";

// 发现箱：自动采集的候选产品。收进来 → 走规则归位进三层池；不要 → 永久静默（同 ASIN 不再进来）。
export default function DiscoveryPage() {
  const { counts, refreshStatus, patch, openDetail } = useApp();
  const { notify } = useToast();
  const [rows, setRows] = useState<Product[]>([]);
  const [config, setConfig] = useState<DiscoveryConfig | null>(null);
  const [configured, setConfigured] = useState(true);
  const [lastRun, setLastRun] = useState<DiscoverState["lastRun"]>(null);
  const [ledger, setLedger] = useState<DiscoverState["ledger"]>({ date: "", month: "", search: 0, detail: 0, monthTotal: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [draft, setDraft] = useState<DiscoveryConfig | null>(null);

  const load = useCallback(async () => {
    const state = await api.discover();
    setRows(state.rows);
    setConfig(state.config);
    setDraft(state.config);
    setConfigured(state.configured);
    setLastRun(state.lastRun);
    setLedger(state.ledger);
    setSelected(new Set());
    patch(state.rows);
    setLoading(false);
  }, [patch]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const promote = async (asins: string[]) => {
    const result = await api.promoteDiscoveries(asins);
    notify(`已收进 ${result.promoted} 款，规则已重新归位`, "success");
    await load();
    refreshStatus().catch(() => {});
  };

  const dismiss = async (asins: string[]) => {
    const result = await api.dismissDiscoveries(asins);
    notify(`已放弃 ${result.dismissed} 款，这个 ASIN 不会再被抓进来`, "info");
    await load();
    refreshStatus().catch(() => {});
  };

  const run = async () => {
    setRunning(true);
    notify("采集已开始，正在抓 Amazon（约 1-3 分钟）…", "info");
    try {
      const result = await api.runDiscovery();
      setLastRun(result.report);
      const errors = result.report?.errors ?? [];
      const refreshed = result.report?.refreshed ?? 0;
      const kept = result.report?.kept ?? 0;
      const dup = result.report?.dupImage ?? 0;
      const dupNote = dup > 0 ? `，跳过同图 ${dup} 款` : "";
      notify(
        errors.length ? `采集完成：新发现 ${kept} 款、刷新跟进 ${refreshed} 款${dupNote}，${errors.length} 条跳过` : `采集完成：新发现 ${kept} 款、刷新跟进 ${refreshed} 款${dupNote}`,
        errors.length ? "info" : "success",
      );
      await load();
      refreshStatus().catch(() => {});
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setRunning(false);
    }
  };

  const saveConfig = async () => {
    if (!draft) return;
    const result = await api.saveDiscoverConfig(draft);
    setConfig(result.config);
    setDraft(result.config);
    notify("采集配置已保存", "success");
  };

  const toggle = (asin: string) => {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  return (
    <section className="space discover">
      <div className="space-head">
        <div>
          <span className="kicker">Discovery Box</span>
          <h1>发现箱</h1>
          <p>
            每次采集先刷新你收藏和第二大脑里的产品（价格、评论、月销），再按关键词抓新品候选进这里等你过目：
            <b>收进来</b>就按硬性规则归位、进入正常选品流程；<b>不要</b>则永久静默，同款不再进来。
          </p>
        </div>
        <div className="discover-actions">
          <button className="btn" onClick={() => setShowConfig((v) => !v)}>
            采集设置
          </button>
          <button className="btn btn-primary" disabled={running} onClick={run}>
            {running ? "采集中…" : "立即采集"}
          </button>
        </div>
      </div>

      {!configured && (
        <div className="discover-warn">
          还没配置 Bright Data：在本机运行一次 <code>bdata login</code>（浏览器里点一下授权），或设置环境变量 BRIGHTDATA_API_KEY。
        </div>
      )}

      {showConfig && draft && (
        <div className="discover-config">
          <label>
            关键词（每行一个，最多 30 个）
            <textarea
              rows={6}
              value={draft.keywords.join("\n")}
              onChange={(e) => setDraft({ ...draft, keywords: e.target.value.split("\n") })}
            />
          </label>
          <div className="discover-config-row">
            <label>
              每天搜索上限
              <input type="number" min={0} max={50} value={draft.dailySearchLimit} onChange={(e) => setDraft({ ...draft, dailySearchLimit: Number(e.target.value) })} />
            </label>
            <label>
              每天详情上限
              <input type="number" min={0} max={120} value={draft.dailyDetailLimit} onChange={(e) => setDraft({ ...draft, dailyDetailLimit: Number(e.target.value) })} />
            </label>
            <label>
              其中刷新跟进产品
              <input type="number" min={0} max={draft.dailyDetailLimit} value={draft.dailyRefreshLimit} onChange={(e) => setDraft({ ...draft, dailyRefreshLimit: Number(e.target.value) })} />
            </label>
            <label>
              每个词最多细看
              <input type="number" min={1} max={48} value={draft.maxPerKeyword} onChange={(e) => setDraft({ ...draft, maxPerKeyword: Number(e.target.value) })} />
            </label>
            <label>
              每月请求总额
              <input type="number" min={0} max={5000} value={draft.monthlyRequestCap} onChange={(e) => setDraft({ ...draft, monthlyRequestCap: Number(e.target.value) })} />
            </label>
            <label className="discover-check">
              <input type="checkbox" checked={draft.autoDaily} onChange={(e) => setDraft({ ...draft, autoDaily: e.target.checked })} />
              服务运行时每天自动采一次
            </label>
          </div>
          <div className="discover-config-row">
            <button className="btn btn-primary" onClick={saveConfig}>
              保存设置
            </button>
            <span className="discover-ledger">
              今日已用：搜索 {ledger.search} / 详情 {ledger.detail} 次 · 本月累计 {ledger.monthTotal} / {config?.monthlyRequestCap ?? "—"} 次
              {lastRun ? ` · 上次采集 ${new Date(lastRun.at).toLocaleString("zh-CN")}，新发现 ${lastRun.kept} 款` : " · 从未采集"}
            </span>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="discover-batch">
          已选 {selected.size} 款
          <button className="btn btn-primary" onClick={() => promote([...selected])}>
            收进所选
          </button>
          <button className="btn" onClick={() => dismiss([...selected])}>
            不要所选
          </button>
          <button className="btn" onClick={() => setSelected(new Set())}>
            取消选择
          </button>
        </div>
      )}

      {loading ? (
        <div className="sentinel">
          <span className="spinner" aria-label="加载中" />
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <b>发现箱是空的</b>
          <span>
            点「立即采集」跑第一次，或者等服务的每日自动采集。
            {lastRun?.errors?.length ? `上次采集有 ${lastRun.errors.length} 条跳过记录，可在服务窗口日志里查看。` : ""}
          </span>
        </div>
      ) : (
        <div className="discover-grid">
          {rows.map((p) => (
            <article className="dcard" key={p.asin}>
              <label className="dcard-check">
                <input type="checkbox" checked={selected.has(p.asin)} onChange={() => toggle(p.asin)} aria-label={`选择 ${p.asin}`} />
              </label>
              <button className="dcard-thumb" onClick={() => openDetail(p.asin)} aria-label="查看详情">
                <Thumb product={p} />
              </button>
              <div className="dcard-body">
                <a className="dcard-title" href={amazonUrl(p)} target="_blank" rel="noreferrer" title={p.title}>
                  {p.title}
                </a>
                <div className="dcard-meta">
                  <b>{money(p.price)}</b>
                  <span>{p.rating > 0 ? `${p.rating}★` : ""}</span>
                  <span>{p.reviews > 0 ? `${compact(p.reviews)} 评` : ""}</span>
                  <span>{p.monthlySalesRange ? `月销~${p.monthlySalesRange}` : ""}</span>
                  <span>{p.packageGrossKg > 0 ? kg(p.packageGrossKg) : ""}</span>
                </div>
                <div className="dcard-chips">
                  {p.category && <span className="chip chip-plain">{p.category.split(":").at(-1)}</span>}
                  {p.bsr > 0 && <span className="chip chip-plain">BSR #{compact(p.bsr)}</span>}
                  {p.discoveryKeyword && <span className="chip chip-plain" title="搜索词">{p.discoveryKeyword}</span>}
                </div>
                <div className="dcard-actions">
                  <button className="btn btn-primary" onClick={() => promote([p.asin])}>
                    收进来
                  </button>
                  <button className="btn" onClick={() => dismiss([p.asin])}>
                    不要
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
