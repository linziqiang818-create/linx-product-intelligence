import type { Counts, DiscoverState, DiscoveryConfig, Facets, Filters, ListResponse, MoveRecord, MoveTarget, Product, Profile, Status } from "./types";

type ConnectionListener = (online: boolean) => void;
let connectionListener: ConnectionListener | null = null;

// 服务连不上时通知界面显示“服务未运行”提示；恢复后通知自动刷新
export function onConnectionChange(listener: ConnectionListener) {
  connectionListener = listener;
}

const OFFLINE_MESSAGE = "连不上 LINX 数据服务。多半是那个黑色服务窗口被关掉了——双击桌面「LINX 选品工作台」重新启动即可，本页面会自动恢复。";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    connectionListener?.(false);
    throw new Error(OFFLINE_MESSAGE);
  }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(body?.error ?? `请求失败（${response.status}）`);
  connectionListener?.(true);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function buildQuery(space: string, filters: Partial<Filters>, extra: Record<string, string | number | boolean | undefined> = {}) {
  const params = new URLSearchParams();
  params.set("space", space);
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else params.set(key, String(value));
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export const api = {
  status: () => request<Status>("/api/status"),
  facets: (space: string) => request<Facets>(`/api/facets?space=${encodeURIComponent(space)}`),
  list: (space: string, filters: Partial<Filters>, page: number, pageSize = 60) =>
    request<ListResponse>(`/api/products?${buildQuery(space, filters, { page, pageSize })}`),
  product: (asin: string) => request<Product>(`/api/products/${encodeURIComponent(asin)}`),
  updateProduct: (asin: string, fields: Partial<Product>) => request<Product>(`/api/products/${encodeURIComponent(asin)}`, json("PUT", fields)),
  deleteProducts: (asins: string[]) => request<{ ok: boolean; deleted: number; counts: Counts }>("/api/products/delete", json("POST", { asins })),
  /** 三层池移动；moves 供撤销/补记，changed 是本次移动（含重算连锁）成员变化的产品，需要重新拉取 */
  move: (asins: string[], to: MoveTarget, reason = "") =>
    request<{ ok: boolean; counts: Counts; products: Product[]; moves: { asin: string; eventId: number }[]; changed: string[] }>("/api/products/move", json("POST", { asins, to, reason })),
  undoMoves: (moves: { asin: string; eventId: number }[]) =>
    request<{ ok: boolean; undone: number; counts: Counts; products: Product[]; changed: string[] }>("/api/products/move/undo", json("POST", { moves })),
  /** 按 asin 批量取产品最新状态（移动后刷新被连锁影响的产品） */
  productsByAsins: (asins: string[]) =>
    request<ListResponse>(`/api/products?space=1&pageSize=${Math.min(500, asins.length)}&asins=${encodeURIComponent(asins.join(","))}`),
  setMoveReason: (asin: string, eventId: number, reason: string) =>
    request<{ ok: boolean; product: Product }>("/api/products/move/reason", json("POST", { asin, eventId, reason })),
  moves: (limit = 200) => request<{ rows: MoveRecord[] }>(`/api/moves?limit=${limit}`),
  favorite: (asins: string[], on: boolean) =>
    request<{ ok: boolean; counts: Counts; products: Product[] }>("/api/favorites", json("POST", { asins, on })),
  /** 「感兴趣」标记：只是偏好信号，不改变产品所在层 */
  feedback: (asin: string, action: "interested" | "clear") =>
    request<{ ok: boolean; counts: Counts; product: Product }>("/api/feedback", json("POST", { asin, action })),
  importFile: async (file: File, mode: "merge" | "replace") => {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    return request<{ ok: boolean; mode: string; kind: string; rows: number; inserted: number; updated: number; images: number; counts: Counts }>("/api/import", { method: "POST", body: form });
  },
  exportUrl: (space: string, filters: Partial<Filters>, format: "xlsx" | "csv", asins?: string[]) =>
    `/api/export?${buildQuery(space, filters, { format, asins: asins?.join(",") })}`,
  rules: () => request<{ rules: Rules; defaults: Rules; stats: RuleStat[]; groupLabels: Record<string, string> }>("/api/rules"),
  saveRules: (rules: Rules) => request<{ ok: boolean; rules: Rules; counts: Counts; stats: RuleStat[] }>("/api/rules", json("PUT", { rules })),
  resetRules: () => request<{ ok: boolean; rules: Rules; counts: Counts }>("/api/rules/reset", json("POST", {})),
  testRules: (input: { title: string; category: string; material: string; rules?: Rules }) => request<RuleTestResult>("/api/rules/test", json("POST", input)),
  preference: () => request<{ profile: Profile | null; counts: Counts }>("/api/preference"),
  resetPreference: (scope: "all" | "keep-calibration") => request<{ ok: boolean; profile: Profile | null; counts: Counts }>("/api/preference/reset", json("POST", { scope })),
  restore: (data: unknown, mode: "replace" | "merge") => request<{ ok: boolean; counts: Counts; inserted?: number; updated?: number }>("/api/restore", json("POST", { ...(data as object), mode })),
  migrate: (payload: unknown) => request<{ ok: boolean; counts: Counts; inserted: number; updated: number; favoritesAdded: number; calibrationEvents: number }>("/api/migrate/localstorage", json("POST", payload)),
  recompute: () => request<{ ok: boolean; counts: Counts }>("/api/recompute", json("POST", {})),
  /** 发现箱：自动采集候选 */
  discover: () => request<DiscoverState>("/api/discover"),
  saveDiscoverConfig: (config: DiscoveryConfig) => request<{ ok: boolean; config: DiscoveryConfig }>("/api/discover/config", json("PUT", config)),
  runDiscovery: () => request<{ ok: boolean; report: DiscoverState["lastRun"]; counts: Counts }>("/api/discover/run", json("POST", {})),
  promoteDiscoveries: (asins: string[]) =>
    request<{ ok: boolean; promoted: number; counts: Counts; products: Product[] }>("/api/discover/promote", json("POST", { asins })),
  dismissDiscoveries: (asins: string[]) => request<{ ok: boolean; dismissed: number; counts: Counts }>("/api/discover/dismiss", json("POST", { asins })),
};

export type RulePattern = { id: string; label: string; enabled: boolean; pattern: string };
export type Rules = {
  version: number;
  categoryBans: RulePattern[];
  seating: {
    enabled: boolean;
    seatPattern: string;
    benchPattern: string;
    setPattern: string;
    inclusionPattern: string;
    negationPattern: string;
    seatCategoryPattern: string;
    safeCategoryPattern: string;
  };
  commodity: {
    differentiationPattern: string;
    categories: RulePattern[];
    standardizedMetal: { enabled: boolean; pattern: string; bedPattern: string };
  };
  material: {
    panelPattern: string;
    woodPattern: string;
    glass: { enabled: boolean; pattern: string; negationPattern: string; suggestion: string };
    solidWood: { enabled: boolean; pattern: string; suggestion: string };
    upholstery: {
      enabled: boolean;
      pattern: string;
      softFurniturePattern: string;
      cushionException: { enabled: boolean; cushionPattern: string; categoryPattern: string };
    };
    metalBody: { enabled: boolean; pattern: string; suggestion: string };
    plasticGamingChair: { enabled: boolean; chairPattern: string; plasticPattern: string };
  };
  flags: {
    unconventionalMaterial: { enabled: boolean; pattern: string; label: string; scorePenalty: number };
    fireplaceSlot: { enabled: boolean; pattern: string; suggestion: string };
    freightWarnKg: number;
  };
};
export type RuleStat = { ruleId: string; reason: string; removed: number; rescued: number };
export type RuleTestResult = {
  placement: "pass" | "removed";
  removeGroup: string;
  removeReason: string;
  convertible: string;
  tags: string[];
  materialGroup: string;
  differentiated: boolean;
  hasPanel: boolean;
};
