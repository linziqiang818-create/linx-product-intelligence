// 本地视觉向量：transformers.js + 开源 CLIP 在本机 CPU 上跑，模型权重一次性下载（国内默认走 hf-mirror 镜像）。
// 零 API 费、零单张费用、断网可用——这是"高度相似"的第三通道：属性表达不了的"看一眼就知道像不像"。
// 包未安装 / 模型下载失败时全部静默降级：评分退回属性相似度，绝不影响主流程。
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

// 给库里缺向量的产品补算（新品进来也走这条管道），返回本次完成数
export async function visionBackfillTick(store, limit = 60, log = () => {}) {
  if (!(await visionAvailable())) return 0;
  const missing = store.visualMissing(limit);
  let done = 0;
  for (const { asin, imageUrl } of missing) {
    try {
      const vec = await embedImageUrl(imageUrl);
      store.setVisualVector(asin, vec);
      done++;
    } catch (error) {
      log(`${asin}：视觉向量失败（${String(error.message).slice(0, 80)}）`);
    }
  }
  return done;
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) dot += a[i] * b[i];
  return dot;
}

// 命令行：npm run vision —— 一次性给全库补算
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
  console.log(`视觉向量补算结束：共 ${total} 款（死链等特殊原因失败的，服务会定期小批量重试）`);
  store.close();
}
