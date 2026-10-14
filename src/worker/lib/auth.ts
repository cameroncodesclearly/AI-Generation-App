import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../env";
import type { User } from "../../shared/types";
import { addDays, HttpError, id, sha256, token } from "./util";
import { ensurePeriod } from "./credits";
import { magicLinkEmail, sendMail } from "./mail";
import { verifyPassword } from "./password";

/** Never send password hashes or lockout state to the client. */
export function publicUser<T extends Record<string, unknown>>(u: T): Omit<T, "password_hash" | "failed_logins" | "locked_until" | "google_sub"> & { has_password: boolean } {
  const { password_hash, failed_logins, locked_until, google_sub, ...rest } = u as T & { password_hash?: string | null; failed_logins?: number; locked_until?: string | null; google_sub?: string | null };
  void failed_logins; void locked_until; void google_sub;
  return { ...rest, has_password: !!password_hash };
}

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export async function loginWithPassword(env: Env, email: string, password: string): Promise<User> {
  const generic = new HttpError(401, "Wrong email or password");
  const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?1").bind(email.toLowerCase())
    .first<User & { password_hash: string | null; failed_logins: number; locked_until: string | null }>();
  if (!u || u.status !== "active") { await verifyPassword(password, "pbkdf2$1000$AAAAAAAAAAAAAAAAAAAAAA$AAAA"); throw generic; }
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  if (u.locked_until && u.locked_until > now) throw new HttpError(429, `Too many attempts. Try again in a few minutes or use an email link.`);
  if (!u.password_hash) throw new HttpError(401, "No password set yet. Use the email link to sign in, then set one under Account.");
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) {
    const failed = (u.failed_logins ?? 0) + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString().replace("T", " ").slice(0, 19) : null;
    await env.DB.prepare("UPDATE users SET failed_logins = ?2, locked_until = ?3 WHERE id = ?1").bind(u.id, lock ? 0 : failed, lock).run();
    throw generic;
  }
  if (u.failed_logins || u.locked_until) await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?1").bind(u.id).run();
  return ensurePeriod(env, u);
}

export const COOKIE = "ccs_session";
const MAGIC_MINUTES = 15;

export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function getUserByEmail(env: Env, email: string): Promise<User | null> {
  return env.DB.prepare("SELECT * FROM users WHERE email = ?1").bind(email.toLowerCase()).first<User>();
}

export async function createUser(env: Env, email: string, opts: { role?: "admin" | "member"; name?: string; credit_limit?: number } = {}): Promise<User> {
  const uid = id("usr");
  const limit = opts.credit_limit ?? parseInt(env.DEFAULT_CREDIT_LIMIT || "2000", 10);
  const role = opts.role ?? (adminEmails(env).includes(email.toLowerCase()) ? "admin" : "member");
  await env.DB.prepare("INSERT INTO users (id, email, name, role, credit_limit) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(uid, email.toLowerCase(), opts.name ?? null, role, limit).run();
  return (await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(uid).first<User>())!;
}

/** Create a magic link for an existing user and email it (or print it in dev). Returns the link in dev only. */
export async function issueMagicLink(env: Env, email: string): Promise<{ sent: boolean; devLink?: string }> {
  const raw = token();
  const hash = await sha256(raw);
  const expires = new Date(Date.now() + MAGIC_MINUTES * 60_000).toISOString().replace("T", " ").slice(0, 19);
  await env.DB.prepare("INSERT INTO magic_links (id, email, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(id("ml"), email.toLowerCase(), hash, expires).run();
  const link = `${env.APP_URL.replace(/\/$/, "")}/api/auth/verify?token=${raw}`;
  if (env.DEV_PRINT_MAGIC_LINK === "1" || !env.RESEND_API_KEY) {
    console.log(`[magic-link] ${email} -> ${link}`);
    if (env.DEV_PRINT_MAGIC_LINK === "1") return { sent: false, devLink: link };
    throw new HttpError(503, "Email is not configured (RESEND_API_KEY). Set DEV_PRINT_MAGIC_LINK=1 to print links locally.");
  }
  const { html, text } = magicLinkEmail(env.APP_NAME, link, MAGIC_MINUTES);
  await sendMail(env, email, `Sign in to ${env.APP_NAME}`, html, text);
  return { sent: true };
}

export async function consumeMagicLink(env: Env, raw: string): Promise<User> {
  const hash = await sha256(raw);
  const row = await env.DB.prepare("SELECT * FROM magic_links WHERE token_hash = ?1").bind(hash)
    .first<{ id: string; email: string; expires_at: string; used_at: string | null }>();
  if (!row) throw new HttpError(400, "This sign-in link is invalid.");
  if (row.used_at) throw new HttpError(400, "This sign-in link was already used. Request a new one.");
  if (row.expires_at < new Date().toISOString().replace("T", " ").slice(0, 19)) throw new HttpError(400, "This sign-in link expired. Request a new one.");
  await env.DB.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE id = ?1").bind(row.id).run();
  let user = await getUserByEmail(env, row.email);
  if (!user) user = await createUser(env, row.email);
  if (user.status !== "active") throw new HttpError(403, "This account is disabled.");
  return user;
}

export async function createSession(c: Context<{ Bindings: Env; Variables: { user: User } }>, user: User): Promise<void> {
  const raw = token();
  const sid = await sha256(raw);
  const days = parseInt(c.env.SESSION_DAYS || "30", 10);
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)").bind(sid, user.id, addDays(new Date(), days)).run();
  const secure = c.env.APP_URL.startsWith("https://");
  setCookie(c, COOKIE, raw, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: days * 86400 });
}

export async function destroySession(c: Context<{ Bindings: Env; Variables: { user: User } }>): Promise<void> {
  const raw = getCookie(c, COOKIE);
  if (raw) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(await sha256(raw)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function currentUser(c: Context<{ Bindings: Env; Variables: { user: User } }>): Promise<User | null> {
  const raw = getCookie(c, COOKIE);
  if (!raw) return null;
  const sid = await sha256(raw);
  const user = await c.env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?1 AND s.expires_at > datetime('now')",
  ).bind(sid).first<User>();
  if (!user || user.status !== "active") return null;
  return ensurePeriod(c.env, user);
}
