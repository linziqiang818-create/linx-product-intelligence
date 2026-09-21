import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCategoryZh } from "../store";
import { MATERIAL_LABELS, SORT_LABELS, categoryLeaf, emptyFilters, type Facets, type Filters, type SortKey, type SpaceKey } from "../types";

// 输入框：失焦或回车时才提交，避免每个字符都触发请求
function DraftInput({ value, onCommit, placeholder, type = "text", width, className }: { value: string; onCommit: (v: string) => void; placeholder?: string; type?: string; width?: number; className?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      className={className}
      type={type}
      value={draft}
      placeholder={placeholder}
      style={width ? { width } : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

// 弹层挂到 body 上并用 fixed 定位：不会被卡片的 overflow:hidden 裁掉，靠近右边/底部时自动贴边或向上翻。
export function Popover({ label, active, children, wide }: { label: ReactNode; active?: boolean; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left = anchor.left;
    if (left + pw > vw - margin) left = Math.max(margin, vw - pw - margin);
    // 优先放在按钮下方；放不下就翻到上方；都放不下就夹在视口内
    let top = anchor.bottom + 6;
    if (top + ph > vh - margin) {
      const above = anchor.top - ph - 6;
      top = above >= margin ? above : Math.max(margin, vh - ph - margin);
    }
    top = Math.max(margin, Math.min(top, vh - ph - margin));
    setPos({ top, left, maxHeight: vh - margin * 2 });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place, children]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target) || target.closest?.(".popover-panel")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // 点了菜单里的动作项就收起；多选框保持打开
  const onPanelClick = (e: ReactMouseEvent) => {
    if ((e.target as Element).closest?.(".menu-item")) setOpen(false);
  };

  return (
    <div className={`popover ${open ? "open" : ""}`}>
      <button ref={buttonRef} className={`btn btn-filter ${active ? "active" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={`popover-panel ${wide ? "wide" : ""}`}
            style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: "hidden" }}
            onClick={onPanelClick}
            role="dialog"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

type Option = { value: string; label: string; sub?: string; n?: number };

function MultiSelect({ label, options, value, onChange, searchable }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; searchable?: boolean }) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary = value.length ? `${label} · ${value.length}` : label;
  return (
    <Popover label={summary} active={value.length > 0} wide={searchable}>
      {searchable && <input className="popover-search" placeholder={`搜索${label}`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
      <div className="option-list">
        {visible.length === 0 && <span className="muted">没有可选项</span>}
        {visible.map((o) => (
          <label key={o.value} className="option">
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
            <span className="option-label">
              {o.label}
              {o.sub && <small>{o.sub}</small>}
            </span>
            {o.n !== undefined && <em>{o.n}</em>}
          </label>
        ))}
      </div>
      {value.length > 0 && (
        <button className="btn btn-sm popover-clear" onClick={() => onChange([])}>清除{label}</button>
      )}
    </Popover>
  );
}

function Range({ label, min, max, onMin, onMax, unit }: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; unit?: string }) {
  return (
    <div className={`range ${min || max ? "active" : ""}`}>
      <span>{label}</span>
      <DraftInput type="number" value={min} onCommit={onMin} placeholder="最低" width={64} />
      <i>–</i>
      <DraftInput type="number" value={max} onCommit={onMax} placeholder="最高" width={64} />
      {unit && <small>{unit}</small>}
    </div>
  );
}

const SORT_KEYS: SortKey[] = ["finalScore", "monthlySales", "salesGrowth", "price", "marginEst", "rating", "reviews", "bsr", "packageGrossKg", "launchDays", "importedAt", "baseScore", "prefScore", "titleZh", "category"];

export default function FilterBar({ space, filters, setFilters, facets, total, countLabel = "款" }: { space: SpaceKey | "removed"; filters: Filters; setFilters: (f: Filters) => void; facets: Facets | null; total: number; countLabel?: string }) {
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  const zh = useCategoryZh();
  const categoryOptions: Option[] = (facets?.categories ?? []).map((c) => {
    const leaf = categoryLeaf(c.value);
    const leafZh = zh.leaf(c.value);
    const parentZh = zh.parent(c.value);
    return { value: c.value, label: leafZh, sub: [leafZh !== leaf ? leaf : "", parentZh].filter(Boolean).join(" · "), n: c.n };
  });
  const materialOptions: Option[] = (facets?.materialGroups ?? []).map((m) => ({ value: m.value, label: MATERIAL_LABELS[m.value] ?? m.value, n: m.n }));
  const tagOptions: Option[] = (facets?.tags ?? []).map((t) => ({ value: t.value, label: t.value, n: t.n }));

  const advancedCount = [filters.growthMin, filters.growthMax, filters.ratingMin, filters.reviewsMin, filters.reviewsMax, filters.weightMin, filters.weightMax, filters.launchMin, filters.launchMax, filters.marginMin, filters.dataStatus, ...(filters.excludeTags.length ? ["x"] : [])].filter(Boolean).length;
  const isDefault = JSON.stringify(filters) === JSON.stringify(emptyFilters(space));

  const dirButton = (dir: "asc" | "desc", onToggle: () => void) => (
    <button className="btn btn-icon" onClick={onToggle} title={dir === "desc" ? "降序（点击切换为升序）" : "升序（点击切换为降序）"}>
      {dir === "desc" ? "↓" : "↑"}
    </button>
  );

  return (
    <div className="filterbar">
      <div className="filter-row">
        <DraftInput className="search" value={filters.q} onCommit={(q) => set({ q })} placeholder="搜索标题、ASIN、品牌、类目…" />
        <MultiSelect label="类目" options={categoryOptions} value={filters.category} onChange={(category) => set({ category })} searchable />
        <MultiSelect label="材质" options={materialOptions} value={filters.materialGroup} onChange={(materialGroup) => set({ materialGroup })} />
        <MultiSelect label="标签" options={tagOptions} value={filters.tags} onChange={(tags) => set({ tags })} />
        <Range label="价格" unit="$" min={filters.priceMin} max={filters.priceMax} onMin={(priceMin) => set({ priceMin })} onMax={(priceMax) => set({ priceMax })} />
        <Range label="月销" min={filters.salesMin} max={filters.salesMax} onMin={(salesMin) => set({ salesMin })} onMax={(salesMax) => set({ salesMax })} />
        <Popover label={advancedCount ? `更多筛选 · ${advancedCount}` : "更多筛选"} active={advancedCount > 0} wide>
          <div className="advanced">
            <Range label="增长率" unit="%" min={filters.growthMin} max={filters.growthMax} onMin={(growthMin) => set({ growthMin })} onMax={(growthMax) => set({ growthMax })} />
            <Range label="评论数" min={filters.reviewsMin} max={filters.reviewsMax} onMin={(reviewsMin) => set({ reviewsMin })} onMax={(reviewsMax) => set({ reviewsMax })} />
            <Range label="包装毛重" unit="kg" min={filters.weightMin} max={filters.weightMax} onMin={(weightMin) => set({ weightMin })} onMax={(weightMax) => set({ weightMax })} />
            <Range label="上架天数" unit="天" min={filters.launchMin} max={filters.launchMax} onMin={(launchMin) => set({ launchMin })} onMax={(launchMax) => set({ launchMax })} />
            <div className="range">
              <span>最低评分</span>
              <DraftInput type="number" value={filters.ratingMin} onCommit={(ratingMin) => set({ ratingMin })} placeholder="如 4.3" width={72} />
            </div>
            <div className="range">
              <span>最低利润率</span>
              <DraftInput type="number" value={filters.marginMin} onCommit={(marginMin) => set({ marginMin })} placeholder="%" width={72} />
            </div>
            <div className="range">
              <span>数据完整度</span>
              <select value={filters.dataStatus} onChange={(e) => set({ dataStatus: e.target.value as Filters["dataStatus"] })}>
                <option value="">不限</option>
                <option value="complete">数据齐全</option>
                <option value="pending">数据待补</option>
              </select>
            </div>
            <div className="range">
              <span>排除标签</span>
              <MultiSelect label="排除" options={tagOptions} value={filters.excludeTags} onChange={(excludeTags) => set({ excludeTags })} />
            </div>
          </div>
        </Popover>
        {!isDefault && (
          <button className="btn btn-quiet" onClick={() => setFilters(emptyFilters(space))}>重置</button>
        )}
      </div>
      <div className="filter-row filter-row-sort">
        <span className="result-count">
          <b>{total.toLocaleString("zh-CN")}</b> {countLabel}
        </span>
        <span className="sort-group">
          <label>排序</label>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
          {dirButton(filters.dir, () => set({ dir: filters.dir === "desc" ? "asc" : "desc" }))}
        </span>
        <span className="sort-group">
          <label>再按</label>
          <select value={filters.sort2} onChange={(e) => set({ sort2: e.target.value as SortKey | "" })}>
            <option value="">（不设）</option>
            {SORT_KEYS.filter((k) => k !== filters.sort).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
          {filters.sort2 && dirButton(filters.dir2, () => set({ dir2: filters.dir2 === "desc" ? "asc" : "desc" }))}
        </span>
      </div>
    </div>
  );
}
