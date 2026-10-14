import type { Env } from "../env";
import type { Generation, ModelInfo, Output } from "../../shared/types";
import { chat, getGenerationCost, getVideo, getVideoContent, submitVideo, type ChatMessagePart } from "./openrouter";
import { findModel, usdToCredits } from "./catalog";
import { refund, settle } from "./credits";
import { extFor, parseDataUrl, safeJson } from "./util";
import { r2DataUrl, signedFileUrl } from "./files";
import { formatResearch, selectResearch, type ResearchConfig } from "./notion";

const POLL_DELAY_S = 20;
const MAX_POLLS = 90; // 30 minutes

async function setStatus(env: Env, id: string, status: Generation["status"], extra: Record<string, unknown> = {}): Promise<void> {
  const sets = ["status = ?2"];
  const binds: unknown[] = [id, status];
  let i = 3;
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?${i}`); binds.push(v); i++; }
  if (status === "done" || status === "failed") sets.push("completed_at = datetime('now')");
  await env.DB.prepare(`UPDATE generations SET ${sets.join(", ")} WHERE id = ?1`).bind(...binds).run();
}

async function fail(env: Env, gen: Generation, message: string): Promise<void> {
  console.error(`[generation ${gen.id}] failed: ${message}`);
  await setStatus(env, gen.id, "failed", { error: message.slice(0, 500) });
  await refund(env, gen.user_id, gen.estimate_credits, "generation", gen.id);
}

async function finish(env: Env, gen: Generation, costUsd: number | null, extra: Record<string, unknown>): Promise<void> {
  const actual = costUsd !== null ? usdToCredits(env, costUsd) : gen.estimate_credits;
  await setStatus(env, gen.id, "done", { ...extra, actual_credits: actual, cost_usd: costUsd });
  await settle(env, gen.user_id, gen.estimate_credits, actual, "generation", gen.id);
}

async function referenceParts(env: Env, keys: string[]): Promise<ChatMessagePart[]> {
  const parts: ChatMessagePart[] = [];
  for (const key of keys.slice(0, 6)) {
    const url = await r2DataUrl(env, key);
    if (url) parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

export async function runGeneration(env: Env, genId: string): Promise<void> {
  const gen = await env.DB.prepare("SELECT * FROM generations WHERE id = ?1").bind(genId).first<Generation>();
  if (!gen || gen.status === "done" || gen.status === "failed") return;
  const model = await findModel(env, gen.model, gen.kind);
  if (!model) return fail(env, gen, `Model ${gen.model} is not available`);
  await setStatus(env, gen.id, "running");
  const params = safeJson<Record<string, unknown>>(gen.params_json, {});
  const refs = safeJson<string[]>(gen.input_keys_json, []);
  try {
    if (gen.kind === "image") await runImage(env, gen, model, params, refs);
    else if (gen.kind === "text") await runText(env, gen, model, params, refs);
    else await startVideo(env, gen, model, params, refs);
  } catch (e) {
    await fail(env, gen, e instanceof Error ? e.message : String(e));
  }
}

async function runImage(env: Env, gen: Generation, model: ModelInfo, params: Record<string, unknown>, refs: string[]): Promise<void> {
  const count = Math.max(1, Math.min(8, Number(params.count ?? 1)));
  const refParts = await referenceParts(env, refs);
  let prompt = gen.prompt;
  if (params.negative) prompt += `\n\nAvoid: ${String(params.negative)}`;
  const content: ChatMessagePart[] = [{ type: "text", text: prompt }, ...refParts];
  const imageConfig: Record<string, string> = {};
  if (params.aspect_ratio) imageConfig.aspect_ratio = String(params.aspect_ratio);
  if (params.resolution && /^[124]K$/.test(String(params.resolution))) imageConfig.image_size = String(params.resolution);

  const one = async (i: number): Promise<{ outputs: Output[]; cost: number | null; text: string | null }> => {
    const res = await chat(env, {
      model: model.id,
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
      ...(Object.keys(imageConfig).length ? { image_config: imageConfig } : {}),
    });
    const msg = res.choices?.[0]?.message;
    const images = msg?.images ?? [];
    if (!images.length) {
      const why = (typeof msg?.content === "string" && msg.content.trim()) ? msg.content.trim().slice(0, 300) : "no image returned";
      throw new Error(`Model returned no image (${why})`);
    }
    const outputs: Output[] = [];
    for (const [j, img] of images.entries()) {
      const parsed = parseDataUrl(img.image_url.url);
      let bytes: Uint8Array; let mime: string;
      if (parsed) { bytes = parsed.bytes; mime = parsed.mime; }
      else { const r = await fetch(img.image_url.url); bytes = new Uint8Array(await r.arrayBuffer()); mime = r.headers.get("content-type") || "image/png"; }
      const key = `outputs/${gen.id}/${i}-${j}.${extFor(mime)}`;
      await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
      outputs.push({ key, mime, index: i });
    }
    let cost = typeof res.usage?.cost === "number" ? res.usage.cost : null;
    if (cost === null && res.id) cost = await getGenerationCost(env, res.id);
    return { outputs, cost, text: typeof msg?.content === "string" ? msg.content : null };
  };

  const results = await Promise.all(Array.from({ length: count }, (_, i) => one(i)));
  const outputs = results.flatMap((r) => r.outputs);
  const costs = results.map((r) => r.cost);
  const cost = costs.every((c) => c !== null) ? costs.reduce((a, b) => a! + b!, 0) : null;
  await finish(env, gen, cost, { outputs_json: JSON.stringify(outputs), text_output: results.find((r) => r.text)?.text ?? null });
}

async function runText(env: Env, gen: Generation, model: ModelInfo, params: Record<string, unknown>, refs: string[]): Promise<void> {
  const refParts = await referenceParts(env, refs);
  const base = typeof params.system === "string" && params.system.trim() ? params.system.trim() : "You are a sharp creative collaborator for a video production and social content studio. Write with craft, specificity and zero filler.";
  const research = formatResearch(await selectResearch(env, gen.prompt, params.research as ResearchConfig | undefined));
  const system = research ? `${base}\n\n${research}` : base;
  const res = await chat(env, {
    model: model.id,
    messages: [
      { role: "system", content: system },
      { role: "user", content: refParts.length ? [{ type: "text", text: gen.prompt }, ...refParts] : gen.prompt },
    ],
    max_tokens: Math.min(16000, Math.max(64, Number(params.max_tokens ?? 1500))),
    temperature: typeof params.temperature === "number" ? params.temperature : 0.8,
  });
  const text = res.choices?.[0]?.message?.content ?? "";
  let cost = typeof res.usage?.cost === "number" ? res.usage.cost : null;
  if (cost === null && res.id) cost = await getGenerationCost(env, res.id);
  await finish(env, gen, cost, { text_output: text });
}

async function startVideo(env: Env, gen: Generation, model: ModelInfo, params: Record<string, unknown>, refs: string[]): Promise<void> {
  const body: Record<string, unknown> = { model: model.id, prompt: gen.prompt };
  if (params.duration) body.duration = Number(params.duration);
  if (params.resolution) body.resolution = String(params.resolution);
  if (params.aspect_ratio) body.aspect_ratio = String(params.aspect_ratio);
  if (typeof params.generate_audio === "boolean") body.generate_audio = params.generate_audio;
  if (params.seed !== undefined && params.seed !== "") body.seed = Number(params.seed);
  if (refs.length) {
    // Per-model frame support varies; first reference = first frame by default, second = last frame.
    const frameTypes = ["first", "last"];
    const frames: Record<string, unknown>[] = [];
    for (const [i, key] of refs.slice(0, 2).entries()) {
      const url = await signedFileUrl(env, key, 6 * 3600);
      frames.push({ frame_type: String(params.frame_type ?? frameTypes[i]), image_url: url });
    }
    body.frame_images = frames;
  }
  const job = await submitVideo(env, body);
  await setStatus(env, gen.id, "running", { provider_job_id: job.id });
  await env.JOBS.send({ type: "video_poll", id: gen.id, attempt: 1 }, { delaySeconds: POLL_DELAY_S });
}

export async function pollVideo(env: Env, genId: string, attempt: number): Promise<void> {
  const gen = await env.DB.prepare("SELECT * FROM generations WHERE id = ?1").bind(genId).first<Generation>();
  if (!gen || gen.status !== "running" || !gen.provider_job_id) return;
  let job;
  try {
    job = await getVideo(env, gen.provider_job_id);
  } catch (e) {
    if (attempt >= MAX_POLLS) return fail(env, gen, `Timed out polling video job: ${e instanceof Error ? e.message : e}`);
    await env.JOBS.send({ type: "video_poll", id: genId, attempt: attempt + 1 }, { delaySeconds: POLL_DELAY_S * 2 });
    return;
  }
  const status = String(job.status ?? "").toLowerCase();
  if (status === "completed" || status === "succeeded" || status === "done") {
    const outputs: Output[] = [];
    const n = Array.isArray(job.unsigned_urls) && job.unsigned_urls.length ? job.unsigned_urls.length : 1;
    for (let i = 0; i < n; i++) {
      const res = await getVideoContent(env, gen.provider_job_id, i);
      const mime = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
      const key = `outputs/${gen.id}/${i}.${extFor(mime) === "bin" ? "mp4" : extFor(mime)}`;
      await env.FILES.put(key, await res.arrayBuffer(), { httpMetadata: { contentType: mime.startsWith("video/") ? mime : "video/mp4" } });
      outputs.push({ key, mime: mime.startsWith("video/") ? mime : "video/mp4", index: i });
    }
    const cost = typeof job.cost === "number" ? job.cost : typeof job.usage?.cost === "number" ? job.usage.cost : typeof (job as { total_cost?: number }).total_cost === "number" ? (job as { total_cost?: number }).total_cost! : null;
    await finish(env, gen, cost, { outputs_json: JSON.stringify(outputs) });
    return;
  }
  if (["failed", "cancelled", "canceled", "expired", "error"].includes(status)) {
    const err = typeof job.error === "string" ? job.error : job.error?.message ?? `Video job ${status}`;
    return fail(env, gen, err);
  }
  if (attempt >= MAX_POLLS) return fail(env, gen, "Video generation timed out");
  await env.JOBS.send({ type: "video_poll", id: genId, attempt: attempt + 1 }, { delaySeconds: POLL_DELAY_S });
}
