import { Hono } from "hono";
import type { Env } from "./env";
import type { User } from "../shared/types";
import { currentUser } from "./lib/auth";
import { HttpError } from "./lib/util";

export type AppEnv = { Bindings: Env; Variables: { user: User } };

export function newApp() {
  return new Hono<AppEnv>();
}

export const requireUser = async (c: import("hono").Context<AppEnv>, next: () => Promise<void>) => {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, "Sign in required");
  c.set("user", user);
  c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?1").bind(user.id).run());
  await next();
};

export const requireAdmin = async (c: import("hono").Context<AppEnv>, next: () => Promise<void>) => {
  if (c.get("user")?.role !== "admin") throw new HttpError(403, "Admin only");
  await next();
};

export function remaining(u: User): number {
  return Math.max(0, u.credit_limit - u.credits_used);
}
