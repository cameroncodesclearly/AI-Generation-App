import type { Env } from "../env";
import type { Analysis, ModelInfo } from "../../shared/types";
import { chat, getGenerationCost, type ChatMessagePart } from "./openrouter";
import { findModel, usdToCredits } from "./catalog";
import { refund, settle } from "./credits";
import { bytesToBase64, safeJson } from "./util";
import { signedFileUrl } from "./files";

/**
 * NAS bridge contract (optional). Your NAS container exposes:
 *   POST {NAS_ANALYZER_URL}/analyze   Authorization: Bearer {NAS_ANALYZER_TOKEN}
 *   body: { url?: string, file_url?: string, note?: string, want: ["transcript","frames","metadata"] }
 *   200:  { transcript?: string, duration?: number, title?: string, author?: string, platform?: string,
 *           frames?: [{ t: number, image: "data:image/jpeg;base64,..." }], video_url?: string, error?: string }
 * See nas-analyzer/ for a reference implementation (yt-dlp + faster-whisper + ffmpeg).
 */
interface NasResult {
  transcript?: string;
  duration?: number;
  title?: string;
  author?: string;
  platform?: string;
  frames?: { t: number; image: string }[];
  video_url?: string;
  error?: string;
}

const INLINE_LIMIT = 19 * 1024 * 1024; // keep base64 payloads under the common 20MB inline cap

const SYSTEM = `You are a senior social video analyst for a creative studio. You will receive a short-form social video (or its transcript and sampled frames) plus an optional note from the team member describing what they care about.
Return ONLY valid JSON with this exact shape:
{
  "transcript": "verbatim spoken words with [mm:ss] timestamps at natural breaks; write 'No speech' if silent",
  "summary": "3-6 sentence plain-English summary of what happens and why it works (or doesn't)",
  "visual": "scene-by-scene description of what is on screen with [mm:ss] timestamps: framing, movement, lighting, color, text overlays, cuts, b-roll, people, products",
  "on_screen_text": "all on-screen text / captions in order, or empty string",
  "hook": "the first 3 seconds: exactly what is said and shown, and why it holds attention",
  "format": "the content format in a few words (e.g. talking head, POV vlog, tutorial, skit, montage, product demo)",
  "key_moments": ["[mm:ss] moment", "..."],
  "caption_ideas": ["3 ready-to-post caption options in the creator's voice"],
  "hashtags": ["5-10 relevant hashtags without #"],
  "note_response": "direct answer to the team member's note, if any; otherwise empty string",
  "duration_seconds": 0
}
Be concrete and specific. Do not invent dialogue; if audio is unclear, say so inside the transcript.`;

interface Structured {
  transcript?: string; summary?: string; visual?: string; on_screen_text?: string; hook?: string; format?: string;
  key_moments?: string[]; caption_ideas?: string[]; hashtags?: string[]; note_response?: string; duration_seconds?: number;
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|mpeg|mpg)(\?|$)/i.test(url);
}
function isYouTube(url: string): boolean {
  return /(youtube\.com|youtu\.be)\//i.test(url);
}

async function nasFetch(env: Env, body: Record<string, unknown>): Promise<NasResult> {
  const res = await fetch(`${env.NAS_ANALYZER_URL!.replace(/\/$/, "")}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(env.NAS_ANALYZER_TOKEN ? { Authorization: `Bearer ${env.NAS_ANALYZER_TOKEN}` } : {}) },
    body: JSON.stringify({ ...body, want: ["transcript", "frames", "metadata"] }),
  });
  if (!res.ok) throw new Error(`NAS analyzer ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json()) as NasResult;
  if (j.error) throw new Error(`NAS analyzer: ${j.error}`);
  return j;
}

export async function runAnalysis(env: Env, analysisId: string): Promise<void> {
  const a = await env.DB.prepare("SELECT * FROM analyses WHERE id = ?1").bind(analysisId).first<Analysis>();
  if (!a || a.status === "done" || a.status === "failed") return;
  const model = (await findModel(env, a.model, "analyze")) ?? (await findModel(env, "google/gemini-2.5-flash", "analyze"));
  await env.DB.prepare("UPDATE analyses SET status = 'running' WHERE id = ?1").bind(a.id).run();
  try {
    if (!model) throw new Error("No analysis model available");
    const parts: ChatMessagePart[] = [];
    const meta: Record<string, unknown> = {};
    let nas: NasResult | null = null;

    if (env.NAS_ANALYZER_URL && (a.source_url || a.file_key)) {
      const body: Record<string, unknown> = { note: a.note ?? "" };
      if (a.source_url) body.url = a.source_url;
      else if (a.file_key) body.file_url = await signedFileUrl(env, a.file_key, 2 * 3600);
      nas = await nasFetch(env, body);
      Object.assign(meta, { title: nas.title, author: nas.author, platform: nas.platform, duration: nas.duration, source: "nas" });
    }

    // Prefer giving the model the actual video; fall back to transcript + frames from the NAS.
    let gaveVideo = false;
    if (a.file_key) {
      const obj = await env.FILES.get(a.file_key);
      if (!obj) throw new Error("Uploaded file not found");
      const mime = obj.httpMetadata?.contentType || "video/mp4";
      if (obj.size <= INLINE_LIMIT) {
        parts.push({ type: "video_url", video_url: { url: `data:${mime};base64,${bytesToBase64(await obj.arrayBuffer())}` } });
        gaveVideo = true;
      } else if (!nas) {
        parts.push({ type: "video_url", video_url: { url: await signedFileUrl(env, a.file_key, 2 * 3600) } });
        gaveVideo = true;
      }
    } else if (a.source_url && (isDirectVideo(a.source_url) || isYouTube(a.source_url)) && !nas) {
      parts.push({ type: "video_url", video_url: { url: a.source_url } });
      gaveVideo = true;
    } else if (nas?.video_url && !nas.transcript) {
      parts.push({ type: "video_url", video_url: { url: nas.video_url } });
      gaveVideo = true;
    }

    if (!gaveVideo && !nas) {
      throw new Error("This link can't be fetched directly. Upload the video file, use a direct .mp4/YouTube link, or connect the NAS analyzer bridge for TikTok/Instagram links.");
    }

    let userText = "";
    if (a.note) userText += `Team member's note / focus: ${a.note}\n\n`;
    if (meta.title) userText += `Title: ${meta.title}\n`;
    if (meta.author) userText += `Creator: ${meta.author}\n`;
    if (meta.platform) userText += `Platform: ${meta.platform}\n`;
    if (nas?.transcript) userText += `\nWhisper transcript (verify against the frames, keep timestamps):\n${nas.transcript}\n`;
    if (!gaveVideo && nas?.frames?.length) {
      userText += `\n${nas.frames.length} sampled frames follow in order (timestamps in seconds: ${nas.frames.map((f) => f.t).join(", ")}).`;
      for (const f of nas.frames.slice(0, 24)) parts.push({ type: "image_url", image_url: { url: f.image } });
    }
    userText += "\nAnalyze the video and respond with the JSON object only.";
    parts.unshift({ type: "text", text: userText });

    const res = await chat(env, {
      model: model.id,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: parts }],
      max_tokens: 6000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const raw = res.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let parsed: Structured;
    try { parsed = JSON.parse(cleaned) as Structured; } catch { parsed = { summary: raw.slice(0, 4000) }; }
    if (!parsed.transcript && nas?.transcript) parsed.transcript = nas.transcript;

    let cost = typeof res.usage?.cost === "number" ? res.usage.cost : null;
    if (cost === null && res.id) cost = await getGenerationCost(env, res.id);
    const actual = cost !== null ? usdToCredits(env, cost) : a.estimate_credits;
    const extras = {
      on_screen_text: parsed.on_screen_text ?? "", hook: parsed.hook ?? "", format: parsed.format ?? "",
      key_moments: parsed.key_moments ?? [], caption_ideas: parsed.caption_ideas ?? [], hashtags: parsed.hashtags ?? [],
      note_response: parsed.note_response ?? "", duration_seconds: parsed.duration_seconds ?? meta.duration ?? null,
      meta, tokens: res.usage ?? null,
    };
    await env.DB.prepare(
      "UPDATE analyses SET status = 'done', transcript = ?2, summary = ?3, visual = ?4, extras_json = ?5, actual_credits = ?6, cost_usd = ?7, completed_at = datetime('now') WHERE id = ?1",
    ).bind(a.id, parsed.transcript ?? "", parsed.summary ?? "", parsed.visual ?? "", JSON.stringify(extras), actual, cost).run();
    await settle(env, a.user_id, a.estimate_credits, actual, "analysis", a.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[analysis ${a.id}] failed: ${msg}`);
    await env.DB.prepare("UPDATE analyses SET status = 'failed', error = ?2, completed_at = datetime('now') WHERE id = ?1").bind(a.id, msg.slice(0, 500)).run();
    await refund(env, a.user_id, a.estimate_credits, "analysis", a.id);
  }
}

/** Minimal RFC4180-ish CSV parser (handles quotes, commas, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ""; let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export function analysisCsvRows(list: Analysis[]): (string | number | null)[][] {
  const header = ["id", "status", "source", "filename", "note", "format", "hook", "summary", "transcript", "visual_description", "on_screen_text", "key_moments", "caption_ideas", "hashtags", "note_response", "credits", "error", "created_at"];
  const rows: (string | number | null)[][] = [header];
  for (const a of list) {
    const x = safeJson<Record<string, unknown>>(a.extras_json, {});
    const j = (v: unknown) => (Array.isArray(v) ? v.join(" | ") : v ? String(v) : "");
    rows.push([a.id, a.status, a.source_url ?? "", a.filename ?? "", a.note ?? "", j(x.format), j(x.hook), a.summary ?? "", a.transcript ?? "", a.visual ?? "", j(x.on_screen_text), j(x.key_moments), j(x.caption_ideas), j(x.hashtags), j(x.note_response), a.actual_credits ?? a.estimate_credits, a.error ?? "", a.created_at]);
  }
  return rows;
}
