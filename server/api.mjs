// REST API：所有读写都经过这里；派生字段变更后统一调用 recomputeAll。
import express from "express";
import multer from "multer";
import { defaultRules, normalizeRules } from "./rules-config.mjs";
import { GROUP_LABELS } from "./rules.mjs";
import { categoryDictionary } from "./category-zh.mjs";
import { buildWorkbook, parseWorkbook, toCsv, workbookToBuffer } from "./importer.mjs";
import { bdConfigured, bdFetchMarkdown } from "./bd.mjs";
import { getLedger, normalizeDiscoveryConfig, runDiscovery } from "./discover.mjs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

const asList = (value) => (Array.isArray(value) ? value : String(value ?? "").split(",")).map((s) => String(s).trim()).filter(Boolean);

export function createApi(store) {
  const api = express.Router();
  api.use(express.json({ limit: "80mb" }));

  api.get("/status", (_req, res) => {
    res.json({
      ok: true,
      counts: store.counts(),
      seeded: store.kvGet("seeded"),
      migratedAt: store.kvGet("migratedAt"),
      lastRecompute: store.kvGet("lastRecompute"),
      profile: store.kvGet("profile"),
      groupLabels: GROUP_LABELS,
      categoryZh: categoryDictionary,
    });
  });

  api.get("/facets", (req, res) => res.json(store.facets(String(req.query.space ?? "1"))));

  api.get("/products", (req, res) => res.json(store.listProducts(req.query)));

  api.get("/products/:asin", (req, res) => {
    const product = store.getProduct(String(req.params.asin).toUpperCase());
    if (!product) return res.status(404).json({ error: "产品不存在" });
    res.json(product);
  });

  api.put("/products/:asin", (req, res) => {
    const asin = String(req.params.asin).toUpperCase();
    if (!store.getProduct(asin)) return res.status(404).json({ error: "产品不存在" });
    store.updateProductFields(asin, req.body ?? {});
    store.recomputeAll();
    res.json(store.getProduct(asin));
  });

  api.post("/products/delete", (req, res) => {
    const asins = asList(req.body?.asins);
    if (!asins.length) return res.status(400).json({ error: "缺少 asins" });
    store.deleteProducts(asins);
    store.recomputeAll();
    res.json({ ok: true, deleted: asins.length, counts: store.counts() });
  });

  // 纠错：rescue=捞回空间2，exclude=移出空间2，clear=恢复自动判定
  api.post("/products/override", (req, res) => {
    const asins = asList(req.body?.asins);
    const action = String(req.body?.action ?? "");
    if (!asins.length || !["rescue", "exclude", "clear"].includes(action)) return res.status(400).json({ error: "参数错误" });
    store.setOverride(asins, action, String(req.body?.reason ?? ""));
    store.recomputeAll();
    res.json({ ok: true, counts: store.counts(), products: asins.map((a) => store.getProduct(a)).filter(Boolean) });
  });

  // 三层池移动：to = brain（第二大脑）/ pool（适配池）/ library（产品库）/ auto（恢复自动判定）
  // changed = 这次移动（含偏好重算的连锁反应）导致成员变化的全部产品
  api.post("/products/move", (req, res) => {
    const asins = asList(req.body?.asins).map((a) => a.toUpperCase());
    const to = String(req.body?.to ?? "");
    if (!asins.length || !["brain", "pool", "library", "auto"].includes(to)) return res.status(400).json({ error: "参数错误" });
    const before = store.brainAsins();
    const result = store.moveProducts(asins, to, String(req.body?.reason ?? ""));
    store.recomputeAll();
    const after = store.brainAsins();
    const changed = [...after].filter((a) => !before.has(a)).concat([...before].filter((a) => !after.has(a)));
    res.json({ ok: true, ...result, changed, counts: store.counts(), products: asins.map((a) => store.getProduct(a)).filter(Boolean) });
  });

  // 撤销移动：删除学习事件并还原移动前状态
  api.post("/products/move/undo", (req, res) => {
    const moves = Array.isArray(req.body?.moves) ? req.body.moves : [];
    if (!moves.length) return res.status(400).json({ error: "参数错误" });
    let result;
    const before = store.brainAsins();
    try {
      result = store.undoMoves(moves);
    } catch (error) {
      return res.status(409).json({ error: error.message });
    }
    store.recomputeAll();
    const after = store.brainAsins();
    const changed = [...after].filter((a) => !before.has(a)).concat([...before].filter((a) => !after.has(a)));
    const asins = moves.map((m) => String(m?.asin ?? "").toUpperCase()).filter(Boolean);
    res.json({ ok: true, ...result, changed, counts: store.counts(), products: asins.map((a) => store.getProduct(a)).filter(Boolean) });
  });

  // 给移动补记原因
  api.post("/products/move/reason", (req, res) => {
    const asin = String(req.body?.asin ?? "").toUpperCase();
    const eventId = Number(req.body?.eventId);
    const reason = String(req.body?.reason ?? "").trim();
    if (!asin || !eventId || !reason) return res.status(400).json({ error: "参数错误" });
    try {
      store.setMoveReason(asin, eventId, reason);
    } catch (error) {
      return res.status(404).json({ error: error.message });
    }
    store.recomputeAll();
    res.json({ ok: true, product: store.getProduct(asin) });
  });

  // 错题本：手动调整历史
  api.get("/moves", (req, res) => res.json({ rows: store.listMoves(Number(req.query.limit) || 200) }));

  // ---------- 发现箱：自动采集的候选产品 ----------
  api.get("/discover", (_req, res) =>
    res.json({
      rows: store.listDiscoveryRows(),
      config: normalizeDiscoveryConfig(store.kvGet("discoveryConfig")),
      ledger: getLedger(store),
      lastRun: store.kvGet("lastDiscovery") ?? null,
      configured: bdConfigured(),
    }),
  );

  api.put("/discover/config", (req, res) => {
    const config = normalizeDiscoveryConfig(req.body ?? {});
    store.kvSet("discoveryConfig", config);
    res.json({ ok: true, config });
  });

  api.post("/discover/run", async (req, res) => {
    try {
      const report = await runDiscovery(store, bdFetchMarkdown);
      // 刷新改了跟进产品的市场字段，重算让评分与分层跟上；纯新增（发现箱待审）不影响现有分层
      if (report.refreshed > 0) store.recomputeAll();
      res.json({ ok: true, report, counts: store.counts() });
    } catch (error) {
      res.status(502).json({ error: `采集失败：${error.message}` });
    }
  });

  api.post("/discover/promote", (req, res) => {
    const asins = asList(req.body?.asins).map((a) => a.toUpperCase());
    if (!asins.length) return res.status(400).json({ error: "缺少 asins" });
    const result = store.promoteDiscoveries(asins);
    store.recomputeAll();
    res.json({ ok: true, ...result, counts: store.counts(), products: asins.map((a) => store.getProduct(a)).filter(Boolean) });
  });

  api.post("/discover/dismiss", (req, res) => {
    const asins = asList(req.body?.asins).map((a) => a.toUpperCase());
    if (!asins.length) return res.status(400).json({ error: "缺少 asins" });
    const result = store.dismissDiscoveries(asins);
    res.json({ ok: true, ...result, counts: store.counts() });
  });

  api.post("/favorites", (req, res) => {
    const asins = asList(req.body?.asins);
    if (!asins.length) return res.status(400).json({ error: "缺少 asins" });
    store.setFavorite(asins, Boolean(req.body?.on));
    store.recomputeAll();
    res.json({ ok: true, counts: store.counts(), products: asins.map((a) => store.getProduct(a)).filter(Boolean) });
  });

  // 第二大脑反馈：interested / not_interested / clear
  api.post("/feedback", (req, res) => {
    const asin = String(req.body?.asin ?? "").toUpperCase();
    const action = String(req.body?.action ?? "");
    if (!asin || !["interested", "not_interested", "clear"].includes(action)) return res.status(400).json({ error: "参数错误" });
    if (!store.getProduct(asin)) return res.status(404).json({ error: "产品不存在" });
    store.setInterest(asin, action);
    store.recomputeAll();
    res.json({ ok: true, counts: store.counts(), product: store.getProduct(asin) });
  });

  api.post("/import", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "请选择文件" });
    const mode = req.body?.mode === "replace" ? "replace" : "merge";
    let parsed;
    try {
      parsed = parseWorkbook(req.file.buffer, req.file.originalname);
    } catch (error) {
      return res.status(400).json({ error: `文件解析失败：${error.message}` });
    }
    if (!parsed.rows.length) return res.status(400).json({ error: "没有识别到包含 ASIN 和标题的行。卖家精灵导出表需保留“ASIN”“商品标题”列。" });
    const importedAt = new Date().toISOString();
    const result = mode === "replace" ? store.replaceAllProducts(parsed.rows, { importedAt }) : store.upsertProducts(parsed.rows, { importedAt });
    const images = parsed.rows.filter((r) => r.imageUrl).length;
    store.logImport({ fileName: req.file.originalname, mode, rows: parsed.rows.length, inserted: result.inserted, updated: result.updated, images });
    store.recomputeAll();
    res.json({ ok: true, mode, kind: parsed.kind, rows: parsed.rows.length, ...result, images, counts: store.counts() });
  });

  api.get("/export", (req, res) => {
    const rows = store.allProducts(req.query);
    const format = req.query.format === "csv" ? "csv" : "xlsx";
    const spaceName = { 1: "产品库", 2: "适配池", 3: "第二大脑推荐", removed: "已清除", favorites: "收藏夹" }[String(req.query.space ?? "1")] ?? "产品";
    const { book, header, data } = buildWorkbook(rows, spaceName);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = encodeURIComponent(`LINX-${spaceName}-${stamp}.${format}`);
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${name}`);
      return res.send(toCsv(header, data));
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${name}`);
    res.send(workbookToBuffer(book));
  });

  api.get("/rules", (_req, res) => res.json({ rules: store.getRules(), defaults: defaultRules(), stats: store.ruleStats(), groupLabels: GROUP_LABELS }));
  api.put("/rules", (req, res) => {
    try {
      store.setRules(normalizeRules(req.body?.rules ?? req.body));
    } catch (error) {
      return res.status(400).json({ error: `规则无效：${error.message}` });
    }
    const info = store.recomputeAll();
    res.json({ ok: true, rules: store.getRules(), counts: store.counts(), recompute: info, stats: store.ruleStats() });
  });
  api.post("/rules/reset", (_req, res) => {
    store.setRules(defaultRules());
    store.recomputeAll();
    res.json({ ok: true, rules: store.getRules(), counts: store.counts() });
  });
  api.post("/rules/test", (req, res) => {
    // 用一段文本试规则：返回归位结果，方便在设置页调试
    const { compileRules, placeProduct } = req.app.locals.rulesModule;
    const rules = compileRules(normalizeRules(req.body?.rules ?? store.getRules()));
    const product = { title: req.body?.title ?? "", category: req.body?.category ?? "", material: req.body?.material ?? "" };
    res.json(placeProduct(product, rules, null, null));
  });

  api.get("/preference", (_req, res) => res.json({ profile: store.kvGet("profile"), counts: store.counts() }));
  api.post("/preference/reset", (req, res) => {
    store.resetPreference(req.body?.scope === "keep-calibration" ? "keep-calibration" : "all");
    store.recomputeAll();
    res.json({ ok: true, profile: store.kvGet("profile"), counts: store.counts() });
  });

  api.get("/backup", (_req, res) => {
    const data = store.backup();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`LINX-备份-${data.exportedAt.slice(0, 10)}.json`)}`);
    res.send(JSON.stringify(data));
  });
  api.post("/restore", (req, res) => {
    const data = req.body;
    if (!data || !Array.isArray(data.products)) return res.status(400).json({ error: "备份文件无效" });
    // 兼容旧版备份（products/favorites/calibration）
    const result = data.version === 2 ? store.restore(data, req.body.mode === "merge" ? "merge" : "replace") : store.migrateLegacy(data);
    store.recomputeAll();
    res.json({ ok: true, ...result, counts: store.counts() });
  });

  api.post("/migrate/localstorage", (req, res) => {
    const payload = req.body ?? {};
    if (!Array.isArray(payload.products) && !Array.isArray(payload.trash) && !Array.isArray(payload.favorites)) return res.status(400).json({ error: "没有可迁移的数据" });
    const result = store.migrateLegacy(payload);
    store.recomputeAll();
    res.json({ ok: true, ...result, counts: store.counts() });
  });

  api.post("/recompute", (_req, res) => res.json({ ok: true, ...store.recomputeAll(), counts: store.counts() }));

  api.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: error.message ?? "服务器内部错误" });
  });

  return api;
}
