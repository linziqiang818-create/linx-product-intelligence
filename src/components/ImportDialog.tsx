import { useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../store";
import { CloseIcon } from "./icons";

export default function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { setCounts } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    if (!file) return;
    if (mode === "replace" && !window.confirm("替换模式会删除产品库中现有的所有产品和人工纠错记录（收藏与偏好反馈保留）。确定继续？")) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.importFile(file, mode);
      setCounts(result.counts);
      onDone(`已${mode === "replace" ? "替换为" : "导入"} ${result.rows} 行：新增 ${result.inserted}，更新 ${result.updated}，识别主图 ${result.images} 张。已按规则自动归位。`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal import">
        <header className="modal-head">
          <h2>导入卖家精灵表格</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="关闭"><CloseIcon size={14} /></button>
        </header>
        <div
          className={`dropzone ${file ? "has-file" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          onClick={() => input.current?.click()}
        >
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <>
              <b>{file.name}</b>
              <span>{(file.size / 1024).toFixed(0)} KB · 点击更换</span>
            </>
          ) : (
            <>
              <b>拖入 .xlsx / .csv 文件，或点击选择</b>
              <span>自动识别卖家精灵导出表（需含「ASIN」「商品标题」列），也兼容旧版模板。</span>
            </>
          )}
        </div>
        <div className="mode-row">
          <label className={mode === "merge" ? "active" : ""}>
            <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} />
            <b>追加并更新</b>
            <span>已有 ASIN 用新数据更新，新 ASIN 加入产品库。推荐。</span>
          </label>
          <label className={mode === "replace" ? "active" : ""}>
            <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
            <b>替换整个产品库</b>
            <span>清空现有产品后只保留这次导入的。收藏与偏好反馈保留。</span>
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <footer className="modal-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!file || busy} onClick={submit}>{busy ? "导入中…" : "开始导入"}</button>
        </footer>
      </section>
    </div>
  );
}
