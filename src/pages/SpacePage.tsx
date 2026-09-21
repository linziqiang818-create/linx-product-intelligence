import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useApp, useMoveListener, useToast, type MoveEvent } from "../store";
import { emptyFilters, inSpace, type Facets, type Filters, type Product, type SpaceKey } from "../types";
import FilterBar from "../components/FilterBar";
import ProductCard from "../components/ProductCard";
import ImportDialog from "../components/ImportDialog";
import { DownloadIcon, UploadIcon } from "../components/icons";

const PAGE_SIZE = 60;
const LEAVE_MS = 320;

function loadFilters(space: SpaceKey): Filters {
  try {
    const raw = localStorage.getItem(`linx-filters-v2:${space}`);
    if (raw) return { ...emptyFilters(space), ...JSON.parse(raw) };
  } catch {
    // 忽略损坏的本地状态
  }
  return emptyFilters(space);
}

const TITLES: Record<SpaceKey, { title: string; kicker: string; subtitle: string }> = {
  1: { title: "产品库", kicker: "Space 01", subtitle: "所有导入过的产品，按 ASIN 去重。被硬性条件筛掉的带原因标——看走眼了直接 👍 拉上去，我会记住这道错题。" },
  2: { title: "适配池", kicker: "Space 02", subtitle: "过了硬性条件的全部产品都在这层（默认层），按推荐分排序。收藏和 👍 会把同款气质的升入第二大脑；不想要的直接移出，只影响那一款。" },
  3: { title: "第二大脑", kicker: "Space 03", subtitle: "各类目优中选优（约两成）+ 模型按你的正向偏好挑中的同款气质 + 你手动升入的。收藏和 👍 越多，挑得越准；你移出的只影响那一款。" },
  favorites: { title: "收藏夹", kicker: "Favorites", subtitle: "你收藏的产品。收藏本身就是在训练第二大脑。" },
};

export default function SpacePage({ space }: { space: SpaceKey }) {
  const { counts, profile, cache, cacheVersion, actions, setCompare, openDetail } = useApp();
  const { notify } = useToast();
  const [filters, setFilters] = useState<Filters>(() => loadFilters(space));
  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const requestId = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<Product[]>([]);
  rowsRef.current = rows;

  useEffect(() => {
    localStorage.setItem(`linx-filters-v2:${space}`, JSON.stringify(filters));
  }, [filters, space]);

  useEffect(() => {
    api.facets(space).then(setFacets).catch(() => setFacets(null));
  }, [space, counts?.space1, counts?.space2, counts?.space3]);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      setError("");
      try {
        const result = await api.list(space, filters, nextPage, PAGE_SIZE);
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
    [space, filters],
  );

  useEffect(() => {
    setSelected(new Set());
    load(1, true);
  }, [load]);

  // 滚到底部自动加载下一页
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && rows.length < total) load(page + 1, false);
    }, { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, rows.length, total, page, load]);

  // 产品移动后：不再属于这一层的卡片滑出列表；撤销后回来的卡片放回列表顶部
  useMoveListener(
    useCallback(
      (e: MoveEvent) => {
        const gone = e.products.filter((p) => !inSpace(p, space) && rowsRef.current.some((r) => r.asin === p.asin)).map((p) => p.asin);
        if (gone.length) {
          setLeaving((old) => new Set([...old, ...gone]));
          window.setTimeout(() => {
            setRows((old) => old.filter((r) => !gone.includes(r.asin)));
            setTotal((t) => Math.max(0, t - gone.length));
            setLeaving((old) => {
              const next = new Set(old);
              for (const a of gone) next.delete(a);
              return next;
            });
            setSelected((old) => {
              const next = new Set(old);
              for (const a of gone) next.delete(a);
              return next;
            });
          }, LEAVE_MS);
        }
        if (e.type === "undo") {
          const back = e.products.filter((p) => inSpace(p, space) && !rowsRef.current.some((r) => r.asin === p.asin));
          if (back.length) {
            setRows((old) => [...back, ...old]);
            setTotal((t) => t + back.length);
          }
        }
      },
      [space],
    ),
  );

  const merged = useMemo(() => rows.map((r) => cache.get(r.asin) ?? r), [rows, cache, cacheVersion]);

  const toggleSelected = (asin: string) =>
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  const selectAllVisible = () => setSelected(new Set(merged.map((r) => r.asin)));
  const clearSelection = () => setSelected(new Set());
  const bulk = (to: "brain" | "pool" | "library") => actions.move([...selected], to).then(clearSelection);

  const { title, kicker, subtitle } = TITLES[space];

  return (
    <section className="space">
      <div className="space-head">
        <div>
          <span className="kicker">{kicker}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="space-actions">
          {space === "1" && (
            <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
              <UploadIcon size={14} /> 导入卖家精灵表格
            </button>
          )}
          <a className="btn" href={api.exportUrl(space, filters, "xlsx")} download>
            <DownloadIcon size={14} /> 导出当前结果
          </a>
        </div>
      </div>

      {space === "2" && counts && (
        <div className="segmented">
          <button className={filters.tierPin === "" ? "active" : ""} onClick={() => setFilters({ ...filters, tierPin: "" })}>
            全部 <b>{counts.space2.toLocaleString("zh-CN")}</b>
          </button>
          <button className={filters.tierPin === "pinned" ? "active" : ""} onClick={() => setFilters({ ...filters, tierPin: filters.tierPin === "pinned" ? "" : "pinned" })}>
            我手动降的 <b>{counts.poolPinned.toLocaleString("zh-CN")}</b>
          </button>
        </div>
      )}

      {space === "3" && (
        <div className="brain-strip">
          <div className="brain-meter" title="反馈越多，偏好在排序中的权重越高">
            <span>偏好强度</span>
            <i>
              <b style={{ width: `${profile?.strength ?? 0}%` }} />
            </i>
            <em>{profile?.strength ?? 0}%</em>
          </div>
          <span className="brain-note">
            基于 {profile?.eventCount ?? 0} 个正向锚点学习
            {profile?.top?.length ? `，当前最看重：${profile.top.slice(0, 3).map((c) => c.value).join("、")}` : ""}
            ；各类目优中选优约两成进第二大脑，移出不牵连同类
          </span>
        </div>
      )}

      <FilterBar space={space} filters={filters} setFilters={setFilters} facets={facets} total={total} />

      {selected.size > 0 && (
        <div className="bulk-bar">
          <b>已选 {selected.size}</b>
          <button className="btn btn-sm" onClick={selectAllVisible}>全选已加载的 {merged.length}</button>
          <button className="btn btn-sm" onClick={clearSelection}>取消选择</button>
          <span className="bulk-sep" />
          <button className="btn btn-sm" onClick={() => actions.setFavorites([...selected], true).then(clearSelection)}>♥ 批量收藏</button>
          {space === "1" && (
            <>
              <button className="btn btn-sm" onClick={() => bulk("pool")}>移到适配池</button>
              <button className="btn btn-sm" onClick={() => bulk("brain")}>移到第二大脑</button>
            </>
          )}
          {space === "2" && (
            <>
              <button className="btn btn-sm" onClick={() => bulk("brain")}>升入第二大脑</button>
              <button className="btn btn-sm" onClick={() => bulk("library")}>移回产品库</button>
            </>
          )}
          {space === "3" && (
            <>
              <button className="btn btn-sm" onClick={() => bulk("pool")}>降到适配池</button>
              <button className="btn btn-sm" onClick={() => bulk("library")}>移回产品库</button>
            </>
          )}
          <button className="btn btn-sm" disabled={selected.size < 2} onClick={() => setCompare([...selected].slice(0, 4))}>
            并排对比{selected.size > 4 ? "（前 4）" : ""}
          </button>
          <a className="btn btn-sm" href={api.exportUrl(space, filters, "xlsx", [...selected])} download>导出已选</a>
        </div>
      )}

      {error && (
        <div className="empty">
          <b>加载失败</b>
          <span>{error}</span>
          <button className="btn" onClick={() => load(1, true)}>重试</button>
        </div>
      )}

      <div className="grid">
        {merged.map((p) => (
          <div key={p.asin} className={`card-slot ${leaving.has(p.asin) ? "leaving" : ""}`}>
            <ProductCard product={p} selected={selected.has(p.asin)} onSelect={() => toggleSelected(p.asin)} onOpen={() => openDetail(p.asin)} />
          </div>
        ))}
      </div>

      {!loading && !error && merged.length === 0 && (
        <div className="empty">
          <b>{space === "1" && !counts?.space1 ? "还没有产品" : space === "2" && !filters.q ? "适配池清空了" : "没有符合条件的产品"}</b>
          <span>
            {space === "1" && !counts?.space1
              ? "点右上角「导入卖家精灵表格」开始。"
              : space === "2" && !filters.q
                ? "没有待复核的产品。下次导入新表格，模型会先按你的偏好分层，拿不准的会出现在这里。"
                : "试试放宽筛选条件。"}
          </span>
          {space === "1" && !counts?.space1 && <button className="btn btn-primary" onClick={() => setImportOpen(true)}>导入表格</button>}
        </div>
      )}

      <div ref={sentinel} className="sentinel">
        {loading && <span className="spinner" aria-label="加载中" />}
        {!loading && rows.length > 0 && rows.length >= total && <span className="end-note">已显示全部 {total.toLocaleString("zh-CN")} 款</span>}
      </div>

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onDone={(message) => {
            setImportOpen(false);
            notify(message, "success");
            load(1, true);
          }}
        />
      )}
    </section>
  );
}
