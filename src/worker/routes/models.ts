import { newApp, requireUser } from "../app";
import { estimateAnalysis, estimateGeneration, findModel, getCatalog } from "../lib/catalog";
import { HttpError } from "../lib/util";
import { formatResearch, selectResearch, type ResearchConfig } from "../lib/notion";
import type { Kind } from "../../shared/types";

const models = newApp();
models.use("*", requireUser);

models.get("/", async (c) => {
  const kind = c.req.query("kind");
  const list = await getCatalog(c.env);
  return c.json({ models: kind ? list.filter((m) => m.kind === kind) : list });
});

models.post("/estimate", async (c) => {
  const body = (await c.req.json()) as { kind: Kind; model: string; prompt?: string; params?: Record<string, unknown>; reference_keys?: string[]; count?: number };
  const m = await findModel(c.env, body.model, body.kind);
  if (!m) throw new HttpError(404, "Unknown model");
  const rcfg = body.params?.research as ResearchConfig | undefined;
  const items = body.kind === "text" && rcfg?.mode && rcfg.mode !== "off" ? await selectResearch(c.env, body.prompt ?? "", rcfg) : [];
  const est = estimateGeneration(c.env, m, { kind: body.kind, prompt: body.prompt ?? "", params: body.params, reference_keys: body.reference_keys, count: body.count, extraChars: items.length ? formatResearch(items).length : 0 });
  return c.json({ ...est, research: items.map((i) => ({ id: i.page_id, hook: i.hook, url: i.url, type: i.type, platform: i.platform, views: i.views })) });
});

models.post("/estimate-analysis", async (c) => {
  const body = (await c.req.json()) as { model?: string; note?: string; duration?: number; count?: number };
  const m = (await findModel(c.env, body.model ?? "google/gemini-2.5-flash", "analyze")) ?? (await getCatalog(c.env)).find((x) => x.kind === "analyze");
  if (!m) throw new HttpError(404, "No analysis model available");
  const one = estimateAnalysis(c.env, m, body.duration ?? null, body.note ?? "");
  const n = Math.max(1, body.count ?? 1);
  return c.json({ ...one, credits: one.credits * n, usd: one.usd * n });
});

export default models;
