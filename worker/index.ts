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

export default worker;
