import { newApp, requireUser } from "../app";
import { estimateAnalysis, findModel, getCatalog } from "../lib/catalog";
import { reserve } from "../lib/credits";
import { analysisCsvRows, parseCsv, toCsv } from "../lib/analyze";
import { HttpError, id } from "../lib/util";
import type { Env } from "../env";
import type { Analysis, Batch, User } from "../../shared/types";

const analyze = newApp();
analyze.use("*", requireUser);

async function pickModel(env: Env, modelId?: string) {
  const m = modelId ? await findModel(env, modelId, "analyze") : null;
  if (m && m.enabled) return m;
  const list = await getCatalog(env);
  const d = list.find((x) => x.kind === "analyze");
  if (!d) throw new HttpError(503, "No analysis model is enabled");
  return d;
}

async function createAnalysis(env: Env, user: User, input: { source_url?: string; file_key?: string; filename?: string; note?: string; model?: string; batch_id?: string | null; duration?: number | null }): Promise<Analysis> {
  const url = (input.source_url ?? "").trim();
  const key = (input.file_key ?? "").trim();
  if (!url && !key) throw new HttpError(400, "Provide a video link or upload a file");
  if (url && !/^https?:\/\//i.test(url)) throw new HttpError(400, `Not a valid URL: ${url.slice(0, 60)}`);
  if (key && !key.startsWith(`uploads/${user.id}/`) && user.role !== "admin") throw new HttpError(403, "That upload isn't yours");
  const model = await pickModel(env, input.model);
  const est = estimateAnalysis(env, model, input.duration ?? null, input.note ?? "");
  const aid = id("ana");
  await reserve(env, user.id, est.credits, "analysis", aid);
  await env.DB.prepare(
    "INSERT INTO analyses (id, user_id, batch_id, source_url, file_key, filename, note, model, estimate_credits) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
  ).bind(aid, user.id, input.batch_id ?? null, url || null, key || null, input.filename ?? null, (input.note ?? "").slice(0, 2000) || null, model.id, est.credits).run();
  await env.JOBS.send({ type: "analysis", id: aid });
  return (await env.DB.prepare("SELECT * FROM analyses WHERE id = ?1").bind(aid).first<Analysis>())!;
}

analyze.post("/", async (c) => {
  const b = (await c.req.json()) as { source_url?: string; file_key?: string; filename?: string; note?: string; model?: string; duration?: number };
  const a = await createAnalysis(c.env, c.get("user"), b);
  return c.json({ analysis: a }, 201);
});

/** Batch: JSON rows [{url, note}] or multipart CSV with columns url (or link/video), note. */
analyze.post("/batch", async (c) => {
  const u = c.get("user");
  let rows: { url: string; note: string }[] = [];
  let name = "Batch";
  let model: string | undefined;
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "CSV file is required");
    name = String(form.get("name") ?? file.name.replace(/\.csv$/i, "")) || "Batch";
    model = form.get("model") ? String(form.get("model")) : undefined;
    const parsed = parseCsv(await file.text());
    if (parsed.length < 1) throw new HttpError(400, "CSV is empty");
    const header = parsed[0].map((h) => h.trim().toLowerCase());
    const urlIdx = header.findIndex((h) => ["url", "link", "video", "video_url", "source"].includes(h));
    const noteIdx = header.findIndex((h) => ["note", "notes", "focus", "question"].includes(h));
    const hasHeader = urlIdx >= 0;
    const body = hasHeader ? parsed.slice(1) : parsed;
    rows = body.map((r) => ({ url: (r[hasHeader ? urlIdx : 0] ?? "").trim(), note: (noteIdx >= 0 ? r[noteIdx] : r[1]) ?? "" })).filter((r) => r.url);
  } else {
    const b = (await c.req.json()) as { name?: string; model?: string; rows?: { url: string; note?: string }[] };
    name = b.name ?? name; model = b.model;
    rows = (b.rows ?? []).map((r) => ({ url: String(r.url ?? "").trim(), note: String(r.note ?? "") })).filter((r) => r.url);
  }
  if (!rows.length) throw new HttpError(400, "No rows with a URL found. Expected columns: url, note");
  if (rows.length > 200) throw new HttpError(400, "Max 200 videos per batch");
  const bid = id("bat");
  await c.env.DB.prepare("INSERT INTO batches (id, user_id, name, total) VALUES (?1, ?2, ?3, ?4)").bind(bid, u.id, name.slice(0, 80), rows.length).run();
  const created: Analysis[] = []; const errors: string[] = [];
  for (const r of rows) {
    try { created.push(await createAnalysis(c.env, u, { source_url: r.url, note: r.note, model, batch_id: bid })); }
    catch (e) { errors.push(`${r.url}: ${e instanceof Error ? e.message : e}`); if (e instanceof HttpError && e.status === 402) break; }
  }
  await c.env.DB.prepare("UPDATE batches SET total = ?2 WHERE id = ?1").bind(bid, created.length).run();
  return c.json({ batch_id: bid, created: created.length, errors }, 201);
});

analyze.get("/", async (c) => {
  const u = c.get("user");
  const batch = c.req.query("batch_id");
  const limit = Math.min(300, parseInt(c.req.query("limit") ?? "50", 10) || 50);
  const rows = batch
    ? await c.env.DB.prepare("SELECT * FROM analyses WHERE batch_id = ?1 AND (user_id = ?2 OR ?3 = 'admin') ORDER BY created_at ASC LIMIT ?4").bind(batch, u.id, u.role, limit).all<Analysis>()
    : await c.env.DB.prepare("SELECT * FROM analyses WHERE user_id = ?1 AND batch_id IS NULL ORDER BY created_at DESC LIMIT ?2").bind(u.id, limit).all<Analysis>();
  return c.json({ analyses: rows.results });
});

analyze.get("/batches", async (c) => {
  const u = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT b.*, (SELECT COUNT(*) FROM analyses a WHERE a.batch_id = b.id AND a.status = 'done') AS done, (SELECT COUNT(*) FROM analyses a WHERE a.batch_id = b.id AND a.status = 'failed') AS failed FROM batches b WHERE b.user_id = ?1 ORDER BY b.created_at DESC LIMIT 50",
  ).bind(u.id).all<Batch>();
  return c.json({ batches: rows.results });
});

analyze.get("/batches/:id/export.csv", async (c) => {
  const u = c.get("user");
  const b = await c.env.DB.prepare("SELECT * FROM batches WHERE id = ?1").bind(c.req.param("id")).first<Batch>();
  if (!b || (b.user_id !== u.id && u.role !== "admin")) throw new HttpError(404, "Batch not found");
  const rows = await c.env.DB.prepare("SELECT * FROM analyses WHERE batch_id = ?1 ORDER BY created_at ASC").bind(b.id).all<Analysis>();
  const csv = toCsv(analysisCsvRows(rows.results));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${(b.name ?? "batch").replace(/[^\w.-]+/g, "_")}-results.csv"` } });
});

analyze.get("/:id", async (c) => {
  const u = c.get("user");
  const a = await c.env.DB.prepare("SELECT * FROM analyses WHERE id = ?1").bind(c.req.param("id")).first<Analysis>();
  if (!a || (a.user_id !== u.id && u.role !== "admin")) throw new HttpError(404, "Not found");
  return c.json({ analysis: a });
});

analyze.post("/:id/retry", async (c) => {
  const u = c.get("user");
  const a = await c.env.DB.prepare("SELECT * FROM analyses WHERE id = ?1").bind(c.req.param("id")).first<Analysis>();
  if (!a || (a.user_id !== u.id && u.role !== "admin")) throw new HttpError(404, "Not found");
  if (a.status !== "failed") throw new HttpError(400, "Only failed analyses can be retried");
  const model = await pickModel(c.env, a.model);
  const est = estimateAnalysis(c.env, model, null, a.note ?? "");
  await reserve(c.env, a.user_id, est.credits, "analysis", a.id);
  await c.env.DB.prepare("UPDATE analyses SET status = 'queued', error = NULL, estimate_credits = ?2, actual_credits = NULL, completed_at = NULL WHERE id = ?1").bind(a.id, est.credits).run();
  await c.env.JOBS.send({ type: "analysis", id: a.id });
  return c.json({ ok: true });
});

analyze.delete("/:id", async (c) => {
  const u = c.get("user");
  const a = await c.env.DB.prepare("SELECT * FROM analyses WHERE id = ?1").bind(c.req.param("id")).first<Analysis>();
  if (!a || (a.user_id !== u.id && u.role !== "admin")) throw new HttpError(404, "Not found");
  await c.env.DB.prepare("DELETE FROM analyses WHERE id = ?1").bind(a.id).run();
  return c.json({ ok: true });
});

export default analyze;
