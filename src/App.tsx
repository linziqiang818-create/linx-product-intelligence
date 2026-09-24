import { useEffect, useState } from "react";
import { AppProvider, ToastProvider, useApp } from "./store";
import type { ViewKey } from "./types";
import SpacePage from "./pages/SpacePage";
import SettingsPage from "./pages/SettingsPage";
import NotebookPage from "./pages/NotebookPage";
import DiscoveryPage from "./pages/DiscoveryPage";
import DevelopmentPage from "./pages/DevelopmentPage";
import DetailDrawer from "./components/DetailDrawer";
import CompareModal from "./components/CompareModal";
import MigrationBanner from "./components/MigrationBanner";

const VIEWS: ViewKey[] = ["1", "2", "3", "favorites", "notebook", "discover", "development", "settings"];

function viewFromHash(): ViewKey {
  const key = window.location.hash.replace(/^#\/?/, "").split("?")[0] as ViewKey;
  return VIEWS.includes(key) ? key : "1";
}

function useHashView() {
  const [view, setView] = useState<ViewKey>(viewFromHash);
  useEffect(() => {
    const onChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = (next: ViewKey) => {
    window.location.hash = `/${next}`;
  };
  return [view, go] as const;
}

function TopBar({ view, go }: { view: ViewKey; go: (v: ViewKey) => void }) {
  const { counts } = useApp();
  const max = Math.max(1, counts?.space1 ?? 1);
  const steps: { key: ViewKey; name: string; count: number; hint: string }[] = [
    { key: "1", name: "产品库", count: counts?.space1 ?? 0, hint: "所有导入的产品" },
    { key: "2", name: "适配池", count: counts?.space2 ?? 0, hint: "通过公司硬性条件" },
    { key: "3", name: "第二大脑", count: counts?.space3 ?? 0, hint: "按你的偏好排序" },
  ];
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go("1")} aria-label="回到产品库">
        LIN<span>X</span>
      </button>
      <nav className="funnel" aria-label="三个空间">
        {steps.map((step, index) => (
          <div className="funnel-item" key={step.key}>
            {index > 0 && <span className="funnel-arrow" aria-hidden="true" />}
            <button className={`funnel-step ${view === step.key ? "active" : ""}`} onClick={() => go(step.key)} title={step.hint}>
              <span className="funnel-index">{index + 1}</span>
              <span className="funnel-name">{step.name}</span>
              <b className="funnel-count">{counts ? step.count.toLocaleString("zh-CN") : "…"}</b>
              <i className="funnel-gauge" style={{ width: `${Math.max(6, (step.count / max) * 100)}%` }} />
            </button>
          </div>
        ))}
      </nav>
      <div className="topbar-right">
        <button className={`nav-pill ${view === "development" ? "active" : ""}`} onClick={() => go("development")} title="独立记录值得开发的产品与原因，不影响第二大脑排序">开发样本</button>
        <button className={`nav-pill ${view === "favorites" ? "active" : ""}`} onClick={() => go("favorites")}>
          <HeartIcon filled={view === "favorites"} />
          收藏夹
          {counts && counts.favorites > 0 && <em>{counts.favorites}</em>}
        </button>
        <button className={`nav-pill ${view === "discover" ? "active" : ""}`} onClick={() => go("discover")} title="自动采集的候选产品，收进来进入正常选品流程">
          <RadarIcon />
          发现箱
          {counts && counts.discovery > 0 && <em>{counts.discovery}</em>}
        </button>
        <button className={`nav-pill ${view === "notebook" ? "active" : ""}`} onClick={() => go("notebook")} title="被硬性条件筛除的产品复查、规则误判统计、你的手动调整历史">
          <NotebookIcon />
          错题本
          {counts && counts.removed > 0 && <em>{counts.removed.toLocaleString("zh-CN")}</em>}
        </button>
        <button className={`nav-pill ${view === "settings" ? "active" : ""}`} onClick={() => go("settings")} aria-label="设置">
          <GearIcon />
          设置
        </button>
      </div>
    </header>
  );
}

export function NotebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
      <path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6 3.5v17M4 7.5h4M4 12h4M4 16.5h4M10.5 9h5M10.5 13h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
      <path
        d="M12 21s-7.2-4.6-9.3-9A5.4 5.4 0 0 1 12 6.2a5.4 5.4 0 0 1 9.3 5.8C19.2 16.4 12 21 12 21z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RadarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="icon">
      <path d="M12 12 18.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path d="M16.2 7.8a6 6 0 1 1-8.4 0M19 5a10 10 0 1 1-14 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function OfflineOverlay() {
  const { offline } = useApp();
  if (!offline) return null;
  return (
    <div className="offline" role="alertdialog" aria-live="assertive">
      <div className="offline-card">
        <span className="offline-dot" aria-hidden="true" />
        <span className="kicker">LINX Service</span>
        <h2>LINX 服务没有在运行</h2>
        <p>网页只是界面，真正干活的是那个黑色的「LINX 选品工作台」窗口。它被关掉了，或者还没打开。</p>
        <ol>
          <li>双击桌面上的 <b>「LINX 选品工作台」</b></li>
          <li>等黑色窗口显示「LINX 已启动」</li>
          <li>本页面会<b>自动恢复</b>，不用刷新</li>
        </ol>
        <p className="offline-note">
          <span className="spinner" aria-hidden="true" /> 正在等待服务上线…　用完 LINX 时直接关掉黑色窗口即可，数据已实时保存。
        </p>
      </div>
    </div>
  );
}

function Shell() {
  const [view, go] = useHashView();
  return (
    <div className="app">
      <TopBar view={view} go={go} />
      <MigrationBanner />
      <main className="main">
        {view === "settings" ? <SettingsPage /> : view === "notebook" ? <NotebookPage /> : view === "discover" ? <DiscoveryPage /> : view === "development" ? <DevelopmentPage /> : <SpacePage key={view} space={view} />}
      </main>
      <DetailDrawer />
      <CompareModal />
      <OfflineOverlay />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ToastProvider>
  );
}
