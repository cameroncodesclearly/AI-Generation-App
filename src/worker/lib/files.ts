import type { Env } from "../env";
import { bytesToBase64, sha256 } from "./util";

export async function r2DataUrl(env: Env, key: string): Promise<string | null> {
  const obj = await env.FILES.get(key);
  if (!obj) return null;
  const mime = obj.httpMetadata?.contentType || "application/octet-stream";
  return `data:${mime};base64,${bytesToBase64(await obj.arrayBuffer())}`;
}

async function signingSecret(env: Env): Promise<string> {
  return sha256(`${env.OPENROUTER_API_KEY ?? "dev"}|files|${env.APP_NAME}`);
}

/** Time-limited public link for files that must be fetched by third parties (OpenRouter providers). */
export async function signedFileUrl(env: Env, key: string, ttlSeconds = 3600): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = (await sha256(`${await signingSecret(env)}|${key}|${exp}`)).slice(0, 32);
  return `${env.APP_URL.replace(/\/$/, "")}/files/signed/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
}

export async function verifySignedFile(env: Env, key: string, exp: string, sig: string): Promise<boolean> {
  const e = parseInt(exp, 10);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
  const expect = (await sha256(`${await signingSecret(env)}|${key}|${e}`)).slice(0, 32);
  return expect === sig;
}
