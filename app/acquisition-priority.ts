export type LightweightCandidate = {
  title: string;
  category?: string;
  price?: number;
  discoveryLane?: "red-ocean-blue" | "blue-ocean-red" | "exploration";
};

const hardReject = /\b(?:crib|bassinet|baby furniture|sofa|couch|recliner|gaming chair|glass cabinet|mirrored cabinet|solid wood|solid oak|solid pine|metal bed frame|wire shelving|sports equipment rack)\b/i;
const casegoods = /cabinet|sideboard|buffet|credenza|pantry|bookcase|bookshelf|desk|workstation|console|storage|island|enclosure/i;
const design = /arched|arch|fluted|ribbed|wave|tambour|rattan|cane|woven|curved|scalloped|asymmetric|geometric|mid-century|art deco/i;
const niche = /reptile|terrarium|washer|dryer|laundry|manicure|nail tech|salon station|reception desk|front counter|litter box|cat enclosure|pet furniture|trash can cabinet|sewing|craft station/i;
const structure = /drawer|door|shelf|adjustable|extendable|folding|tilt out|pull out|hidden|charging|outlet|caster|sliding/i;

export function preliminaryPriority(candidate: LightweightCandidate) {
  const text = `${candidate.category ?? ""} ${candidate.title}`;
  if (hardReject.test(text)) return { score: -100, disposition: "trash" as const, reasons: ["标题已明确触发硬性禁做条件"] };
  const reasons: string[] = [];
  let score = 0;
  if (casegoods.test(text)) { score += 28; reasons.push("属于公司可开发的柜体或工作台形态"); }
  if (design.test(text)) { score += 26; reasons.push("出现明确造型元素"); }
  if (niche.test(text)) { score += 32; reasons.push("出现明确小众使用场景"); }
  if (structure.test(text)) { score += 14; reasons.push("具备可优化的结构或功能"); }
  if ((candidate.price ?? 0) >= 100) { score += 8; reasons.push("进入目标价格带"); }
  if (candidate.discoveryLane === "exploration") { score += 5; reasons.push("探索样本保留少量优先权"); }
  const normalized = Math.min(100, score);
  return { score: normalized, disposition: normalized >= 58 ? "priority" as const : "queued" as const, reasons };
}
