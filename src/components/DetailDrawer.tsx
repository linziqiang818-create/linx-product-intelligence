import { useEffect, useState } from "react";
import { api } from "../api";
import { HeartIcon } from "../App";
import { amazonUrl, compact, days, fmtDate, kg, money, percent, useApp, useCategoryZh, useToast } from "../store";
import { GROUP_LABELS, MATERIAL_LABELS, type Product } from "../types";
import { CloseIcon, ExternalIcon } from "./icons";
import { MoveMenu, TagChips, Thumb, TierActions, TierBadge } from "./ProductCard";
import { tierOf } from "../types";

const EDIT_FIELDS: { key: keyof Product; label: string; type?: "number" | "textarea" }[] = [
  { key: "titleZh", label: "中文标题" },
  { key: "category", label: "类目" },
  { key: "material", label: "材质 / 详细参数", type: "textarea" },
  { key: "price", label: "价格 (USD)", type: "number" },
  { key: "monthlySales", label: "月销量", type: "number" },
  { key: "salesGrowth", label: "增长率 (%)", type: "number" },
  { key: "packageGrossKg", label: "包装毛重 (kg)", type: "number" },
  { key: "packageDimensionsCm", label: "包装尺寸" },
  { key: "estimatedMargin", label: "已报价利润率 (%)", type: "number" },
  { key: "imageUrl", label: "主图链接" },
  { key: "sourceUrl", label: "商品链接" },
  { key: "note", label: "备注", type: "textarea" },
];

function Field({ label, value }: { label: string; value: string | number | undefined }) {
  const text = value === undefined || value === null || value === "" || value === 0 ? "—" : String(value);
  return (
    <div className="field">
      <span>{label}</span>
      <b title={text}>{text}</b>
    </div>
  );
}

export default function DetailDrawer() {
  const { detailAsin, openDetail, cache, cacheVersion, actions, patch, setCounts } = useApp();
  const { notify } = useToast();
  const zh = useCategoryZh();
  const [product, setProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Product>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!detailAsin) {
      setProduct(null);
      setEditing(false);
      return;
    }
    const cached = cache.get(detailAsin);
    if (cached) setProduct(cached);
    api.product(detailAsin).then((p) => {
      setProduct(p);
      patch([p]);
    }).catch((e) => notify(e.message, "error"));
  }, [detailAsin, cache, patch, notify]);

  useEffect(() => {
    if (detailAsin) {
      const latest = cache.get(detailAsin);
      if (latest) setProduct(latest);
    }
  }, [cacheVersion, detailAsin, cache]);

  useEffect(() => {
    if (!detailAsin) return;
    // 有弹出菜单时 Esc 只关菜单，不关抽屉
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".popover-panel")) openDetail(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("drawer-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("drawer-open");
    };
  }, [detailAsin, openDetail]);

  if (!detailAsin || !product) return null;
  const p = product;
  const a = p.assessment;

  const startEdit = () => {
    const d: Partial<Product> = {};
    for (const f of EDIT_FIELDS) (d as Record<string, unknown>)[f.key] = p[f.key];
    setDraft(d);
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProduct(p.asin, draft);
      patch([updated]);
      setProduct(updated);
      setEditing(false);
      notify("已保存并重新判定", "success");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`确定从产品库删除 ${p.asin}？此操作不可撤销。`)) return;
    const result = await api.deleteProducts([p.asin]);
    setCounts(result.counts);
    notify("已删除", "success");
    openDetail(null);
  };

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && openDetail(null)}>
      <aside className="drawer" aria-label="产品详情">
        <header className="drawer-head">
          <div>
            <span className="eyebrow" title={p.category}>{zh.path(p.category) || "未分类"}</span>
            <h2>{p.titleZh || p.title}</h2>
            {p.titleZh && <p className="title-en">{p.title}</p>}
            <div className="drawer-meta">
              <code>{p.asin}</code>
              {p.brand && <span>{p.brand}</span>}
              <a href={amazonUrl(p)} target="_blank" rel="noreferrer"><ExternalIcon size={12} /> 在 Amazon 打开</a>
            </div>
          </div>
          <button className="btn btn-icon" onClick={() => openDetail(null)} aria-label="关闭"><CloseIcon size={14} /></button>
        </header>

        <div className="drawer-body">
          <div className="drawer-hero">
            <a href={amazonUrl(p)} target="_blank" rel="noreferrer"><Thumb product={p} size="large" /></a>
            <div className="drawer-side">
              <div className="drawer-actions">
                <button className={`btn ${p.favorite ? "btn-primary" : ""}`} onClick={() => actions.toggleFavorite(p)}>
                  <HeartIcon filled={p.favorite} /> {p.favorite ? "已收藏" : "收藏"}
                </button>
                <TierActions product={p} size={13} />
                <MoveMenu product={p} />
              </div>
              <section className="panel">
                <h4>所在层级</h4>
                <div className="placement-line">
                  <TierBadge product={p} />
                  <b>
                    {tierOf(p) === "floor"
                      ? "在产品库底层：被硬性条件筛除"
                      : tierOf(p) === "pool"
                        ? p.tier === "pool"
                          ? "在适配池：你手动降下来的"
                          : "在适配池：模型预测你不会喜欢，等你复核"
                        : p.tier === "brain"
                          ? "在第二大脑：你手动升上来的"
                          : "在第二大脑：按偏好排序"}
                  </b>
                </div>
                {p.placement === "removed" && <p className="reason-removed">{p.removeReason}</p>}
                {p.override && <p className="muted">硬性条件覆盖：{p.override.action === "rescue" ? "手动捞回" : `手动移回产品库（${p.override.reason || "未填原因"}）`}；规则自动判定为 {p.autoPlacement === "removed" ? `筛除 · ${p.autoReason}` : "通过"}</p>}
                {p.convertible && <p className="convertible-note">可改款方向：<b>{p.convertible}</b>{p.notes[0] ? ` — ${p.notes[0]}` : ""}</p>}
                <TagChips product={p} limit={8} />
              </section>
            </div>
          </div>

          <section className="panel">
            <h4>第二大脑评分</h4>
            <div className="score-row">
              <div><b>{Math.round(p.finalScore)}</b><span>推荐分</span></div>
              <div><b>{Math.round(p.baseScore)}</b><span>基础分</span></div>
              <div><b className={p.prefScore > 0 ? "up" : p.prefScore < 0 ? "down" : ""}>{p.prefScore > 0 ? "+" : ""}{Math.round(p.prefScore)}</b><span>偏好分</span></div>
              <div><b>{a.companyFit}</b><span>公司适配</span></div>
              <div><b>{a.demand}</b><span>需求强度</span></div>
            </div>
            {p.reasons.length > 0 && (
              <ul className="reason-list">
                {p.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            {a.priorReasons?.length > 0 && <p className="muted">历史校准口味：{a.priorReasons.join("；")}</p>}
          </section>

          <section className="panel">
            <h4>市场数据</h4>
            <div className="fields">
              <Field label="价格" value={money(p.price)} />
              <Field label="月销量" value={p.monthlySalesRange ? `${compact(p.monthlySales)}（${p.monthlySalesRange}）` : compact(p.monthlySales)} />
              <Field label="增长率" value={percent(p.salesGrowth)} />
              <Field label="评分" value={p.rating ? `★ ${p.rating}` : "—"} />
              <Field label="评论数" value={compact(p.reviews)} />
              <Field label="BSR" value={p.bsr ? `#${compact(p.bsr)}` : "—"} />
              <Field label="上架" value={p.launchDays ? `${days(p.launchDays)}${p.dateFirstAvailable ? ` · ${p.dateFirstAvailable}` : ""}` : p.dateFirstAvailable || "—"} />
              <Field label="预估利润率" value={p.marginEst > 0 ? `${Math.round(p.marginEst)}%（可信度${a.marginConfidence}）` : "—"} />
            </div>
            {a.hiddenSignals?.length > 0 && <p className="muted">机会信号：{a.hiddenSignals.join("、")}</p>}
          </section>

          <section className="panel">
            <h4>包装与物流</h4>
            <div className="fields">
              <Field label="包装毛重" value={kg(p.packageGrossKg)} />
              <Field label="包装尺寸" value={p.packageDimensionsCm} />
              <Field label="商品尺寸" value={p.dimensions} />
              <Field label="退货风险" value={p.returnRisk} />
            </div>
            {a.freightTriggers?.length > 0 && <p className="muted">运费节点：{a.freightTriggers.join("、")}</p>}
            {a.dataMissing?.length > 0 && <p className="reason-pending">数据待补：{a.dataMissing.join("、")}</p>}
          </section>

          <section className="panel">
            <h4>材质与描述</h4>
            <div className="fields fields-wide">
              <Field label="类目" value={p.category} />
              <Field label="材质分组" value={MATERIAL_LABELS[p.materialGroup] ?? p.materialGroup} />
              <Field label="材质 / 参数" value={p.material} />
              <Field label="变体" value={p.variants} />
              <Field label="卖点" value={p.sellingPoints} />
              <Field label="备注" value={p.note} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h4>编辑字段</h4>
              {!editing ? <button className="btn btn-sm" onClick={startEdit}>编辑</button> : (
                <div className="row-actions">
                  <button className="btn btn-sm" onClick={() => setEditing(false)}>取消</button>
                  <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存并重新判定"}</button>
                </div>
              )}
            </div>
            {editing && (
              <div className="edit-grid">
                {EDIT_FIELDS.map((f) => (
                  <label key={f.key} className={f.type === "textarea" ? "wide" : ""}>
                    <span>{f.label}</span>
                    {f.type === "textarea" ? (
                      <textarea value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} rows={3} />
                    ) : (
                      <input type={f.type === "number" ? "number" : "text"} value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} />
                    )}
                  </label>
                ))}
              </div>
            )}
            <p className="muted source-line">
              来源：{p.sourceDataProvider || "手动"}{p.sourceWorkbook ? ` · ${p.sourceWorkbook} 第 ${p.sourceRow} 行` : ""} · 导入 {fmtDate(p.importedAt)} · 更新 {fmtDate(p.updatedAt)}
              <button className="btn btn-sm btn-danger" onClick={remove}>删除此产品</button>
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

export { GROUP_LABELS };
