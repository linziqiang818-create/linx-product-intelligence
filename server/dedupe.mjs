// 同图变体合并（2026-09-21 用户定稿）：同一张主图只展示一次。
// 两级判定：
//   ① 图片 ID 相同——Amazon 图床 /images/I/<ID>. 的 ID，换尺寸后缀（_AC_SL1500_ 等）不算换图，必然是同一张图；
//   ② 图片 ID 不同但 CLIP 向量 cos ≥ 0.99——2026-09-21 实测全库：同图 ID 对全部 ≥0.99（零异常），
//      换 ID 的真正同图重传也全落在 0.99 以上；0.97–0.99 的"像但不确定"不合并，
//      两个真正不同的链接各拍各的图，用户接受它们同时可见。
// 被合并的款 variantOf 指向保留的代表款：三空间、发现箱、计数全部隐藏，数据保留、可反查。
export const VECTOR_DUP_COS = 0.99;

export function imageIdOf(url = "") {
  const m = String(url).match(/\/images\/I\/([A-Za-z0-9%+_.-]+?)\./);
  return m ? m[1] : "";
}

// 你动过的款（钉住/感兴趣）永远不当变体藏——手动钉住永远赢过模型，也赢过去重
export const isPinned = (p) => Boolean(p && ((p.tier && p.tier !== "") || p.interest === "interested"));

// 代表款挑选：被你动过的永远优先——绝不能把你收藏的款藏成变体；
// 其次评论多（更像"正主"链接），再次有毛重（数据更全），最后 ASIN 字典序兜底保证确定性。
export function pickCanonical(a, b) {
  if (isPinned(a) !== isPinned(b)) return isPinned(a) > isPinned(b) ? a : b;
  const reviewsA = Number(a.reviews) || 0;
  const reviewsB = Number(b.reviews) || 0;
  if (reviewsA !== reviewsB) return reviewsA > reviewsB ? a : b;
  const kgA = Number(a.packageGrossKg) || 0;
  const kgB = Number(b.packageGrossKg) || 0;
  if (kgA !== kgB) return kgA > kgB ? a : b;
  return a.asin <= b.asin ? a : b;
}

// 按图片 ID 分组去重：返回 Map<被隐藏 asin, 代表 asin>。已 dismissed 的不要传进来——
// 否则一张已放弃的图会占住代表位，把可见款也连带藏掉。
// 被你动过的款只当代表、永不被藏：同一张图上你钉了两款，就两款都可见。
export function planImageDedup(products) {
  const groups = new Map();
  for (const p of products) {
    const id = imageIdOf(p.imageUrl);
    if (!id) continue;
    const group = groups.get(id);
    if (group) group.push(p);
    else groups.set(id, [p]);
  }
  const hidden = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let canonical = group[0];
    for (const p of group.slice(1)) canonical = pickCanonical(canonical, p);
    for (const p of group) if (p.asin !== canonical.asin && !isPinned(p)) hidden.set(p.asin, canonical.asin);
  }
  return hidden;
}

// 增量向量判定：一个向量在候选代表款里找同图。candidates: [{ asin, vec }]，调用方负责排除自己。
// 输入按 L2 归一化向量设计（内积=余弦），但这里仍除一次模长兜底，未归一化的输入也不会误判。
export function vectorDuplicateOf(vec, candidates, threshold = VECTOR_DUP_COS) {
  if (!vec || !candidates?.length) return "";
  let vecNorm = 0;
  for (let k = 0; k < vec.length; k++) vecNorm += vec[k] * vec[k];
  vecNorm = Math.sqrt(vecNorm);
  if (!vecNorm) return "";
  let best = "";
  let bestCos = threshold;
  for (const c of candidates) {
    const cv = c.vec;
    if (!cv) continue;
    let dot = 0;
    let cvNorm = 0;
    for (let k = 0; k < vec.length && k < cv.length; k++) {
      dot += vec[k] * cv[k];
      cvNorm += cv[k] * cv[k];
    }
    cvNorm = Math.sqrt(cvNorm);
    if (!cvNorm) continue;
    const cos = dot / (vecNorm * cvNorm);
    if (cos > bestCos) {
      bestCos = cos;
      best = c.asin;
    }
  }
  return best;
}
