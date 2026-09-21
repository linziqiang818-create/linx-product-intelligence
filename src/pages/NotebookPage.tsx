import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { fmtDate, useApp, useMoveListener, useToast } from "../store";
import { emptyFilters, GROUP_LABELS, MOVE_ACTION_LABELS, type Facets, type Filters, type MoveRecord, type Product } from "../types";
import type { RuleStat } from "../api";
import FilterBar from "../components/FilterBar";
import ProductCard, { Thumb } from "../components/ProductCard";

const PAGE_SIZE = 60;

type Tab = "review" | "rules" | "history";

function readPending(): Partial<Filters> | null {
  try {
    const raw = localStorage.getItem("linx-notebook-pending");
    if (!raw) return null;
    localStorage.removeItem("linx-notebook-pending");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function NotebookPage() {
  const { counts, actions } = useApp();
  const [tab, setTab] = useState<Tab>("review");

  return (
    <section className="space notebook">
      <div className="space-head">
        <div>
          <span className="kicker">Mistake Notebook</span>
          <h1>错题本</h1>
          <p>
            你每次手动移动产品都是我要记住的错题。这里集中了「被硬性条件筛除的产品」供你复查纠错、各条规则的误判统计，
            以及全部手动调整历史。位置都对上了，这里就安静了。
          </p>
        </div>
      </div>

      <div className="segmented settings-tabs">
        <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>
          硬筛复查 <b>{counts?.removed.toLocaleString("zh-CN") ?? "…"}</b>
        </button>
        <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}>
          规则错题统计
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          手动调整历史 <b>{counts?.events.toLocaleString("zh-CN") ?? "…"}</b>
        </button>
      </div>

      {tab === "review" && <ReviewTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "history" && <HistoryTab onUndo={(m) => actions.undoMoves([m])} />}
    </section>
  );
}

// ---------- 硬筛复查清单 ----------
function ReviewTab() {
  const { cache, cacheVersion, counts, openDetail } = useApp();
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters("removed"), ...(readPending() ?? {}) }));
  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.facets("removed").then(setFacets).catch(() => setFacets(null));
  }, [counts?.removed]);

  // 从别的页面点「去看看」跳过来时，接收连坐筛选条件
  useEffect(() => {
    const onPending = () => {
      const pending = readPending();
      if (pending) setFilters((old) => ({ ...old, ...pending }));
    };
    window.addEventListener("linx-notebook-pending", onPending);
    return () => window.removeEventListener("linx-notebook-pending", onPending);
  }, []);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      setError("");
      try {
        const result = await api.list("removed", filters, nextPage, PAGE_SIZE);
        if (id !== requestId.current) return;
        setTotal(result.total);
        setPage(result.page);
        setRows((old) => (replace ? result.rows : [...old, ...result.rows.filter((r) => !old.some((o) => o.asin === r.asin))]));
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    load(1, true);
  }, [load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && rows.length < total) load(page + 1, false);
    }, { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, rows.length, total, page, load]);

  const merged = useMemo(() => rows.map((r) => cache.get(r.asin) ?? r), [rows, cache, cacheVersion]);

  return (
    <>
      <div className="segmented">
        <button className={filters.removeGroup.length === 0 && !filters.ruleId ? "active" : ""} onClick={() => setFilters({ ...filters, removeGroup: [], ruleId: "" })}>
          全部原因
        </button>
        {(facets?.removeGroups ?? []).map((g) => (
          <button
            key={g.value}
            className={`${filters.removeGroup.includes(g.value) ? "active" : ""} chip-${g.value}`}
            onClick={() => setFilters({ ...filters, removeGroup: filters.removeGroup.includes(g.value) ? [] : [g.value], ruleId: "" })}
          >
            {GROUP_LABELS[g.value] ?? g.value} <b>{g.n}</b>
          </button>
        ))}
        {filters.ruleId && (
          <button className="active chip-manual" onClick={() => setFilters({ ...filters, ruleId: "" })} title="连坐筛选：同一条规则在同类目下的被筛产品">
            规则 {filters.ruleId} ×
          </button>
        )}
      </div>

      <FilterBar space="removed" filters={filters} setFilters={setFilters} facets={facets} total={total} countLabel="款待复查" />

      {error && (
        <div className="empty">
          <b>加载失败</b>
          <span>{error}</span>
          <button className="btn" onClick={() => load(1, true)}>重试</button>
        </div>
      )}

      <div className="grid">
        {merged.map((p) => (
          <ProductCard key={p.asin} product={p} selected={false} onSelect={() => {}} onOpen={() => openDetail(p.asin)} />
        ))}
      </div>

      {!loading && !error && merged.length === 0 && (
        <div className="empty">
          <b>没有待复查的产品</b>
          <span>这里只会出现被硬性条件筛掉的产品。试试放宽筛选条件。</span>
        </div>
      )}

      <div ref={sentinel} className="sentinel">
        {loading && <span className="spinner" aria-label="加载中" />}
        {!loading && rows.length > 0 && rows.length >= total && <span className="end-note">已显示全部 {total.toLocaleString("zh-CN")} 款</span>}
      </div>
    </>
  );
}

// ---------- 规则错题统计 ----------
function RulesTab() {
  const [data, setData] = useState<{ stats: RuleStat[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .rules()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  const stats: RuleStat[] = data?.stats ?? [];
  return (
    <div className="panel">
      <h4>哪条规则被你捞回得最多，哪条就可能太严</h4>
      {error && <p className="reason-pending">{error}</p>}
      {!error && stats.length === 0 && <p className="muted">还没有规则筛除记录。</p>}
      {stats.length > 0 && (
        <table className="stats-table">
          <thead>
            <tr>
              <th>规则 / 判定原因</th>
              <th>筛除</th>
              <th>被捞回</th>
              <th>捞回率</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const ratio = s.removed > 0 ? s.rescued / s.removed : 0;
              const hot = s.removed >= 3 && ratio > 0.2;
              return (
                <tr key={s.ruleId} className={hot ? "hot" : ""}>
                  <td title={s.ruleId}>{s.reason || s.ruleId}</td>
                  <td>{s.removed}</td>
                  <td>{s.rescued}</td>
                  <td>{Math.round(ratio * 100)}%{hot ? "（可能太严）" : ""}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => (window.location.hash = "/settings")}>
                      调整规则
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted">在设置页把误判多的规则放宽（或直接关掉），新产品就不会再犯同样的错。</p>
    </div>
  );
}

// ---------- 手动调整历史 ----------
function HistoryTab({ onUndo }: { onUndo: (m: { asin: string; eventId: number }) => void }) {
  const { notify } = useToast();
  const [rows, setRows] = useState<MoveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMoves = useCallback(() => {
    api
      .moves(200)
      .then((r) => setRows(r.rows))
      .catch((e) => notify((e as Error).message, "error"))
      .finally(() => setLoading(false));
  }, [notify]);

  useMoveListener(loadMoves);
  useEffect(() => loadMoves(), [loadMoves]);

  const undo = (m: MoveRecord) => {
    onUndo({ asin: m.asin, eventId: m.eventId });
    // undoMoves 会广播移动事件，上面的监听会自动刷新列表
  };

  if (loading) {
    return (
      <div className="sentinel">
        <span className="spinner" aria-label="加载中" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="empty">
        <b>还没有手动调整记录</b>
        <span>你每次移动产品（拉上 / 降下 / 移回）都会记在这里，供你回看与撤销。</span>
      </div>
    );
  }
  return (
    <div className="move-list">
      {rows.map((m) => (
        <div key={m.eventId} className="move-row">
          <Thumb product={{ imageUrl: m.imageUrl ?? "", titleZh: m.titleZh ?? "", title: m.title ?? "" }} size="small" />
          <div className="move-info">
            <b>{m.titleZh || m.title || m.asin}</b>
            <small>
              <code>{m.asin}</code>
              {m.category ? ` · ${m.category.split(/[/:>›»|]/).pop()}` : ""}
            </small>
          </div>
          <span className="move-action">{MOVE_ACTION_LABELS[m.action] ?? m.action}</span>
          <span className="move-reason">{m.reason || "—"}</span>
          <span className="move-time">{fmtDate(m.createdAt)}</span>
          {m.canUndo ? (
            <button className="btn btn-sm" onClick={() => undo(m)}>
              撤销
            </button>
          ) : (
            <span className="muted move-noundo">已被更新的调整覆盖</span>
          )}
        </div>
      ))}
    </div>
  );
}
