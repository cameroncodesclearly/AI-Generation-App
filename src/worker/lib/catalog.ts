import type { Env } from "../env";
import type { Estimate, Kind, ModelInfo } from "../../shared/types";
import { listModels, listVideoModels, type ORModel } from "./openrouter";
import { safeJson } from "./util";

/**
 * Curated models give friendly names, sensible defaults and fallback pricing.
 * The live OpenRouter catalog (cached in D1 settings for 1h) is merged on top so
 * per-token pricing is always current. Admin overrides in model_settings win.
 */
const CURATED: Omit<ModelInfo, "enabled" | "source">[] = [
  // ---- Image ----
  { id: "google/gemini-2.5-flash-image", name: "Nano Banana", kind: "image", featured: true, description: "Fast, excellent at editing and multi-reference consistency.", input_modalities: ["text", "image"], output_modalities: ["image", "text"], pricing: { per_image: 0.039 }, options: { aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"], supports_reference: true } },
  { id: "google/gemini-3-pro-image-preview", name: "Nano Banana Pro", kind: "image", featured: true, description: "Highest fidelity Gemini image model, great typography and 4K.", input_modalities: ["text", "image"], output_modalities: ["image", "text"], pricing: { per_image: 0.134 }, options: { aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"], resolutions: ["1K", "2K", "4K"], supports_reference: true } },
  { id: "openai/gpt-5-image", name: "GPT Image", kind: "image", description: "OpenAI image model with strong prompt adherence.", input_modalities: ["text", "image"], output_modalities: ["image"], pricing: { per_image: 0.08 }, options: { aspect_ratios: ["1:1", "16:9", "9:16"], supports_reference: true } },
  { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", kind: "image", description: "Photoreal, cinematic lighting.", input_modalities: ["text", "image"], output_modalities: ["image"], pricing: { per_image: 0.05 }, options: { aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"], supports_reference: true } },
  // ---- Video (async /videos API) ----
  { id: "google/veo-3.1", name: "Veo 3.1", kind: "video", featured: true, description: "Cinematic, native audio, 4/6/8s.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.4 }, options: { aspect_ratios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 6, 8], supports_reference: true, supports_audio: true } },
  { id: "google/veo-3.1-fast", name: "Veo 3.1 Fast", kind: "video", description: "Faster, cheaper Veo.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.15 }, options: { aspect_ratios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 6, 8], supports_reference: true, supports_audio: true } },
  { id: "openai/sora-2", name: "Sora 2", kind: "video", featured: true, description: "Strong physics and motion.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.1 }, options: { aspect_ratios: ["16:9", "9:16"], resolutions: ["720p"], durations: [4, 8, 12], supports_reference: true, supports_audio: true } },
  { id: "openai/sora-2-pro", name: "Sora 2 Pro", kind: "video", description: "Highest quality Sora.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.3 }, options: { aspect_ratios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], durations: [4, 8, 12], supports_reference: true, supports_audio: true } },
  { id: "bytedance/seedance-2.0", name: "Seedance 2.0", kind: "video", featured: true, description: "Great value, strong character consistency.", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.08 }, options: { aspect_ratios: ["16:9", "9:16", "1:1"], resolutions: ["480p", "720p", "1080p"], durations: [5, 10], supports_reference: true, supports_audio: true } },
  { id: "bytedance/seedance-1.5-pro", name: "Seedance 1.5 Pro", kind: "video", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.06 }, options: { aspect_ratios: ["16:9", "9:16", "1:1"], resolutions: ["480p", "720p", "1080p"], durations: [5, 10], supports_reference: true } },
  { id: "alibaba/wan-2.7", name: "Wan 2.7", kind: "video", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.08 }, options: { aspect_ratios: ["16:9", "9:16", "1:1"], resolutions: ["720p", "1080p"], durations: [5, 10], supports_reference: true } },
  { id: "kwaivgi/kling-v3.0-pro", name: "Kling 3.0 Pro", kind: "video", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.1 }, options: { aspect_ratios: ["16:9", "9:16", "1:1"], resolutions: ["720p", "1080p"], durations: [5, 10], supports_reference: true } },
  { id: "x-ai/grok-imagine-video", name: "Grok Imagine Video", kind: "video", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: 0.05 }, options: { aspect_ratios: ["16:9", "9:16", "1:1"], resolutions: ["480p", "720p"], durations: [5, 10, 15], supports_reference: true } },
  // ---- Text ----
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", kind: "text", featured: true, input_modalities: ["text", "image"], output_modalities: ["text"], pricing: { prompt: 3e-6, completion: 15e-6 } },
  { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1", kind: "text", input_modalities: ["text", "image"], output_modalities: ["text"], pricing: { prompt: 15e-6, completion: 75e-6 } },
  { id: "openai/gpt-5", name: "GPT-5", kind: "text", featured: true, input_modalities: ["text", "image"], output_modalities: ["text"], pricing: { prompt: 1.25e-6, completion: 10e-6 } },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", kind: "text", input_modalities: ["text", "image", "video", "audio"], output_modalities: ["text"], pricing: { prompt: 1.25e-6, completion: 10e-6 } },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", kind: "text", featured: true, input_modalities: ["text", "image", "video", "audio"], output_modalities: ["text"], pricing: { prompt: 0.3e-6, completion: 2.5e-6 } },
  { id: "x-ai/grok-4", name: "Grok 4", kind: "text", input_modalities: ["text", "image"], output_modalities: ["text"], pricing: { prompt: 3e-6, completion: 15e-6 } },
  // ---- Analyze (video understanding) ----
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (video)", kind: "analyze", featured: true, description: "Cheapest full video + audio understanding.", input_modalities: ["text", "image", "video", "audio"], output_modalities: ["text"], pricing: { prompt: 0.3e-6, completion: 2.5e-6 } },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (video)", kind: "analyze", description: "Deeper analysis of long or complex videos.", input_modalities: ["text", "image", "video", "audio"], output_modalities: ["text"], pricing: { prompt: 1.25e-6, completion: 10e-6 } },
];

interface ModelOverrideRow { model_id: string; enabled: number; label: string | null; kind: string | null; price_override_json: string | null; featured: number }

interface CachedLive { at: number; models: ORModel[]; video: Record<string, unknown>[] }

const LIVE_TTL_MS = 60 * 60 * 1000;

async function loadLive(env: Env, force = false): Promise<CachedLive | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'openrouter_catalog'").first<{ value: string }>();
  const cached = row ? safeJson<CachedLive | null>(row.value, null) : null;
  if (cached && !force && Date.now() - cached.at < LIVE_TTL_MS) return cached;
  if (!env.OPENROUTER_API_KEY) return cached;
  try {
    const [models, video] = await Promise.all([listModels(env), listVideoModels(env).catch(() => [])]);
    const fresh: CachedLive = { at: Date.now(), models, video };
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('openrouter_catalog', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1")
      .bind(JSON.stringify(fresh)).run();
    return fresh;
  } catch {
    return cached;
  }
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/** Best-effort extraction of per-second pricing & options from /videos/models entries. */
function parseVideoModel(entry: Record<string, unknown>): Partial<ModelInfo> {
  const out: Partial<ModelInfo> = { pricing: {}, options: {} };
  const pricing = (entry.pricing ?? entry.prices ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(pricing)) {
    const n = num(typeof v === "object" && v ? (v as Record<string, unknown>).price ?? (v as Record<string, unknown>).usd : v);
    if (n === undefined) continue;
    if (/second|sec|duration/i.test(k) && out.pricing!.per_second === undefined) out.pricing!.per_second = n;
    if (/request|base/i.test(k)) out.pricing!.per_request = n;
  }
  if (Array.isArray(pricing) ) {
    for (const sku of pricing as Record<string, unknown>[]) {
      const n = num(sku.price ?? sku.usd ?? sku.unit_price);
      if (n !== undefined && /second/i.test(String(sku.unit ?? sku.name ?? ""))) out.pricing!.per_second = out.pricing!.per_second ?? n;
    }
  }
  const caps = (entry.capabilities ?? entry.supported ?? entry.parameters ?? entry) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? String((x as Record<string, unknown>).value ?? (x as Record<string, unknown>).id ?? "") : String(x))).filter(Boolean) : undefined);
  const d = arr(caps.durations ?? caps.duration ?? caps.supported_durations);
  if (d) out.options!.durations = d.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  out.options!.resolutions = arr(caps.resolutions ?? caps.resolution ?? caps.supported_resolutions);
  out.options!.aspect_ratios = arr(caps.aspect_ratios ?? caps.aspect_ratio ?? caps.supported_aspect_ratios);
  if (typeof caps.generate_audio === "boolean") out.options!.supports_audio = caps.generate_audio;
  return out;
}

export async function getCatalog(env: Env, opts: { force?: boolean; includeDisabled?: boolean } = {}): Promise<ModelInfo[]> {
  const [live, overridesRes] = await Promise.all([loadLive(env, opts.force), env.DB.prepare("SELECT * FROM model_settings").all<ModelOverrideRow>()]);
  const overrides = new Map(overridesRes.results.map((r) => [r.model_id, r]));
  const liveById = new Map((live?.models ?? []).map((m) => [m.id, m]));
  const liveVideo = new Map((live?.video ?? []).map((m) => [String(m.id ?? m.model ?? ""), m]));

  const out = new Map<string, ModelInfo>();
  const keyOf = (id: string, kind: string) => `${kind}:${id}`;

  for (const c of CURATED) {
    const lm = liveById.get(c.id);
    const lv = liveVideo.get(c.id);
    const m: ModelInfo = { ...c, enabled: true, source: "curated", pricing: { ...c.pricing }, options: { ...(c.options ?? {}) } };
    if (lm) {
      m.source = "openrouter";
      m.context_length = lm.context_length ?? m.context_length;
      const p = lm.pricing ?? {};
      if (c.kind === "text" || c.kind === "analyze") {
        m.pricing.prompt = num(p.prompt) ?? m.pricing.prompt;
        m.pricing.completion = num(p.completion) ?? m.pricing.completion;
      }
      if (c.kind === "image") {
        const perImg = num(p.image_output) ?? num(p.output_image) ?? num(p.image);
        // Gemini image models bill ~1290 output tokens per image
        const viaTokens = num(p.completion) ? num(p.completion)! * 1290 : undefined;
        if (perImg && perImg > 0.001) m.pricing.per_image = perImg;
        else if (viaTokens && viaTokens > 0.001) m.pricing.per_image = viaTokens;
      }
    }
    if (lv) {
      m.source = "openrouter";
      const parsed = parseVideoModel(lv);
      if (parsed.pricing?.per_second) m.pricing.per_second = parsed.pricing.per_second;
      if (parsed.options?.durations?.length) m.options!.durations = parsed.options.durations;
      if (parsed.options?.resolutions?.length) m.options!.resolutions = parsed.options.resolutions;
      if (parsed.options?.aspect_ratios?.length) m.options!.aspect_ratios = parsed.options.aspect_ratios;
    }
    // Hide curated entries the live catalog no longer lists (only when we have a live catalog)
    if (live && live.models.length > 0 && !lm && !lv && !(c.kind === "video" && live.video.length === 0)) continue;
    out.set(keyOf(c.id, c.kind), m);
  }

  // Add live image-output models and video models we didn't curate
  for (const lm of live?.models ?? []) {
    const outs = lm.architecture?.output_modalities ?? [];
    if (outs.includes("image") && !out.has(keyOf(lm.id, "image"))) {
      const p = lm.pricing ?? {};
      const perImg = num(p.image_output) ?? num(p.output_image) ?? (num(p.completion) ? num(p.completion)! * 1290 : undefined) ?? 0.05;
      out.set(keyOf(lm.id, "image"), { id: lm.id, name: lm.name, kind: "image", description: lm.description?.slice(0, 160), enabled: false, source: "openrouter", input_modalities: lm.architecture?.input_modalities ?? ["text"], output_modalities: outs, pricing: { per_image: perImg }, options: { aspect_ratios: ["1:1", "16:9", "9:16"], supports_reference: (lm.architecture?.input_modalities ?? []).includes("image") } });
    }
  }
  for (const [vid, lv] of liveVideo) {
    if (!vid || out.has(keyOf(vid, "video"))) continue;
    const parsed = parseVideoModel(lv);
    out.set(keyOf(vid, "video"), { id: vid, name: String(lv.name ?? vid), kind: "video", enabled: false, source: "openrouter", input_modalities: ["text", "image"], output_modalities: ["video"], pricing: { per_second: parsed.pricing?.per_second ?? 0.2 }, options: { aspect_ratios: parsed.options?.aspect_ratios ?? ["16:9", "9:16"], resolutions: parsed.options?.resolutions ?? ["720p"], durations: parsed.options?.durations ?? [5], supports_reference: true } });
  }

  // Apply admin overrides
  for (const m of out.values()) {
    const o = overrides.get(m.id);
    if (!o) continue;
    m.enabled = !!o.enabled;
    if (o.label) m.name = o.label;
    if (o.featured) m.featured = true;
    const po = safeJson<Record<string, number> | null>(o.price_override_json, null);
    if (po) { m.pricing = { ...m.pricing, ...po }; m.source = "override"; }
  }

  let list = [...out.values()];
  if (!opts.includeDisabled) list = list.filter((m) => m.enabled);
  list.sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.name.localeCompare(b.name));
  return list;
}

export async function findModel(env: Env, id: string, kind: Kind | "analyze"): Promise<ModelInfo | null> {
  const list = await getCatalog(env, { includeDisabled: true });
  return list.find((m) => m.id === id && m.kind === kind) ?? null;
}

export function creditConfig(env: Env) {
  const usd = parseFloat(env.CREDIT_USD || "0.001") || 0.001;
  const markup = parseFloat(env.CREDIT_MARKUP || "1") || 1;
  return { usd, markup };
}

export function usdToCredits(env: Env, usd: number): number {
  const { usd: perCredit, markup } = creditConfig(env);
  return Math.max(1, Math.ceil((usd * markup) / perCredit));
}

export function approxTokens(text: string): number {
  return Math.ceil((text ?? "").length / 3.6) + 8;
}

/** Estimate the credit cost of a generation request before it runs. */
export function estimateGeneration(env: Env, model: ModelInfo, req: { kind: Kind; prompt: string; params?: Record<string, unknown>; reference_keys?: string[]; count?: number; extraChars?: number }): Estimate {
  const breakdown: string[] = [];
  let usd = 0;
  const count = Math.max(1, Math.min(8, Number(req.count ?? 1)));
  const params = req.params ?? {};
  if (req.kind === "image") {
    const per = model.pricing.per_image ?? 0.05;
    const res = String(params.resolution ?? "1K");
    const mult = res === "4K" ? 2 : res === "2K" ? 1.5 : 1;
    usd = per * mult * count;
    breakdown.push(`${count} image${count > 1 ? "s" : ""} × $${(per * mult).toFixed(3)}`);
    if (req.reference_keys?.length) { const refUsd = 0.002 * req.reference_keys.length; usd += refUsd; breakdown.push(`${req.reference_keys.length} reference image(s) ≈ $${refUsd.toFixed(3)}`); }
  } else if (req.kind === "video") {
    const per = model.pricing.per_second ?? 0.2;
    const seconds = Number(params.duration ?? model.options?.durations?.[0] ?? 5);
    const res = String(params.resolution ?? "720p");
    const mult = res === "1080p" ? 1.5 : res === "4k" || res === "4K" ? 2.5 : res === "480p" ? 0.7 : 1;
    usd = per * seconds * mult * count + (model.pricing.per_request ?? 0) * count;
    breakdown.push(`${seconds}s × $${per.toFixed(3)}/s${mult !== 1 ? ` × ${mult} (${res})` : ""}${count > 1 ? ` × ${count}` : ""}`);
  } else {
    const researchTokens = req.extraChars ? Math.ceil(req.extraChars / 3.6) : 0;
    const promptTokens = approxTokens(req.prompt) + 120 + researchTokens;
    const maxTokens = Math.min(16000, Math.max(64, Number(params.max_tokens ?? 1500)));
    const p = model.pricing.prompt ?? 1e-6;
    const c = model.pricing.completion ?? 5e-6;
    usd = (promptTokens * p + maxTokens * c) * count;
    breakdown.push(`≈${promptTokens.toLocaleString()} in + up to ${maxTokens.toLocaleString()} out tokens`);
    if (researchTokens) breakdown.push(`includes ≈${researchTokens.toLocaleString()} tokens of Social Research context`);
  }
  const credits = usdToCredits(env, usd);
  return { credits, usd: credits * creditConfig(env).usd, breakdown, warning: req.kind === "text" ? "Copy is billed by the tokens actually used, so the final charge is usually lower than this." : model.source === "curated" ? "Price is from our model list; the final charge uses the cost the provider reports." : undefined };
}

/** Estimate a video analysis: Gemini bills ~258 tokens per second of video + audio ~32 tokens/s; we add output. */
export function estimateAnalysis(env: Env, model: ModelInfo, durationSeconds: number | null, note: string): Estimate {
  const secs = durationSeconds && durationSeconds > 0 ? durationSeconds : 60;
  const inputTokens = secs * 300 + approxTokens(note) + 600;
  const outputTokens = 2500;
  const usd = inputTokens * (model.pricing.prompt ?? 0.3e-6) + outputTokens * (model.pricing.completion ?? 2.5e-6);
  const credits = usdToCredits(env, usd);
  return { credits, usd: credits * creditConfig(env).usd, breakdown: [`≈${secs}s of video (${inputTokens.toLocaleString()} tokens in, ${outputTokens} out)`], warning: durationSeconds ? undefined : "Duration unknown; assuming 60s until processed." };
}
