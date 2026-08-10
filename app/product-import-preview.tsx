/* eslint-disable @next/next/no-img-element -- preview images come from imported marketplace rows */

import type { ProductImportPreview } from "./product-import";

type PreviewProduct = {
  asin: string;
  parentAsin?: string;
  title: string;
  titleZh?: string;
  imageUrl?: string;
  category?: string;
  price?: number;
};

export default function ProductImportPreviewPanel({
  fileName,
  preview,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  preview: ProductImportPreview<PreviewProduct>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return <section className="import-preview" aria-label="Excel 导入预览">
    <div className="import-preview-head">
      <div>
        <span className="eyebrow">IMPORT PREVIEW</span>
        <h3>确认导入：{fileName}</h3>
        <p>此时还没有写入产品库。旧 ASIN 只更新 Excel 中有内容的字段，空单元格会保留旧数据。</p>
      </div>
      <div className="import-preview-actions">
        <button onClick={onCancel}>取消</button>
        <button className="primary" disabled={!preview.rows.length} onClick={onConfirm}>确认导入 {preview.rows.length} 条</button>
      </div>
    </div>
    <div className="import-preview-summary">
      <span><b>{preview.rows.length}</b><small>可导入记录</small></span>
      <span><b>{preview.newCount}</b><small>净新增</small></span>
      <span><b>{preview.updateCount}</b><small>旧 ASIN 更新</small></span>
      <span className={preview.missingImageCount ? "needs-attention" : ""}><b>{preview.missingImageCount}</b><small>缺图待补</small></span>
      <span><b>{preview.duplicateRowCount}</b><small>表内重复行合并</small></span>
      <span className={preview.skippedRows.length ? "needs-attention" : ""}><b>{preview.skippedRows.length}</b><small>无法导入</small></span>
    </div>
    {preview.missingImageCount > 0 && <p className="import-preview-note">缺图产品会正常进入产品库，并自动显示在“待补数据”；不会暂停其他产品。</p>}
    {preview.skippedRows.length > 0 && <details className="import-preview-errors"><summary>查看无法导入的行</summary>{preview.skippedRows.map((row) => <p key={`${row.rowNumber}-${row.asin}`}>Excel 第 {row.rowNumber} 行 · {row.asin || "无 ASIN"} · {row.reason}</p>)}</details>}
    <div className="import-preview-table">
      <table>
        <thead><tr><th>状态</th><th>主图</th><th>ASIN / 商品</th><th>类目</th><th>价格</th><th>数据提示</th></tr></thead>
        <tbody>{preview.rows.map((row) => <tr key={row.product.asin}>
          <td><span className={`import-status import-status-${row.status}`}>{row.status === "new" ? "新增" : "更新"}</span></td>
          <td><span className="import-preview-image">{row.product.imageUrl ? <img src={row.product.imageUrl} alt="" loading="lazy" /> : <small>待补图</small>}</span></td>
          <td><b>{row.product.asin}</b><span>{row.product.title}</span>{row.product.titleZh && <small>{row.product.titleZh}</small>}{row.rowNumbers.length > 1 && <em>合并 Excel 行：{row.rowNumbers.join("、")}</em>}</td>
          <td>{row.product.category || "—"}</td>
          <td>{Number(row.product.price) > 0 ? `$${row.product.price}` : "—"}</td>
          <td>{row.missingImage ? <span className="data-status-badge">主图待补</span> : <span className="data-status-ok">主图完整</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
