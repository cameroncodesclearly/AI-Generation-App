import { newApp, requireUser } from "../app";
import { estimateGeneration, findModel } from "../lib/catalog";
import { formatResearch, selectResearch, type ResearchConfig } from "../lib/notion";
import { reserve } from "../lib/credits";
import { extFor, HttpError, id } from "../lib/util";
import type { Env } from "../env";
import type { Generation, GenerateRequest, User } from "../../shared/types";

export async function createGeneration(env: Env, user: User, req: GenerateRequest): Promise<Generation> {
  if (!["image", "video", "text"].includes(req.kind)) throw new HttpError(400, "Invalid kind");
  const prompt = (req.prompt ?? "").trim();
  if (!prompt) throw new HttpError(400, "Prompt is required");
  if (prompt.length > 20000) throw new HttpError(400, "Prompt is too long");
  const model = await findModel(env, req.model, req.kind);
  if (!model || !model.enabled) throw new HttpError(400, "That model is not enabled");
  const refs = (req.reference_keys ?? []).filter((k) => typeof k === "string" && k.startsWith("uploads/")).slice(0, 6);
  const count = Math.max(1, Math.min(req.kind === "video" ? 2 : 4, Number(req.count ?? 1)));
  const params: Record<string, unknown> = { ...(req.params ?? {}), count, ...(req.negative ? { negative: req.negative } : {}) };
  let extraChars = 0;
  const rcfg = params.research as ResearchConfig | undefined;
  if (req.kind === "text" && rcfg && rcfg.mode && rcfg.mode !== "off") {
    const items = await selectResearch(env, prompt, rcfg);
    extraChars = formatResearch(items).length;
    // Freeze the exact entries so the run (and any rerun) uses what the estimate priced.
    params.research = { ...rcfg, mode: "pick", ids: items.map((i) => i.page_id), origin: rcfg.mode };
    params.research_used = items.map((i) => ({ id: i.page_id, hook: i.hook, url: i.url, type: i.type, platform: i.platform, views: i.views }));
  } else delete params.research;
  const est = estimateGeneration(env, model, { kind: req.kind, prompt, params, reference_keys: refs, count, extraChars });
  const gid = id("gen");
  await reserve(env, user.id, est.credits, "generation", gid);
  await env.DB.prepare(
    "INSERT INTO generations (id, user_id, kind, model, prompt, params_json, input_keys_json, preset_id, estimate_credits) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
  ).bind(gid, user.id, req.kind, model.id, prompt, JSON.stringify(params), JSON.stringify(refs), req.preset_id ?? null, est.credits).run();
  if (req.preset_id) await env.DB.prepare("UPDATE presets SET runs = runs + 1 WHERE id = ?1").bind(req.preset_id).run();
  await env.JOBS.send({ type: "generation", id: gid });
  return (await env.DB.prepare("SELECT * FROM generations WHERE id = ?1").bind(gid).first<Generation>())!;
}

const gen = newApp();
gen.use("*", requireUser);

gen.post("/generate", async (c) => {
  const body = (await c.req.json()) as GenerateRequest;
  const g = await createGeneration(c.env, c.get("user"), body);
  return c.json({ generation: g }, 201);
});

gen.get("/generations", async (c) => {
  const u = c.get("user");
  const limit = Math.min(100, parseInt(c.req.query("limit") ?? "40", 10) || 40);
  const kind = c.req.query("kind");
  const scope = c.req.query("scope") ?? "mine"; // mine | team
  const where: string[] = []; const binds: unknown[] = [];
  if (scope !== "team") { where.push(`user_id = ?${binds.length + 1}`); binds.push(u.id); }
  if (kind) { where.push(`kind = ?${binds.length + 1}`); binds.push(kind); }
  const preset = c.req.query("preset_id");
  if (preset) { where.push(`preset_id = ?${binds.length + 1}`); binds.push(preset); }
  const status = c.req.query("status");
  if (status) { where.push(`status = ?${binds.length + 1}`); binds.push(status); }
  if (c.req.query("favorite") === "1") where.push("favorite = 1");
  const q = (c.req.query("q") ?? "").trim();
  if (q) { where.push(`prompt LIKE ?${binds.length + 1}`); binds.push(`%${q.replace(/[%_]/g, "")}%`); }
  const ids = c.req.query("ids");
  if (ids) { const list = ids.split(",").slice(0, 50); where.push(`id IN (${list.map((_, i) => `?${binds.length + i + 1}`).join(",")})`); binds.push(...list); }
  const sql = `SELECT g.*, u.email AS user_email, u.name AS user_name FROM generations g JOIN users u ON u.id = g.user_id ${where.length ? "WHERE " + where.map((w) => w.replace(/\b(user_id|kind|id|preset_id|status|favorite|prompt)\b/, "g.$1")).join(" AND ") : ""} ORDER BY g.created_at DESC LIMIT ${limit}`;
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ generations: rows.results });
});

gen.get("/generations/:id", async (c) => {
  const g = await c.env.DB.prepare("SELECT * FROM generations WHERE id = ?1").bind(c.req.param("id")).first<Generation>();
  if (!g) throw new HttpError(404, "Not found");
  return c.json({ generation: g });
});

gen.post("/generations/:id/favorite", async (c) => {
  const u = c.get("user");
  const g = await c.env.DB.prepare("SELECT id, user_id, favorite FROM generations WHERE id = ?1").bind(c.req.param("id")).first<{ id: string; user_id: string; favorite: number }>();
  if (!g || (g.user_id !== u.id && u.role !== "admin")) throw new HttpError(404, "Not found");
  await c.env.DB.prepare("UPDATE generations SET favorite = ?2 WHERE id = ?1").bind(g.id, g.favorite ? 0 : 1).run();
  return c.json({ favorite: !g.favorite });
});

gen.post("/generations/:id/rerun", async (c) => {
  const u = c.get("user");
  const g = await c.env.DB.prepare("SELECT * FROM generations WHERE id = ?1").bind(c.req.param("id")).first<Generation>();
  if (!g) throw new HttpError(404, "Not found");
  const params = JSON.parse(g.params_json || "{}") as Record<string, unknown>;
  const { count, negative, ...rest } = params;
  const refs = (JSON.parse(g.input_keys_json || "[]") as string[]).filter((k) => k.startsWith(`uploads/${u.id}/`) || u.role === "admin" || g.user_id === u.id);
  const copy = await createGeneration(c.env, u, { kind: g.kind, model: g.model, prompt: g.prompt, negative: typeof negative === "string" ? negative : undefined, params: rest, reference_keys: refs, preset_id: g.preset_id ?? undefined, count: typeof count === "number" ? count : 1 });
  return c.json({ generation: copy }, 201);
});

gen.delete("/generations/:id", async (c) => {
  const u = c.get("user");
  const g = await c.env.DB.prepare("SELECT * FROM generations WHERE id = ?1").bind(c.req.param("id")).first<Generation>();
  if (!g) throw new HttpError(404, "Not found");
  if (g.user_id !== u.id && u.role !== "admin") throw new HttpError(403, "Not yours");
  await c.env.DB.prepare("DELETE FROM generations WHERE id = ?1").bind(g.id).run();
  return c.json({ ok: true });
});

gen.post("/upload", async (c) => {
  const u = c.get("user");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "file is required");
  const kindHint = String(form.get("kind") ?? "image");
  const mime = file.type || "application/octet-stream";
  if (kindHint === "image" && !mime.startsWith("image/")) throw new HttpError(400, "Only images can be used as references");
  if (kindHint === "video" && !mime.startsWith("video/")) throw new HttpError(400, "Upload a video file (mp4, mov, webm)");
  const max = kindHint === "video" ? 500 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > max) throw new HttpError(413, `File is too large (max ${Math.round(max / 1024 / 1024)}MB)`);
  const key = `uploads/${u.id}/${id("up")}.${extFor(mime) === "bin" ? (file.name.split(".").pop() || "bin") : extFor(mime)}`;
  await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: mime }, customMetadata: { filename: file.name, user: u.id } });
  return c.json({ key, url: `/files/${key}`, filename: file.name, size: file.size, mime });
});

export default gen;
