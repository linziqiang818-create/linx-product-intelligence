// 本地视觉向量：transformers.js + 开源 CLIP 在本机 CPU 上跑，模型权重一次性下载（国内默认走 hf-mirror 镜像）。
// 零 API 费、零单张费用、断网可用——这是"高度相似"的第三通道：属性表达不了的"看一眼就知道像不像"。
// 包未安装 / 模型下载失败时全部静默降级：评分退回属性相似度，绝不影响主流程。
import { vectorDuplicateOf, isPinned } from "./dedupe.mjs";

export const VISION_MODEL = "Xenova/clip-vit-base-patch32";

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const mod = await import("@huggingface/transformers");
      if (!process.env.HF_ENDPOINT && !process.env.TRANSFORMERS_ENDPOINT) {
        mod.env.remoteHost = process.env.HF_MIRROR || "https://hf-mirror.com";
      }
      const extractor = await mod.pipeline("image-feature-extraction", VISION_MODEL, { quantized: true });
      return { extractor, RawImage: mod.RawImage };
    })();
    extractorPromise.catch(() => {
      extractorPromise = null; // 失败后允许重试（比如先装包再跑）
    });
  }
  return extractorPromise;
}

export async function visionAvailable() {
  try {
    await getExtractor();
    return true;
  } catch {
    return false;
  }
}

// 抓取主图 → CLIP 向量（512 维，L2 归一化），可直接用内积当余弦相似度
export async function embedImageUrl(url) {
  const { extractor, RawImage } = await getExtractor();
  const image = await RawImage.fromURL(url);
  const out = await extractor(image);
  const data = out.data;
  const dims = out.dims ?? [1, data.length];
  const dim = dims[dims.length - 1];
  const tokens = dims.length === 3 ? dims[dims.length - 2] : 1;
  const vec = new Float32Array(dim);
  for (let t = 0; t < tokens; t++) {
    for (let d = 0; d < dim; d++) vec[d] += Number(data[t * dim + d]) / tokens;
  }
  let norm = 0;
  for (let d = 0; d < dim; d++) norm += vec[d] * vec[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < dim; d++) vec[d] /= norm;
  return vec;
}

// 向量级同图合并：换过图 ID 但图还是同一张（cos ≥ 0.99）的款隐藏进代表款。
// 只对 asins 里指定的新增向量做增量判定，候选是当前的全体代表款。
// 被你动过的款（钉住/感兴趣）永不隐藏；代表款自己也可能刚被藏（链式）时交给下一轮收敛。
function dedupeVectorsFor(store, asins, log = () => {}) {
  const rows = store.db.prepare("SELECT asin, tier, interest FROM products WHERE variantOf = '' AND discoveryState != 'dismissed'").all();
  const canonical = new Set(rows.map((r) => r.asin));
  const vectors = store.loadVisualVectors();
  const candidates = [...canonical].filter((a) => vectors.has(a)).map((a) => ({ asin: a, vec: vectors.get(a) }));
  const setVariant = store.db.prepare("UPDATE products SET variantOf = ? WHERE asin = ?");
  let hidden = 0;
  for (const asin of asins) {
    if (!canonical.has(asin)) continue;
    const row = rows.find((r) => r.asin === asin);
    if (isPinned(row)) continue;
    const vec = vectors.get(asin);
    if (!vec) continue;
    const dup = vectorDuplicateOf(vec, candidates.filter((c) => c.asin !== asin));
    if (dup) {
      setVariant.run(dup, asin);
      canonical.delete(asin);
      hidden++;
    }
  }
  if (hidden) log(`同图合并：${hidden} 款主图与库内款相同（cos≥0.99），已隐藏`);
  return hidden;
}

// 给库里缺向量的产品补算（新品进来也走这条管道），返回本次完成数
export async function visionBackfillTick(store, limit = 60, log = () => {}) {
  if (!(await visionAvailable())) return 0;
  const missing = store.visualMissing(limit);
  let done = 0;
  const doneAsins = [];
  for (const { asin, imageUrl } of missing) {
    try {
      const vec = await embedImageUrl(imageUrl);
      store.setVisualVector(asin, vec);
      doneAsins.push(asin);
      done++;
    } catch (error) {
      log(`${asin}：视觉向量失败（${String(error.message).slice(0, 80)}）`);
    }
  }
  if (doneAsins.length) dedupeVectorsFor(store, doneAsins, log);
  return done;
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) dot += a[i] * b[i];
  return dot;
}

// 命令行：npm run vision —— 一次性给全库补算 + 全库同图合并
if (process.argv[1] && /vision/.test(process.argv[1])) {
  const { createStore } = await import("./db.mjs");
  const { fileURLToPath } = await import("node:url");
  const store = createStore(process.env.LINX_DB || fileURLToPath(new URL("../data/linx.db", import.meta.url)));
  const limit = Number(process.argv[2]) || 999999;
  let total = 0;
  while (total < limit) {
    const done = await visionBackfillTick(store, 50, (m) => console.log("  " + m));
    total += done;
    console.log(`视觉向量进度：已完成 ${total} 款`);
    // 整批零成功 = 剩下的全是死链，才收工；部分成功就继续啃
    if (done === 0) break;
  }
  console.log("开始全库同图合并（换图 ID 但同一张图的，cos≥0.99）…");
  const all = store.db.prepare("SELECT asin FROM products WHERE variantOf = '' AND discoveryState != 'dismissed'").all().map((r) => r.asin);
  const vectors = store.loadVisualVectors();
  const withVec = all.filter((a) => vectors.has(a));
  let hidden = 0;
  for (let i = 0; i < withVec.length; i += 500) {
    hidden += dedupeVectorsFor(store, withVec.slice(i, i + 500), () => {});
    if (i % 2000 === 0) console.log(`  已扫 ${i + Math.min(500, withVec.length - i)}/${withVec.length} 款，隐藏 ${hidden} 款`);
  }
  console.log(`视觉向量补算结束：共 ${total} 款；同图合并隐藏 ${hidden} 款（死链等特殊原因失败的，服务会定期小批量重试）`);
  store.close();
}
