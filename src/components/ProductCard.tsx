import { memo, useState } from "react";
import { HeartIcon } from "../App";
import { amazonUrl, compact, money, percent, useApp, useCategoryZh } from "../store";
import { EXCLUDE_REASONS, GROUP_LABELS, MATERIAL_LABELS, TIER_LABELS, tierOf, type Product } from "../types";
import { ThumbDownIcon, ThumbUpIcon } from "./icons";
import { Popover } from "./FilterBar";

export function Thumb({ product, size = "card" }: { product: Pick<Product, "imageUrl" | "titleZh" | "title">; size?: "card" | "large" | "small" }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`thumb thumb-${size}`}>
      {product.imageUrl && !failed ? (
        <img src={product.imageUrl} alt={product.titleZh || product.title} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-empty">{failed ? "主图加载失败" : "暂无主图"}</span>
      )}
    </div>
  );
}

// 层级徽章：产品现在住在哪一层。没有灰显——不在这一层的产品根本不会出现在这个列表里
export function TierBadge({ product }: { product: Product }) {
  const tier = tierOf(product);
  if (tier === "floor") {
    return <span className={`chip chip-status chip-${product.removeGroup}`}>{GROUP_LABELS[product.removeGroup] ?? "已筛除"}</span>;
  }
  return (
    <>
      <span
        className={`chip chip-status chip-tier-${tier}`}
        title={tier === "brain" ? "在第二大脑：模型按你的正向偏好挑中的" : "在适配池：过了硬性条件的候选层"}
      >
        {TIER_LABELS[tier]}
        {tier === "pool" && product.tier === "pool" ? "·手动降" : ""}
      </span>
      {product.override?.action === "rescue" && <span className="chip chip-status chip-rescued">已捞回</span>}
      {product.interest === "interested" && <span className="chip chip-status chip-ok">感兴趣</span>}
    </>
  );
}

export function TagChips({ product, limit = 4 }: { product: Product; limit?: number }) {
  const chips: { label: string; cls: string }[] = [];
  if (product.materialGroup && product.materialGroup !== "unknown") chips.push({ label: MATERIAL_LABELS[product.materialGroup] ?? product.materialGroup, cls: "chip-material" });
  for (const tag of product.tags) {
    if (tag === "可改款") chips.push({ label: product.convertible || "可改款", cls: "chip-convertible" });
    else if (tag === "高运费" || tag === "超规无法直发") chips.push({ label: tag, cls: "chip-warn" });
    else if (tag === "数据待补") chips.push({ label: tag, cls: "chip-pending" });
    else if (tag === "手动捞回" || tag === "手动清除") continue;
    else chips.push({ label: tag, cls: "chip-plain" });
  }
  return (
    <div className="chips">
      {chips.slice(0, limit).map((c) => (
        <span key={c.label} className={`chip ${c.cls}`}>{c.label}</span>
      ))}
      {chips.length > limit && <span className="chip chip-plain">+{chips.length - limit}</span>}
    </div>
  );
}

// 快捷动作跟着产品所在层走：👍 升一级 / 👎 降一级（第二大脑的 👍 是「感兴趣」强化信号）
export function TierActions({ product, size = 14 }: { product: Product; size?: number }) {
  const { actions } = useApp();
  const tier = tierOf(product);
  if (tier === "floor") {
    return (
      <button className="btn btn-icon" title="拉入适配池（这个判定错了）" onClick={() => actions.move([product.asin], "pool", "", product)}>
        <ThumbUpIcon size={size} />
      </button>
    );
  }
  if (tier === "pool") {
    return (
      <>
        <button className="btn btn-icon" title="升入第二大脑" onClick={() => actions.move([product.asin], "brain", "", product)}>
          <ThumbUpIcon size={size} />
        </button>
        <button className="btn btn-icon" title="移回产品库" onClick={() => actions.move([product.asin], "library", "", product)}>
          <ThumbDownIcon size={size} />
        </button>
      </>
    );
  }
  return (
    <>
      <button className={`btn btn-icon ${product.interest === "interested" ? "active" : ""}`} title="感兴趣，多推这类" onClick={() => actions.toggleInterested(product)}>
        <ThumbUpIcon size={size} />
      </button>
      <button className="btn btn-icon" title="降到适配池" onClick={() => actions.move([product.asin], "pool", "", product)}>
        <ThumbDownIcon size={size} />
      </button>
    </>
  );
}

// 移动菜单：所有跨层移动的明确入口（带原因）
export function MoveMenu({ product, compactLabel = false }: { product: Product; compactLabel?: boolean }) {
  const { actions } = useApp();
  const tier = tierOf(product);
  const hasPin = Boolean(product.override) || product.tier !== "";
  return (
    <Popover label={compactLabel ? "移动" : "移动 / 纠错"}>
      <div className="menu">
        {tier === "floor" && (
          <>
            <button className="menu-item" onClick={() => actions.move([product.asin], "pool", "", product)}>
              <b>拉入适配池</b>
              <small>{product.convertible ? `按「${product.convertible}」思路改款开发` : "硬性条件判错了，它可以做"}</small>
            </button>
            <button className="menu-item" onClick={() => actions.move([product.asin], "brain", "", product)}>
              <b>直通第二大脑</b>
              <small>不但能做，还正合我的口味</small>
            </button>
          </>
        )}
        {tier === "pool" && (
          <>
            <button className="menu-item" onClick={() => actions.move([product.asin], "brain", "", product)}>
              <b>升入第二大脑</b>
              <small>我喜欢这类，直接进偏好层</small>
            </button>
            <div className="menu-group">
              <span className="menu-label">移回产品库（选原因）</span>
              {EXCLUDE_REASONS.map((r) => (
                <button key={r} className="menu-item menu-item-sm" onClick={() => actions.move([product.asin], "library", r, product)}>
                  {r}
                </button>
              ))}
            </div>
          </>
        )}
        {tier === "brain" && (
          <>
            <button className="menu-item" onClick={() => actions.toggleInterested(product)}>
              <b>{product.interest === "interested" ? "取消「感兴趣」" : "感兴趣，多推这类"}</b>
              <small>它就在第二大脑，这只是强化信号</small>
            </button>
            <button className="menu-item" onClick={() => actions.move([product.asin], "pool", "", product)}>
              <b>降到适配池</b>
              <small>没那么喜欢，回到待复核区</small>
            </button>
            <div className="menu-group">
              <span className="menu-label">移回产品库（选原因）</span>
              {EXCLUDE_REASONS.map((r) => (
                <button key={r} className="menu-item menu-item-sm" onClick={() => actions.move([product.asin], "library", r, product)}>
                  {r}
                </button>
              ))}
            </div>
          </>
        )}
        {hasPin && (
          <button className="menu-item" onClick={() => actions.move([product.asin], "auto", "", product)}>
            <b>恢复自动判定</b>
            <small>回到规则 + 模型的判定：{product.autoPlacement === "removed" ? product.autoReason || "已筛除" : "第二大脑"}</small>
          </button>
        )}
        <a className="menu-item menu-item-sm" href={amazonUrl(product)} target="_blank" rel="noreferrer">
          在 Amazon 打开 ↗
        </a>
      </div>
    </Popover>
  );
}

function ProductCard({ product, selected, onSelect, onOpen }: { product: Product; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const { actions } = useApp();
  const zh = useCategoryZh();
  const tier = tierOf(product);
  // 硬筛原因 / 模型降级原因，纠错时要看
  const reason = tier === "floor" ? product.removeReason : tier === "pool" && product.tier === "" ? product.reasons.find((r) => r.includes("排除")) ?? "" : "";
  const leaf = zh.leaf(product.category);
  return (
    <article className={`card ${selected ? "selected" : ""}`}>
      <div className="card-media" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
        <Thumb product={product} />
        <label className="card-select" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label="选择产品" />
        </label>
        <button
          className={`heart ${product.favorite ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleFavorite(product);
          }}
          aria-label={product.favorite ? "取消收藏" : "收藏"}
        >
          <HeartIcon filled={product.favorite} />
        </button>
        <div className="card-media-foot">
          <TierBadge product={product} />
        </div>
      </div>
      <div className="card-body">
        <span className="eyebrow" title={product.category}>{leaf}{product.brand ? ` · ${product.brand}` : ""}</span>
        <h3 onClick={onOpen} title={product.title}>{product.titleZh || product.title}</h3>
        {product.titleZh && <p className="title-en">{product.title}</p>}
        <div className="stats">
          <span><b>{money(product.price)}</b><small>售价</small></span>
          <span title={product.monthlySalesRange ? `月销区间 ${product.monthlySalesRange}` : "月销量"}><b>{compact(product.monthlySales)}</b><small>月销</small></span>
          <span className={product.salesGrowth > 0 ? "up" : product.salesGrowth < 0 ? "down" : ""}><b>{percent(product.salesGrowth)}</b><small>增长</small></span>
          <span title="按售价、佣金与运费模型估算"><b>{product.marginEst > 0 ? `${Math.round(product.marginEst)}%` : "—"}</b><small>利润</small></span>
        </div>
        <TagChips product={product} />
        {reason && <p className={`reason ${tier === "floor" ? "reason-removed" : "reason-pool"}`}>{reason}</p>}
        <div className="card-foot">
          <span className="asin" title={product.asin}>{product.asin}</span>
          <div className="card-foot-actions">
            <TierActions product={product} />
            <MoveMenu product={product} compactLabel />
            <button className="btn btn-sm" onClick={onOpen}>详情</button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default memo(ProductCard);
