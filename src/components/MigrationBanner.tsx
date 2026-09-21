import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp, useToast } from "../store";

type Legacy = { products: unknown[]; trash: unknown[]; favorites: string[]; calibration: unknown; batchCalibration: unknown };

function readLegacy(): Legacy | null {
  try {
    const raw = localStorage.getItem("furniture-radar-v5") || localStorage.getItem("furniture-radar-v4");
    if (!raw) return null;
    const data = JSON.parse(raw);
    const parse = (key: string) => {
      try {
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        return null;
      }
    };
    return {
      products: Array.isArray(data.products) ? data.products : [],
      trash: Array.isArray(data.trash) ? data.trash : [],
      favorites: Array.isArray(data.favorites) ? data.favorites : [],
      calibration: parse("linx-calibration-v1"),
      batchCalibration: parse("linx-batch-calibration-v1"),
    };
  } catch {
    return null;
  }
}

// 旧版把数据存在浏览器 localStorage；新版与旧版同源（3000 端口），可直接读出并一键导入数据库。
export default function MigrationBanner() {
  const { refreshStatus } = useApp();
  const { notify } = useToast();
  const [legacy, setLegacy] = useState<Legacy | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("linx-migration-done")) return;
    const data = readLegacy();
    if (data && (data.products.length || data.trash.length || data.favorites.length)) setLegacy(data);
  }, []);

  if (!legacy) return null;

  const run = async () => {
    setBusy(true);
    try {
      const result = await api.migrate(legacy);
      localStorage.setItem("linx-migration-done", new Date().toISOString());
      await refreshStatus();
      notify(`旧数据已导入：产品新增 ${result.inserted}、更新 ${result.updated}，收藏 ${result.favoritesAdded} 条，校准反馈 ${result.calibrationEvents} 条`, "success");
      setLegacy(null);
    } catch (e) {
      notify(`导入失败：${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const dismiss = () => {
    localStorage.setItem("linx-migration-done", "dismissed");
    setLegacy(null);
  };

  return (
    <div className="banner">
      <span>
        检测到旧版 LINX 留在浏览器里的数据：产品 {legacy.products.length} 款、垃圾箱 {legacy.trash.length} 款、收藏 {legacy.favorites.length} 条
        {legacy.calibration || legacy.batchCalibration ? "、校准反馈" : ""}。导入后收藏和校准会成为第二大脑的偏好信号。
      </span>
      <div className="banner-actions">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={run}>{busy ? "导入中…" : "一键导入旧数据"}</button>
        <button className="btn btn-sm" onClick={dismiss}>不再提示</button>
      </div>
    </div>
  );
}
