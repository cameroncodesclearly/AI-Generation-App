import type { Env } from "../env";
import { HttpError } from "./util";

const BASE = "https://openrouter.ai/api/v1";

export interface ORModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string };
  pricing?: Record<string, string | number | null | undefined>;
  supported_parameters?: string[];
}

export interface ChatMessagePart {
  type: "text" | "image_url" | "video_url" | "input_audio" | "file";
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  input_audio?: { data: string; format: string };
  file?: { filename: string; file_data: string };
}

export interface ChatRequest {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string | ChatMessagePart[] }[];
  max_tokens?: number;
  temperature?: number;
  modalities?: string[];
  image_config?: { aspect_ratio?: string; image_size?: string };
  response_format?: { type: "json_object" };
  usage?: { include: boolean };
  plugins?: unknown[];
}

export interface ChatResponse {
  id: string;
  choices: { message: { role: string; content: string | null; images?: { type: string; image_url: { url: string } }[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
}

export interface VideoJob {
  id: string;
  status: string; // pending | processing | completed | failed | cancelled | expired
  polling_url?: string;
  error?: string | { message?: string };
  unsigned_urls?: string[];
  cost?: number;
  usage?: { cost?: number };
  [k: string]: unknown;
}

function headers(env: Env, json = true): HeadersInit {
  if (!env.OPENROUTER_API_KEY) throw new HttpError(503, "OPENROUTER_API_KEY is not configured");
  const h: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": env.APP_URL,
    "X-Title": env.APP_NAME,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function parseError(res: Response): Promise<never> {
  let msg = `OpenRouter ${res.status}`;
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    if (j?.error?.message) msg = j.error.message;
  } catch { /* ignore */ }
  throw new HttpError(res.status >= 500 ? 502 : res.status, msg);
}

export async function listModels(env: Env): Promise<ORModel[]> {
  // output_modalities=all so image/video capable models are included
  const res = await fetch(`${BASE}/models?output_modalities=all`, { headers: headers(env, false) });
  if (!res.ok) {
    const res2 = await fetch(`${BASE}/models`, { headers: headers(env, false) });
    if (!res2.ok) return parseError(res2);
    return ((await res2.json()) as { data: ORModel[] }).data;
  }
  return ((await res.json()) as { data: ORModel[] }).data;
}

export async function listVideoModels(env: Env): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}/videos/models`, { headers: headers(env, false) });
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: Record<string, unknown>[]; models?: Record<string, unknown>[] };
  return j.data ?? j.models ?? [];
}

export async function chat(env: Env, body: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({ usage: { include: true }, ...body }),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as ChatResponse;
}

export async function submitVideo(env: Env, body: Record<string, unknown>): Promise<VideoJob> {
  const res = await fetch(`${BASE}/videos`, { method: "POST", headers: headers(env), body: JSON.stringify(body) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as VideoJob;
}

export async function getVideo(env: Env, jobId: string): Promise<VideoJob> {
  const res = await fetch(`${BASE}/videos/${encodeURIComponent(jobId)}`, { headers: headers(env, false) });
  if (!res.ok) return parseError(res);
  return (await res.json()) as VideoJob;
}

export async function getVideoContent(env: Env, jobId: string, index = 0): Promise<Response> {
  const res = await fetch(`${BASE}/videos/${encodeURIComponent(jobId)}/content?index=${index}`, { headers: headers(env, false) });
  if (!res.ok) return parseError(res);
  return res;
}

/** Fetch the final accounted cost for a chat generation (available shortly after completion). */
export async function getGenerationCost(env: Env, generationId: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/generation?id=${encodeURIComponent(generationId)}`, { headers: headers(env, false) });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { total_cost?: number } };
    return typeof j.data?.total_cost === "number" ? j.data.total_cost : null;
  } catch {
    return null;
  }
}
