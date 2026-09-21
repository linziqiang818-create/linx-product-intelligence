import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, onConnectionChange } from "./api";
import { EXCLUDE_REASONS, emptyFilters, categorySegments, tierOf, type Counts, type MoveTarget, type Product, type Profile, type Tier } from "./types";

// ---------- 通知（右上角悬浮，几秒后消失；带撤销 / 补记原因） ----------
type ToastAction = { label: string; run: () => void };
type ToastReasons = { label: string; options: string[]; onPick: (reason: string) => void };
type Toast = { id: number; message: string; kind: "info" | "success" | "error"; action?: ToastAction; reasons?: ToastReasons; expanded?: boolean };
type ToastApi = { notify: (message: string, kind?: Toast["kind"], action?: ToastAction, reasons?: ToastReasons) => void };
const ToastContext = createContext<ToastApi>({ notify: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());
  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((old) => old.filter((t) => t.id !== id));
  }, []);
  const schedule = useCallback(
    (id: number, ms: number) => {
      window.clearTimeout(timers.current.get(id));
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );
  const notify = useCallback(
    (message: string, kind: Toast["kind"] = "info", action?: ToastAction, reasons?: ToastReasons) => {
      const id = ++seq.current;
      setToasts((old) => [...old.slice(-3), { id, message, kind, action, reasons }]);
      schedule(id, action || reasons ? 7000 : 3600);
    },
    [schedule],
  );
  const expand = (id: number) => {
    setToasts((old) => old.map((t) => (t.id === id ? { ...t, expanded: true } : t)));
    schedule(id, 15000);
  };
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind} ${t.expanded ? "expanded" : ""}`}
            onMouseEnter={() => window.clearTimeout(timers.current.get(t.id))}
            onMouseLeave={() => schedule(t.id, 3000)}
          >
            <div className="toast-main">
              <span>{t.message}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              {t.reasons && !t.expanded && <button onClick={() => expand(t.id)}>{t.reasons.label}</button>}
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="关闭">×</button>
            </div>
            {t.reasons && t.expanded && (
              <div className="toast-reasons">
                {t.reasons.options.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      t.reasons?.onPick(r);
                      dismiss(t.id);
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- 移动事件广播：错题本等页面据此刷新 / 给"同类连坐"提示 ----------
export type MoveEvent = { type: "move"; to: MoveTarget; source?: Product; products: Product[] } | { type: "undo"; products: Product[] };
const moveListeners = new Set<(e: MoveEvent) => void>();
export function useMoveListener(listener: (e: MoveEvent) => void) {
  useEffect(() => {
    moveListeners.add(listener);
    return () => {
      moveListeners.delete(listener);
    };
  }, [listener]);
}

function moveLabel(to: MoveTarget, from: Tier | null, n: number) {
  const suffix = n > 1 ? `（${n} 款）` : "";
  if (to === "brain") return (from === "floor" ? "已直通第二大脑" : from === "pool" ? "已升入第二大脑" : "已移到第二大脑") + suffix;
  if (to === "pool") return (from === "brain" ? "已降到适配池" : from === "floor" ? "已拉入适配池" : "已移到适配池") + suffix;
  if (to === "library") return `已移回产品库${suffix}`;
  return `已恢复自动判定${suffix}`;
}

// ---------- 全局状态：计数、产品缓存（跨页面同步最新状态）、详情抽屉、对比 ----------
type AppState = {
  counts: Counts | null;
  profile: Profile | null;
  categoryZh: Record<string, string>;
  offline: boolean;
  setCounts: (c: Counts) => void;
  refreshStatus: () => Promise<void>;
  cache: Map<string, Product>;
  patch: (products: Product[]) => void;
  cacheVersion: number;
  detailAsin: string | null;
  openDetail: (asin: string | null) => void;
  compare: string[];
  setCompare: (asins: string[]) => void;
  actions: {
    toggleFavorite: (product: Product) => Promise<void>;
    setFavorites: (asins: string[], on: boolean) => Promise<void>;
    /** 把产品移动到某一层；source 为单件移动时的移动前快照，用于 toast 文案与"同类连坐"提示 */
    move: (asins: string[], to: MoveTarget, reason?: string, source?: Product) => Promise<void>;
    undoMoves: (moves: { asin: string; eventId: number }[]) => Promise<void>;
    /** 「感兴趣」开关：只是偏好信号，不改变所在层 */
    toggleInterested: (product: Product) => Promise<void>;
  };
};

const AppContext = createContext<AppState | null>(null);
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categoryZh, setCategoryZh] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const cacheRef = useRef(new Map<string, Product>());
  const [cacheVersion, setCacheVersion] = useState(0);
  const [detailAsin, setDetailAsin] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const { notify } = useToast();

  const refreshStatus = useCallback(async () => {
    const status = await api.status();
    setCounts(status.counts);
    setProfile(status.profile);
    if (status.categoryZh) setCategoryZh(status.categoryZh);
  }, []);

  useEffect(() => onConnectionChange((online) => setOffline(!online)), []);

  // 断连后每 4 秒探测一次；服务回来就自动恢复数据，不用手动刷新页面
  useEffect(() => {
    if (!offline) return;
    const timer = window.setInterval(async () => {
      try {
        const status = await api.status();
        setOffline(false);
        setCounts(status.counts);
        setProfile(status.profile);
        if (status.categoryZh) setCategoryZh(status.categoryZh);
        notify("已重新连接数据服务", "success");
      } catch {
        // 还没恢复，继续等
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [offline, notify]);

  useEffect(() => {
    // 首次连不上由全屏提示负责说明，这里不再弹错误
    refreshStatus().catch(() => {});
  }, [refreshStatus]);

  const patch = useCallback((products: Product[]) => {
    for (const p of products) cacheRef.current.set(p.asin, p);
    setCacheVersion((v) => v + 1);
  }, []);

  const actions = useMemo(
    () => ({
      async toggleFavorite(product: Product) {
        const on = !product.favorite;
        const result = await api.favorite([product.asin], on);
        patch(result.products);
        setCounts(result.counts);
        notify(on ? "已加入收藏，第二大脑已记录你的偏好" : "已取消收藏", "success");
      },
      async setFavorites(asins: string[], on: boolean) {
        const result = await api.favorite(asins, on);
        patch(result.products);
        setCounts(result.counts);
        notify(`已${on ? "收藏" : "取消收藏"} ${asins.length} 款`, "success");
      },
      async move(asins: string[], to: MoveTarget, reason = "", source?: Product) {
        const result = await api.move(asins, to, reason);
        patch(result.products);
        setCounts(result.counts);
        // 重算可能连锁改变其他产品的成员（同属性被一起拉低/抬高），把它们的新状态也拉回来
        const cascade = result.changed.filter((a) => !asins.includes(a));
        let extra: Product[] = [];
        if (cascade.length) {
          try {
            const fresh = await api.productsByAsins(cascade);
            patch(fresh.rows);
            extra = fresh.rows;
          } catch {
            // 拉取失败不打断主流程，下次进页面会拿到新状态
          }
        }
        const from = source ? tierOf(source) : null;
        const undoable = result.moves.some((m) => m.eventId);
        const quickDemote =
          asins.length === 1 && !reason && result.moves[0]?.eventId && (to === "library" || (to === "pool" && from === "brain"));
        notify(
          moveLabel(to, from, asins.length),
          "success",
          undoable ? { label: "撤销", run: () => actions.undoMoves(result.moves.filter((m) => m.eventId)) } : undefined,
          quickDemote
            ? {
                label: "补记原因",
                options: EXCLUDE_REASONS,
                onPick: (r) =>
                  api
                    .setMoveReason(asins[0], result.moves[0].eventId, r)
                    .then((res) => {
                      patch([res.product]);
                      notify(`已记录原因：${r}，第二大脑会记住`, "info");
                    })
                    .catch((e) => notify((e as Error).message, "error")),
              }
            : undefined,
        );
        api.status().then((s) => setProfile(s.profile)).catch(() => {});
        for (const listener of moveListeners) listener({ type: "move", to, source, products: [...result.products, ...extra] });
        // 同类连坐：从产品库捞回一件被硬筛的，看看同一条规则在同类目下还筛掉了多少，方便一起纠错
        if (source && source.placement === "removed" && source.removeRuleId && to !== "library" && asins.length === 1) {
          const { removeRuleId, category } = source;
          api
            .list("removed", { ...emptyFilters("removed"), ruleId: removeRuleId, category: [category] }, 1, 1)
            .then((r) => {
              if (!r.total) return;
              notify(`同类目下还有 ${r.total} 款被同一条规则筛掉，要不要一起看？`, "info", {
                label: "去看看",
                run: () => {
                  localStorage.setItem("linx-notebook-pending", JSON.stringify({ ruleId: removeRuleId, category: [category] }));
                  window.location.hash = "/notebook";
                  window.dispatchEvent(new Event("linx-notebook-pending"));
                },
              });
            })
            .catch(() => {});
        }
      },
      async undoMoves(moves: { asin: string; eventId: number }[]) {
        if (!moves.length) return;
        try {
          const result = await api.undoMoves(moves);
          patch(result.products);
          setCounts(result.counts);
          const cascade = (result.changed ?? []).filter((a) => !moves.some((m) => m.asin === a));
          let extra: Product[] = [];
          if (cascade.length) {
            try {
              const fresh = await api.productsByAsins(cascade);
              patch(fresh.rows);
              extra = fresh.rows;
            } catch {
              // 同上：失败不打断，下次进页面自动纠正
            }
          }
          notify(`已撤销（${result.undone} 款），位置和偏好信号都已还原`, "info");
          api.status().then((s) => setProfile(s.profile)).catch(() => {});
          for (const listener of moveListeners) listener({ type: "undo", products: [...result.products, ...extra] });
        } catch (e) {
          notify((e as Error).message, "error");
        }
      },
      async toggleInterested(product: Product) {
        const on = product.interest !== "interested";
        const result = await api.feedback(product.asin, on ? "interested" : "clear");
        patch([result.product]);
        setCounts(result.counts);
        notify(on ? "已标记感兴趣，第二大脑会多推这类" : "已取消「感兴趣」", "success");
        api.status().then((s) => setProfile(s.profile)).catch(() => {});
      },
    }),
    [patch, notify],
  );

  const value = useMemo<AppState>(
    () => ({ counts, profile, categoryZh, offline, setCounts, refreshStatus, cache: cacheRef.current, patch, cacheVersion, detailAsin, openDetail: setDetailAsin, compare, setCompare, actions }),
    [counts, profile, categoryZh, offline, refreshStatus, patch, cacheVersion, detailAsin, compare, actions],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// 类目中文：叶子 / 整条路径 / 单个片段。词典里没有的保留英文原文。
export function useCategoryZh() {
  const { categoryZh } = useApp();
  return useMemo(() => {
    const seg = (s: string) => categoryZh[s] ?? s;
    return {
      seg,
      leaf: (category: string) => seg(categorySegments(category).at(-1) ?? category),
      parent: (category: string) => {
        const parts = categorySegments(category);
        return parts.length > 1 ? seg(parts.at(-2) ?? "") : "";
      },
      path: (category: string) => categorySegments(category).map(seg).join(" › "),
    };
  }, [categoryZh]);
}

// ---------- 格式化 ----------
export const money = (v: number) => (v > 0 ? `$${v % 1 ? v.toFixed(2) : v.toFixed(0)}` : "—");
export const compact = (v: number) => (v > 0 ? new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(v) : "—");
export const percent = (v: number) => {
  if (!v) return "0%";
  const n = Math.abs(v) <= 2 ? v * 100 : v;
  return `${n > 0 ? "+" : ""}${n.toFixed(0)}%`;
};
export const fmtDate = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(t) : "—";
};
export const kg = (v: number) => (v > 0 ? `${Math.round(v * 10) / 10} kg` : "—");
export const days = (v: number) => (v > 0 ? (v >= 365 ? `${(v / 365).toFixed(1)} 年` : `${v} 天`) : "—");
export const amazonUrl = (p: { sourceUrl: string; asin: string }) => p.sourceUrl || `https://www.amazon.com/dp/${p.asin}`;
