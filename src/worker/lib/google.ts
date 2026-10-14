import type { Env } from "../env";
import { HttpError } from "./util";

export function googleEnabled(env: Env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function allowedDomains(env: Env): string[] {
  return (env.GOOGLE_ALLOWED_DOMAINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function redirectUri(env: Env): string {
  return `${env.APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function authUrl(env: Env, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(env),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  const domains = allowedDomains(env);
  if (domains.length === 1) p.set("hd", domains[0]); // hint the Workspace domain picker
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export interface GoogleProfile { sub: string; email: string; email_verified: boolean; name?: string; picture?: string; hd?: string }

export async function exchangeCode(env: Env, code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(env), grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) throw new HttpError(401, `Google sign-in failed (${tokenRes.status})`);
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) throw new HttpError(401, "Google sign-in failed (no token)");
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!infoRes.ok) throw new HttpError(401, "Google sign-in failed (profile)");
  const info = (await infoRes.json()) as GoogleProfile;
  if (!info.email || !info.email_verified) throw new HttpError(401, "Google account email is not verified");
  return info;
}
