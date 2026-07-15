export type BatchGroupDecision = "priority" | "normal" | "low" | "reject" | "split";
export type TopAuditDecision = "correct" | "high" | "low" | "exclude";

export type BatchCalibrationCandidate = {
  asin: string;
  title: string;
  titleZh: string;
  category: string;
  grade: "A" | "B" | "C" | "D";
  score: number;
  interestTier: "priority" | "normal" | "low" | "unrated";
  imageUrl?: string;
  sourceUrl: string;
  price: number;
  monthlySales: number;
  reasons: string[];
};

export type ProductGroup = {
  id: string;
  name: string;
  description: string;
  products: BatchCalibrationCandidate[];
  representatives: BatchCalibrationCandidate[];
};

export type BatchCalibrationState = {
  version: 1;
  groups: Record<string, { decision: BatchGroupDecision; updatedAt: string }>;
  audit: Record<string, { decision: TopAuditDecision; updatedAt: string }>;
};

export const emptyBatchCalibrationState = (): BatchCalibrationState => ({ version: 1, groups: {}, audit: {} });

const definitions: Array<{ id: string; name: string; description: string; pattern: RegExp }> = [
  { id: "ceiling-racks", name: "吊顶与车库顶置储物架", description: "吊顶、升降和顶置车库储物系统", pattern: /ceiling mounted|ceiling storage|overhead garage|garage ceiling/i },
  { id: "coffee-bar", name: "咖啡吧与酒水场景柜", description: "咖啡站、冰箱位、酒储和组合吧柜", pattern: /coffee bar|coffee station|bar cabinet|wine storage|mini fridge/i },
  { id: "reception", name: "商业前台与接待台", description: "办公室、沙龙、零售和酒店前台", pattern: /reception|front desk|front counter|checkout counter/i },
  { id: "kitchen-storage", name: "厨房高柜与餐边收纳", description: "食品高柜、微波炉柜、餐边柜和厨房储物", pattern: /pantry|kitchen hutch|buffet|sideboard|credenza/i },
  { id: "kitchen-islands", name: "厨房岛台与移动餐车", description: "固定或移动岛台、翻板和垃圾桶组合柜", pattern: /kitchen island|island cart|rolling island|trash cabinet|garbage cabinet/i },
  { id: "tv-media", name: "电视柜与壁炉媒体柜", description: "电视柜、娱乐中心和电壁炉组合柜", pattern: /tv stand|television stand|entertainment center|media console|fireplace tv/i },
  { id: "bookcase-display", name: "书架与展示收纳", description: "书架、开放展示柜和窄书柜", pattern: /bookcase|bookshelf|book shelf|display cabinet|display shelf/i },
  { id: "dresser-storage", name: "斗柜与通用储物柜", description: "卧室斗柜、抽屉柜和通用板式储物柜", pattern: /dresser|chest of drawers|storage cabinet|armoire|wardrobe/i },
  { id: "tables", name: "餐桌、会议桌与伸缩桌", description: "餐桌、会议桌、伸缩和折叠桌类", pattern: /dining table|conference table|meeting table|extendable table|expandable table/i },
  { id: "occasional", name: "茶几、边几与床头柜", description: "客厅茶几、边几、玄关桌和床头柜", pattern: /coffee table|end table|nightstand|sofa table|console table/i },
  { id: "beds", name: "床架、高架床与软包床", description: "床架、儿童高架床、升降床和软包床", pattern: /\bbed\b|bed frame|loft bed|bunk bed|adjustable bed/i },
  { id: "pet", name: "宠物家具与动物笼柜", description: "宠物笼柜、猫柜、狗屋和小动物家具", pattern: /dog crate|dog house|kennel|cat litter|cat house|hamster|guinea pig|small animal|pet furniture|reptile|terrarium/i },
  { id: "craft-salon", name: "手作、缝纫与美甲工作站", description: "缝纫柜、手作收纳、美甲桌和专业工作台", pattern: /sewing|craft|cricut|scrapbook|manicure|nail desk|nail table|salon station/i },
  { id: "office", name: "办公桌、文件柜与电脑工作站", description: "升降桌、电脑桌、打印机柜和文件柜", pattern: /computer workstation|standing desk|office desk|file cabinet|filing cabinet|printer stand|machine cart|computer cart/i },
  { id: "entryway", name: "玄关、鞋柜与衣帽收纳", description: "鞋柜、鞋架、换鞋凳、衣帽架和门厅树", pattern: /shoe|hall tree|entryway|coat rack|locker/i },
  { id: "metal-racks", name: "金属器材架与工业收纳", description: "器材架、工具架、工业货架和纯金属收纳", pattern: /equipment rack|utility rack|metal rack|steel rack|shelving|tool cart|storage rack/i },
  { id: "podiums", name: "讲台、展示台与特殊商业家具", description: "讲台、教堂演讲台和特殊展示家具", pattern: /podium|lectern|pulpit|shtender/i },
  { id: "outdoor-utility", name: "户外与非核心家具", description: "户外、水族、卫浴及其他非核心方向", pattern: /outdoor|patio|aquarium|sink|bathroom|fire pit/i },
  { id: "other", name: "其他待拆分产品", description: "尚未稳定归入现有产品族的产品", pattern: /.*/i },
];

export function buildProductGroups(candidates: BatchCalibrationCandidate[]): ProductGroup[] {
  const buckets = new Map<string, BatchCalibrationCandidate[]>();
  for (const product of candidates) {
    const text = `${product.category} ${product.title}`;
    const definition = definitions.find((item) => item.pattern.test(text)) ?? definitions[definitions.length - 1];
    buckets.set(definition.id, [...(buckets.get(definition.id) ?? []), product]);
  }
  return definitions.flatMap((definition) => {
    const products = buckets.get(definition.id) ?? [];
    if (!products.length) return [];
    const ranked = [...products].sort((a, b) => (a.grade === "D" ? 1 : 0) - (b.grade === "D" ? 1 : 0) || b.score - a.score);
    return [{ ...definition, products: ranked, representatives: ranked.slice(0, 3) }];
  });
}

export function normalizeBatchCalibrationState(value: unknown): BatchCalibrationState {
  if (!value || typeof value !== "object") return emptyBatchCalibrationState();
  const raw = value as Partial<BatchCalibrationState>;
  if (raw.version !== 1 || !raw.groups || !raw.audit) return emptyBatchCalibrationState();
  return { version: 1, groups: raw.groups, audit: raw.audit };
}

export function batchCoverage(groups: ProductGroup[], state: BatchCalibrationState) {
  const coveredProducts = groups.reduce((total, group) => state.groups[group.id] && state.groups[group.id].decision !== "split" ? total + group.products.length : total, 0);
  const splitProducts = groups.reduce((total, group) => state.groups[group.id]?.decision === "split" ? total + group.products.length : total, 0);
  const totalProducts = groups.reduce((total, group) => total + group.products.length, 0);
  return { coveredProducts, splitProducts, totalProducts, percent: totalProducts ? Math.round(coveredProducts / totalProducts * 100) : 0 };
}
