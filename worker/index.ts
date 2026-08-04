/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { emptyLearningState, mergeLearningStates, normalizeLearningState } from "../app/learning-state";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/learning-state") {
      return handleLearningState(request, env.DB);
    }

    if (url.pathname === "/api/product-overrides") {
      return handleProductOverrides(request, env.DB);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

const learningStateSchema = `CREATE TABLE IF NOT EXISTS linx_learning_state (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
)`;

const productOverrideSchema = `CREATE TABLE IF NOT EXISTS linx_product_overrides (
  asin TEXT PRIMARY KEY NOT NULL,
  location TEXT NOT NULL,
  payload TEXT,
  updated_at TEXT NOT NULL
)`;

const workspaceMetaSchema = `CREATE TABLE IF NOT EXISTS linx_workspace_meta (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)`;

async function handleLearningState(request: Request, db: D1Database) {
  await db.prepare(learningStateSchema).run();
  if (request.method === "GET") {
    const row = await db.prepare("SELECT payload, revision, updated_at FROM linx_learning_state WHERE id = ?1").bind("company").first<{ payload: string; revision: number; updated_at: string }>();
    if (new URL(request.url).searchParams.get("meta") === "1") {
      return Response.json({ revision: row?.revision ?? 0, updatedAt: row?.updated_at ?? null }, { headers: { "Cache-Control": "no-store" } });
    }
    let stored: unknown = emptyLearningState();
    if (row) try { stored = JSON.parse(row.payload); } catch { stored = emptyLearningState(); }
    const state = normalizeLearningState(stored);
    return Response.json({ state, revision: row?.revision ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  if (request.method === "PUT" || request.method === "PATCH") {
    const origin = request.headers.get("origin");
    if (origin !== urlOrigin(request.url)) return Response.json({ error: "same-origin write required" }, { status: 403 });
    const bodyText = await request.text();
    if (bodyText.length > 5_000_000) return Response.json({ error: "learning state too large" }, { status: 413 });
    let parsed: { state?: unknown; patch?: unknown };
    try { parsed = JSON.parse(bodyText) as { state?: unknown }; }
    catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
    const incoming = Object.prototype.hasOwnProperty.call(parsed, "patch") ? parsed.patch : parsed.state;
    if (!incoming || typeof incoming !== "object") return Response.json({ error: "learning state or patch required" }, { status: 400 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await db.prepare(`INSERT OR IGNORE INTO linx_learning_state (id, payload, revision, updated_at)
        VALUES (?1, ?2, 0, ?3)`)
        .bind("company", JSON.stringify(emptyLearningState()), new Date().toISOString()).run();
      const existing = await db.prepare("SELECT payload, revision FROM linx_learning_state WHERE id = ?1")
        .bind("company").first<{ payload: string; revision: number }>();
      let existingState: unknown = emptyLearningState();
      if (existing) try { existingState = JSON.parse(existing.payload); } catch { existingState = emptyLearningState(); }
      const state = mergeLearningStates(existingState, incoming);
      const updatedAt = new Date().toISOString();
      state.updatedAt = updatedAt;
      const result = await db.prepare(`UPDATE linx_learning_state
        SET payload = ?1, revision = revision + 1, updated_at = ?2
        WHERE id = ?3 AND revision = ?4`)
        .bind(JSON.stringify(state), updatedAt, "company", existing?.revision ?? 0).run();
      if (Number(result.meta?.changes ?? 0) === 1) {
        const revision = (existing?.revision ?? 0) + 1;
        return request.method === "PATCH"
          ? Response.json({ revision, updatedAt }, { headers: { "Cache-Control": "no-store" } })
          : Response.json({ state, revision }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return Response.json({ error: "concurrent update; retry" }, { status: 409 });
  }
  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PUT, PATCH" } });
}

function urlOrigin(value: string) {
  return new URL(value).origin;
}

type ProductOverrideRecord = {
  asin: string;
  location: "active" | "trash" | "deleted";
  product?: Record<string, unknown>;
  updatedAt: string;
};

async function handleProductOverrides(request: Request, db: D1Database) {
  await db.batch([
    db.prepare(productOverrideSchema),
    db.prepare(workspaceMetaSchema),
    db.prepare("INSERT OR IGNORE INTO linx_workspace_meta (id, revision, updated_at) VALUES (?1, 0, ?2)").bind("products", new Date().toISOString()),
  ]);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const meta = await db.prepare("SELECT revision, updated_at FROM linx_workspace_meta WHERE id = ?1").bind("products").first<{ revision: number; updated_at: string }>();
    if (url.searchParams.get("meta") === "1") return Response.json({ revision: meta?.revision ?? 0, updatedAt: meta?.updated_at ?? null }, { headers: { "Cache-Control": "no-store" } });
    const cursor = url.searchParams.get("cursor") ?? "";
    const rows = await db.prepare(`SELECT asin, location, payload, updated_at
      FROM linx_product_overrides WHERE asin > ?1 ORDER BY asin LIMIT 201`).bind(cursor).all<{ asin: string; location: string; payload: string | null; updated_at: string }>();
    const page = rows.results.slice(0, 200);
    const records = page.flatMap((row) => {
      if (row.location !== "active" && row.location !== "trash" && row.location !== "deleted") return [];
      let product: Record<string, unknown> | undefined;
      if (row.payload) try { product = JSON.parse(row.payload) as Record<string, unknown>; } catch { product = undefined; }
      return [{ asin: row.asin, location: row.location, ...(product ? { product } : {}), updatedAt: row.updated_at }];
    });
    return Response.json({ records, cursor: rows.results.length > 200 ? page.at(-1)?.asin ?? null : null, revision: meta?.revision ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  if (request.method === "PATCH") {
    if (request.headers.get("origin") !== url.origin) return Response.json({ error: "same-origin write required" }, { status: 403 });
    const bodyText = await request.text();
    if (bodyText.length > 1_000_000) return Response.json({ error: "product patch too large" }, { status: 413 });
    let parsed: { records?: unknown };
    try { parsed = JSON.parse(bodyText) as { records?: unknown }; }
    catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
    if (!Array.isArray(parsed.records) || !parsed.records.length || parsed.records.length > 100) return Response.json({ error: "1-100 product records required" }, { status: 400 });
    const records = parsed.records.flatMap((value): ProductOverrideRecord[] => {
      if (!value || typeof value !== "object") return [];
      const record = value as Partial<ProductOverrideRecord>;
      if (!/^[A-Z0-9]{10}$/.test(record.asin ?? "") || !record.updatedAt || !Number.isFinite(Date.parse(record.updatedAt))) return [];
      if (record.location !== "active" && record.location !== "trash" && record.location !== "deleted") return [];
      if (record.location !== "deleted" && (!record.product || typeof record.product !== "object" || record.product.asin !== record.asin)) return [];
      return [record as ProductOverrideRecord];
    });
    if (records.length !== parsed.records.length) return Response.json({ error: "invalid product record" }, { status: 400 });
    const updatedAt = new Date().toISOString();
    const statements = records.map((record) => db.prepare(`INSERT INTO linx_product_overrides (asin, location, payload, updated_at)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(asin) DO UPDATE SET location = excluded.location, payload = excluded.payload, updated_at = excluded.updated_at
      WHERE excluded.updated_at > linx_product_overrides.updated_at`)
      .bind(record.asin, record.location, record.location === "deleted" ? null : JSON.stringify(record.product), record.updatedAt));
    statements.push(db.prepare(`UPDATE linx_workspace_meta SET revision = revision + 1, updated_at = ?1 WHERE id = ?2`).bind(updatedAt, "products"));
    await db.batch(statements);
    const meta = await db.prepare("SELECT revision FROM linx_workspace_meta WHERE id = ?1").bind("products").first<{ revision: number }>();
    return Response.json({ revision: meta?.revision ?? 0, updatedAt }, { headers: { "Cache-Control": "no-store" } });
  }
  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PATCH" } });
}

export default worker;
