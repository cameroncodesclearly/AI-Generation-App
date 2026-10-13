import { newApp, requireUser } from "../app";
import { findModel } from "../lib/catalog";
import { fillTemplate, HttpError, id, safeJson } from "../lib/util";
import { createGeneration } from "./generate";
import type { Preset, PresetVariable } from "../../shared/types";

const presets = newApp();
presets.use("*", requireUser);

function validateVariables(v: unknown): PresetVariable[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).map((x) => {
    const o = (x ?? {}) as Partial<PresetVariable>;
    const key = String(o.key ?? "").replace(/[^\w-]/g, "").slice(0, 40);
    if (!key) throw new HttpError(400, "Each variable needs a key");
    return {
      key, label: String(o.label ?? key).slice(0, 80),
      type: (["text", "textarea", "select", "number"] as const).includes(o.type as never) ? (o.type as PresetVariable["type"]) : "text",
      default: o.default !== undefined ? String(o.default).slice(0, 2000) : undefined,
      options: Array.isArray(o.options) ? o.options.map(String).slice(0, 50) : undefined,
      required: !!o.required, help: o.help ? String(o.help).slice(0, 200) : undefined,
    };
  });
}

async function loadPreset(c: { env: { DB: D1Database } }, pid: string): Promise<Preset> {
  const p = await c.env.DB.prepare("SELECT * FROM presets WHERE id = ?1").bind(pid).first<Preset>();
  if (!p) throw new HttpError(404, "Preset not found");
  return p;
}

presets.get("/", async (c) => {
  const u = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT p.*, u.name AS author_name, u.email AS author_email FROM presets p LEFT JOIN users u ON u.id = p.created_by WHERE p.visibility = 'team' OR p.created_by = ?1 ORDER BY p.runs DESC, p.updated_at DESC",
  ).bind(u.id).all();
  return c.json({ presets: rows.results });
});

presets.post("/", async (c) => {
  const u = c.get("user");
  const b = (await c.req.json()) as Partial<Preset> & { variables?: PresetVariable[]; params?: Record<string, unknown>; reference_keys?: string[] };
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) throw new HttpError(400, "Name is required");
  if (!["image", "video", "text"].includes(String(b.kind))) throw new HttpError(400, "Invalid kind");
  const model = await findModel(c.env, String(b.model), b.kind as Preset["kind"]);
  if (!model) throw new HttpError(400, "Unknown model");
  const template = String(b.template ?? "").trim();
  if (!template) throw new HttpError(400, "Prompt template is required");
  const pid = id("pre");
  await c.env.DB.prepare(
    "INSERT INTO presets (id, name, description, kind, model, template, negative, variables_json, params_json, reference_keys_json, cover_key, category, visibility, created_by) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
  ).bind(pid, name, (b.description ?? "").toString().slice(0, 400) || null, b.kind, model.id, template, b.negative ? String(b.negative).slice(0, 1000) : null,
    JSON.stringify(validateVariables(b.variables ?? safeJson(b.variables_json, []))), JSON.stringify(b.params ?? safeJson(b.params_json, {})),
    JSON.stringify((b.reference_keys ?? []).filter((k) => typeof k === "string").slice(0, 6)), b.cover_key ?? null,
    String(b.category ?? "General").slice(0, 40), b.visibility === "private" ? "private" : "team", u.id).run();
  return c.json({ preset: await loadPreset(c, pid) }, 201);
});

presets.get("/:id", async (c) => {
  const p = await loadPreset(c, c.req.param("id"));
  const u = c.get("user");
  if (p.visibility === "private" && p.created_by !== u.id && u.role !== "admin") throw new HttpError(403, "Private preset");
  return c.json({ preset: p });
});

presets.put("/:id", async (c) => {
  const u = c.get("user");
  const p = await loadPreset(c, c.req.param("id"));
  if (p.created_by !== u.id && u.role !== "admin") throw new HttpError(403, "Only the author or an admin can edit this preset");
  const b = (await c.req.json()) as Partial<Preset> & { variables?: PresetVariable[]; params?: Record<string, unknown>; reference_keys?: string[] };
  const kind = (b.kind ?? p.kind) as Preset["kind"];
  const model = await findModel(c.env, String(b.model ?? p.model), kind);
  if (!model) throw new HttpError(400, "Unknown model");
  await c.env.DB.prepare(
    "UPDATE presets SET name=?2, description=?3, kind=?4, model=?5, template=?6, negative=?7, variables_json=?8, params_json=?9, reference_keys_json=?10, cover_key=?11, category=?12, visibility=?13, updated_at=datetime('now') WHERE id=?1",
  ).bind(p.id, String(b.name ?? p.name).trim().slice(0, 80), b.description !== undefined ? String(b.description).slice(0, 400) || null : p.description, kind, model.id,
    String(b.template ?? p.template).trim(), b.negative !== undefined ? (b.negative ? String(b.negative).slice(0, 1000) : null) : p.negative,
    b.variables ? JSON.stringify(validateVariables(b.variables)) : p.variables_json, b.params ? JSON.stringify(b.params) : p.params_json,
    b.reference_keys ? JSON.stringify(b.reference_keys.slice(0, 6)) : p.reference_keys_json, b.cover_key !== undefined ? b.cover_key : p.cover_key,
    String(b.category ?? p.category).slice(0, 40), b.visibility ? (b.visibility === "private" ? "private" : "team") : p.visibility).run();
  return c.json({ preset: await loadPreset(c, p.id) });
});

presets.delete("/:id", async (c) => {
  const u = c.get("user");
  const p = await loadPreset(c, c.req.param("id"));
  if (p.created_by !== u.id && u.role !== "admin") throw new HttpError(403, "Only the author or an admin can delete this preset");
  await c.env.DB.prepare("DELETE FROM presets WHERE id = ?1").bind(p.id).run();
  return c.json({ ok: true });
});

/** Render the final prompt for a preset + variables (used for live preview and for running). */
export function renderPreset(p: Preset, vars: Record<string, string>): { prompt: string; params: Record<string, unknown>; missing: string[] } {
  const defs = safeJson<PresetVariable[]>(p.variables_json, []);
  const merged: Record<string, string> = {};
  const missing: string[] = [];
  for (const d of defs) {
    const v = vars[d.key] ?? d.default ?? "";
    if (d.required && !String(v).trim()) missing.push(d.key);
    merged[d.key] = String(v);
  }
  return { prompt: fillTemplate(p.template, merged), params: safeJson<Record<string, unknown>>(p.params_json, {}), missing };
}

presets.post("/:id/preview", async (c) => {
  const p = await loadPreset(c, c.req.param("id"));
  const { variables } = (await c.req.json()) as { variables?: Record<string, string> };
  return c.json(renderPreset(p, variables ?? {}));
});

presets.post("/:id/run", async (c) => {
  const u = c.get("user");
  const p = await loadPreset(c, c.req.param("id"));
  if (p.visibility === "private" && p.created_by !== u.id && u.role !== "admin") throw new HttpError(403, "Private preset");
  const b = (await c.req.json()) as { variables?: Record<string, string>; overrides?: Record<string, unknown>; reference_keys?: string[]; count?: number; model?: string };
  const r = renderPreset(p, b.variables ?? {});
  if (r.missing.length) throw new HttpError(400, `Missing required fields: ${r.missing.join(", ")}`);
  const refs = [...safeJson<string[]>(p.reference_keys_json, []), ...(b.reference_keys ?? [])];
  const g = await createGeneration(c.env, u, { kind: p.kind, model: b.model ?? p.model, prompt: r.prompt, negative: p.negative ?? undefined, params: { ...r.params, ...(b.overrides ?? {}) }, reference_keys: refs, preset_id: p.id, count: b.count });
  return c.json({ generation: g, prompt: r.prompt }, 201);
});

/** Generate cover art for a preset using the team's image model; charges the requesting user. */
presets.post("/:id/cover", async (c) => {
  const u = c.get("user");
  const p = await loadPreset(c, c.req.param("id"));
  if (p.created_by !== u.id && u.role !== "admin") throw new HttpError(403, "Only the author or an admin can regenerate the cover");
  const b = (await c.req.json().catch(() => ({}))) as { model?: string; prompt?: string };
  const prompt = b.prompt?.trim() || `Cinematic poster-style key art that represents this creative preset: "${p.name}". ${p.description ?? ""}\nStyle: glassmorphic minimal, soft sky gradient from deep blue to warm gold, glowing light rays, classic cinema title-card feeling, no text, no watermark, square composition.`;
  const g = await createGeneration(c.env, u, { kind: "image", model: b.model ?? "google/gemini-2.5-flash-image", prompt, params: { aspect_ratio: "1:1", cover_for: p.id }, count: 1 });
  return c.json({ generation: g }, 201);
});

export default presets;
