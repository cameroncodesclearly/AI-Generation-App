import type { Env } from "../env";
import type { User } from "../../shared/types";
import { HttpError, id } from "./util";
import { creditConfig } from "./catalog";

function monthStart(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Roll the user's period forward if a monthly reset is due. Returns the fresh user row. */
export async function ensurePeriod(env: Env, user: User): Promise<User> {
  if (user.period_reset !== "monthly") return user;
  const ms = monthStart();
  if (user.period_start >= ms) return user;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET credits_used = 0, period_start = ?2 WHERE id = ?1").bind(user.id, ms),
    env.DB.prepare("INSERT INTO credit_ledger (id, user_id, delta, reason, ref_type) VALUES (?1, ?2, ?3, 'reset', 'system')").bind(id("led"), user.id, -user.credits_used),
  ]);
  return { ...user, credits_used: 0, period_start: ms };
}

/** Atomically reserve credits against the user's limit. Throws 402 when the limit would be exceeded. */
export async function reserve(env: Env, userId: string, credits: number, refType: string, refId: string): Promise<void> {
  const res = await env.DB.prepare(
    "UPDATE users SET credits_used = credits_used + ?2 WHERE id = ?1 AND status = 'active' AND credits_used + ?2 <= credit_limit",
  ).bind(userId, credits).run();
  if (!res.meta.changes) {
    const u = await env.DB.prepare("SELECT credit_limit, credits_used, status FROM users WHERE id = ?1").bind(userId).first<{ credit_limit: number; credits_used: number; status: string }>();
    if (u?.status !== "active") throw new HttpError(403, "Your account is disabled");
    const left = Math.max(0, (u?.credit_limit ?? 0) - (u?.credits_used ?? 0));
    const per = creditConfig(env).usd;
    throw new HttpError(402, `Not enough budget left: this run costs about $${(credits * per).toFixed(2)} and you have $${(left * per).toFixed(2)} left this month. Ask an admin for a top-up.`, { needed: credits, remaining: left });
  }
  await env.DB.prepare("INSERT INTO credit_ledger (id, user_id, delta, reason, ref_type, ref_id) VALUES (?1, ?2, ?3, 'reserve', ?4, ?5)")
    .bind(id("led"), userId, credits, refType, refId).run();
}

/** Replace the reserved estimate with the actual cost (may be higher or lower). */
export async function settle(env: Env, userId: string, estimate: number, actual: number, refType: string, refId: string): Promise<void> {
  const delta = actual - estimate;
  if (delta === 0) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET credits_used = MAX(0, credits_used + ?2) WHERE id = ?1").bind(userId, delta),
    env.DB.prepare("INSERT INTO credit_ledger (id, user_id, delta, reason, ref_type, ref_id) VALUES (?1, ?2, ?3, 'settle', ?4, ?5)").bind(id("led"), userId, delta, refType, refId),
  ]);
}

/** Give the reserved credits back after a failure. */
export async function refund(env: Env, userId: string, credits: number, refType: string, refId: string): Promise<void> {
  if (credits <= 0) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET credits_used = MAX(0, credits_used - ?2) WHERE id = ?1").bind(userId, credits),
    env.DB.prepare("INSERT INTO credit_ledger (id, user_id, delta, reason, ref_type, ref_id) VALUES (?1, ?2, ?3, 'refund', ?4, ?5)").bind(id("led"), userId, -credits, refType, refId),
  ]);
}
