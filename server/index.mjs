// LINX 本地服务入口：启动 SQLite 数据层、挂载 API、托管已构建的前端（dist/）。
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "./api.mjs";
import { createAuth } from "./auth.mjs";
import { createStore, projectRoot } from "./db.mjs";
import * as rulesModule from "./rules.mjs";
import { bdConfigured, bdFetchMarkdown } from "./bd.mjs";
import { autoDiscoveryIfDue } from "./discover.mjs";
import { visionBackfillTick } from "./vision.mjs";

const PORT = Number(process.env.LINX_PORT) || 3000;
const HOST = process.env.LINX_HOST || "0.0.0.0";
const dbPath = process.env.LINX_DB || join(projectRoot, "data", "linx.db");
const distDir = join(projectRoot, "dist");

const store = createStore(dbPath);
const seed = store.seedIfEmpty();
// v1 的历史校准样本不再灌入：一次研究冲刺的记录不代表稳定偏好（2026-09-18 已清过一次，教训记在 docs/选品逻辑.md）
const recompute = store.recomputeAll();

const app = express();
app.disable("x-powered-by");
app.locals.rulesModule = rulesModule;
const authUser = process.env.LINX_USER || "linx";
const auth = createAuth({ user: authUser, pass: process.env.LINX_PASS });
if (auth) app.use(auth);
app.use("/api", createApi(store));

if (existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.send(readFileSync(join(distDir, "index.html"), "utf8"));
  });
} else {
  app.get("/", (_req, res) => res.type("html").send("<meta charset=utf-8><h1>LINX 前端尚未构建</h1><p>请运行 <code>npm run build</code> 后刷新。</p>"));
}

app.listen(PORT, HOST, () => {
  const counts = store.counts();
  console.log(`LINX 已启动  http://localhost:${PORT}`);
  console.log(`数据库：${dbPath}`);
  if (auth) console.log(`访问密码已开启：账号 ${authUser}（密码在 scripts/launch-linx.ps1 里改）`);
  else console.log("访问密码未开启：设置环境变量 LINX_PASS 后生效");
  if (seed.seeded) console.log(`首次启动已导入初始数据：新增 ${seed.inserted} 款`);
  console.log(`产品库 ${counts.space1} · 适配池 ${counts.space2} · 已清除 ${counts.removed} · 收藏 ${counts.favorites} · 重算 ${recompute.ms}ms`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    store.close();
    process.exit(0);
  });
}

// 定期自动采集：服务在跑的时候每 6 小时看一眼，到期（距上次 ≥22h）且额度没用完就去抓，结果进发现箱
async function discoveryTick() {
  if (!bdConfigured()) return;
  try {
    const report = await autoDiscoveryIfDue(store, bdFetchMarkdown);
    if (report) {
      if (report.refreshed > 0) store.recomputeAll();
      console.log(`自动采集完成：新发现 ${report.kept} 款、刷新跟进 ${report.refreshed}/${report.refreshTotal} 款（搜索 ${report.searchRequests} / 详情 ${report.detailRequests} 次）`);
    }
  } catch (error) {
    console.log(`自动采集跳过：${error.message}`);
  }
}
setTimeout(discoveryTick, 15_000);
setInterval(discoveryTick, 6 * 3_600_000).unref();

// 视觉向量常驻管道：新产品的主图自动补算 CLIP 向量（本地跑，零费用），算完重算分层。
// 新品进入后最长 10 分钟内获得"看一眼就知道像不像"的能力；包未安装时静默跳过。
async function visionTick() {
  try {
    const done = await visionBackfillTick(store, 60, (m) => console.log("  " + m));
    if (done > 0) {
      console.log(`视觉向量：已为 ${done} 款产品补算，重算分层…`);
      store.recomputeAll();
    }
  } catch {
    // transformers 包未安装或模型未就绪：视觉通道静默关闭，属性相似度独立工作
  }
}
setTimeout(visionTick, 60_000);
setInterval(visionTick, 10 * 60_000).unref();
