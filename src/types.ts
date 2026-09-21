export type Placement = "pass" | "removed";
export type RemoveGroup = "" | "category" | "commodity" | "material" | "convertible" | "manual";
export type Interest = "" | "interested" | "not_interested";
/** 手动钉住的层级；空串表示交给模型预测 */
export type TierPin = "" | "brain" | "pool";
/** 产品当前所在层：floor=产品库底层（被硬性条件筛除） */
export type Tier = "brain" | "pool" | "floor";
/** 移动目标：auto=恢复自动判定 */
export type MoveTarget = "brain" | "pool" | "library" | "auto";
export type SpaceKey = "1" | "2" | "3" | "favorites";
export type ViewKey = SpaceKey | "settings" | "notebook" | "discover";

/** 自动升入第二大脑的正向偏好分门槛（与 server/preference.mjs 保持一致） */
export const BRAIN_AUTO_THRESHOLD = 40;

export const TIER_LABELS: Record<Tier, string> = { brain: "第二大脑", pool: "适配池", floor: "产品库" };

/** 移回产品库时可选的原因（同时进错题本与学习事件） */
export const EXCLUDE_REASONS = ["普货，结构太简单", "材质做不了", "类目不做", "同质化严重", "其他原因"];

/** 产品当前住在哪一层（漏斗语义）：适配池 = 过硬性条件的默认层；第二大脑 = 手动升入 + 锚点达标 + 各类目优中选优 */
export function tierOf(p: Pick<Product, "placement" | "tier" | "prefScore" | "autoBrain">): Tier {
  if (p.placement === "removed") return "floor";
  if (p.tier === "brain") return "brain";
  if (p.tier === "pool") return "pool";
  return p.prefScore >= BRAIN_AUTO_THRESHOLD || p.autoBrain === 1 ? "brain" : "pool";
}

/** 产品是否属于某个空间列表（移动后用来判断卡片要不要滑出） */
export function inSpace(p: Product, space: SpaceKey): boolean {
  if (space === "1") return true;
  if (space === "favorites") return p.favorite;
  const tier = tierOf(p);
  return space === "2" ? tier === "pool" : tier === "brain";
}

export type Assessment = {
  companyFit: number;
  demand: number;
  hiddenOpportunity: number;
  estimatedMargin: number;
  marginConfidence: string;
  freightTriggers: string[];
  dataMissing: string[];
  hiddenSignals: string[];
  trendElements: string[];
  fitReasons: string[];
  priorReasons: string[];
};

export type Product = {
  asin: string;
  title: string;
  titleZh: string;
  imageUrl: string;
  category: string;
  material: string;
  variants: string;
  sellingPoints: string;
  painPoints: string;
  sourceUrl: string;
  note: string;
  brand: string;
  parentAsin: string;
  dateFirstAvailable: string;
  dimensions: string;
  packageDimensionsCm: string;
  returnRisk: string;
  discoveryKeyword: string;
  discoverySource: string;
  sourceWorkbook: string;
  sourceDataProvider: string;
  importedAt: string;
  observedAt: string;
  updatedAt: string;
  monthlySalesRange: string;
  price: number;
  rating: number;
  reviews: number;
  bsr: number;
  monthlySales: number;
  salesGrowth: number;
  launchDays: number;
  packageGrossKg: number;
  weight: number;
  estimatedMargin: number;
  priceUplift: number;
  complexity: number;
  differentiation: number;
  sourceRow: number;
  extra: Record<string, unknown>;
  interest: Interest;
  tier: TierPin;
  placement: Placement;
  autoPlacement: Placement;
  autoReason: string;
  removeGroup: RemoveGroup;
  removeReason: string;
  removeRuleId: string;
  convertible: string;
  tags: string[];
  materialGroup: string;
  baseScore: number;
  prefScore: number;
  autoBrain: number;
  finalScore: number;
  marginEst: number;
  attrs: Record<string, unknown>;
  assessment: Assessment;
  reasons: string[];
  notes: string[];
  favorite: boolean;
  override: { action: "rescue" | "exclude"; reason: string } | null;
};

export type Counts = {
  space1: number;
  space2: number;
  removed: number;
  space3: number;
  favorites: number;
  discovery: number;
  poolPinned: number;
  poolAuto: number;
  events: number;
  variantsHidden: number;
};

/** 自动采集配置（server/discover.mjs 的 normalizeDiscoveryConfig） */
export type DiscoveryConfig = {
  keywords: string[];
  autoDaily: boolean;
  dailySearchLimit: number;
  dailyDetailLimit: number;
  dailyRefreshLimit: number;
  monthlyRequestCap: number;
  maxPerKeyword: number;
  priceMin: number;
  priceMax: number;
};

export type DiscoveryReport = {
  at: string;
  searchRequests: number;
  detailRequests: number;
  kept: number;
  refreshed: number;
  refreshTotal: number;
  dupImage: number;
  keywords: { keyword: string; found: number; newCount: number; kept: number; skippedExisting: number; filtered: number; dupImage: number; error?: string }[];
  errors: string[];
};

export type DiscoverState = {
  rows: Product[];
  config: DiscoveryConfig;
  ledger: { date: string; month: string; search: number; detail: number; monthTotal: number };
  lastRun: DiscoveryReport | null;
  configured: boolean;
};

/** 一条手动调整记录（错题本历史） */
export type MoveRecord = {
  eventId: number;
  asin: string;
  action: string;
  reason: string;
  weight: number;
  createdAt: string;
  title: string | null;
  titleZh: string | null;
  category: string | null;
  imageUrl: string | null;
  prev: { tier: TierPin; interest: Interest; override: { action: "rescue" | "exclude"; reason: string; created_at?: string } | null } | null;
  canUndo: boolean;
};

/** 事件动作 → 人话 */
export const MOVE_ACTION_LABELS: Record<string, string> = {
  exclude: "移回产品库",
  rescue: "从产品库拉上来",
  not_interested: "降到适配池",
  interested: "升入第二大脑",
  auto_reset: "恢复自动判定",
  favorite: "收藏",
  unfavorite: "取消收藏",
  dismiss: "发现箱不要",
};

export type ProfileCell = { dim: string; dimLabel: string; value: string; label?: string; weight: number; pos: number; neg: number };
export type Profile = { eventCount: number; strength: number; builtAt?: string; top: ProfileCell[]; avoid: ProfileCell[] };

export type Status = {
  ok: boolean;
  counts: Counts;
  seeded: unknown;
  migratedAt: string | null;
  lastRecompute: { at: string; ms: number; products: number; events: number } | null;
  profile: Profile | null;
  groupLabels: Record<string, string>;
  categoryZh: Record<string, string>;
};

export type ListResponse = { total: number; page: number; pageSize: number; rows: Product[] };

export type Facets = {
  categories: { value: string; n: number }[];
  materialGroups: { value: string; n: number }[];
  removeGroups: { value: string; n: number }[];
  tags: { value: string; n: number }[];
};

export type SortKey =
  | "finalScore" | "baseScore" | "prefScore" | "price" | "monthlySales" | "salesGrowth" | "rating" | "reviews" | "bsr"
  | "packageGrossKg" | "launchDays" | "marginEst" | "importedAt" | "titleZh" | "category";

export type Filters = {
  q: string;
  category: string[];
  materialGroup: string[];
  tags: string[];
  excludeTags: string[];
  removeGroup: string[];
  priceMin: string;
  priceMax: string;
  salesMin: string;
  salesMax: string;
  growthMin: string;
  growthMax: string;
  ratingMin: string;
  reviewsMin: string;
  reviewsMax: string;
  weightMin: string;
  weightMax: string;
  launchMin: string;
  launchMax: string;
  marginMin: string;
  dataStatus: "" | "complete" | "pending";
  sort: SortKey | "";
  dir: "asc" | "desc";
  sort2: SortKey | "";
  dir2: "asc" | "desc";
  /** 错题本按触发规则过滤 */
  ruleId: string;
  /** 适配池 / 第二大脑：只看手动钉住的 或 模型自动分的 */
  tierPin: "" | "pinned" | "auto";
};

export const SORT_LABELS: Record<SortKey, string> = {
  finalScore: "推荐分",
  baseScore: "基础分",
  prefScore: "偏好分",
  price: "价格",
  monthlySales: "月销量",
  salesGrowth: "增长率",
  rating: "评分",
  reviews: "评论数",
  bsr: "BSR",
  packageGrossKg: "包装毛重",
  launchDays: "上架天数",
  marginEst: "预估利润率",
  importedAt: "导入时间",
  titleZh: "标题",
  category: "类目",
};

export const MATERIAL_LABELS: Record<string, string> = {
  panel: "板材",
  acrylic: "亚克力",
  glass: "玻璃",
  metal: "金属",
  "solid-wood": "实木",
  upholstery: "软包布艺",
  plastic: "塑料",
  bamboo: "竹",
  rattan: "藤",
  stone: "岩板石材",
  unknown: "未识别",
};

export const GROUP_LABELS: Record<string, string> = {
  category: "类目不做",
  commodity: "普货不做",
  material: "材质不做",
  convertible: "材质可改款",
  manual: "手动清除",
};

export function emptyFilters(space: SpaceKey | "removed"): Filters {
  return {
    q: "",
    category: [],
    materialGroup: [],
    tags: [],
    excludeTags: [],
    removeGroup: [],
    priceMin: "",
    priceMax: "",
    salesMin: "",
    salesMax: "",
    growthMin: "",
    growthMax: "",
    ratingMin: "",
    reviewsMin: "",
    reviewsMax: "",
    weightMin: "",
    weightMax: "",
    launchMin: "",
    launchMax: "",
    marginMin: "",
    dataStatus: "",
    sort: space === "3" ? "finalScore" : space === "1" ? "importedAt" : "baseScore",
    dir: "desc",
    sort2: "",
    dir2: "desc",
    ruleId: "",
    tierPin: "",
  };
}

const CATEGORY_SEPARATOR = /[/:>›»|]/;

export function categorySegments(category: string) {
  return category.split(CATEGORY_SEPARATOR).map((s) => s.trim()).filter(Boolean);
}

export function categoryLeaf(category: string) {
  return categorySegments(category).at(-1) ?? category;
}

export function categoryParent(category: string) {
  const parts = categorySegments(category);
  return parts.length > 1 ? parts.at(-2) ?? "" : "";
}
