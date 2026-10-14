import { newApp, requireAdmin, requireUser } from "../app";
import { createUser, getUserByEmail, issueMagicLink, publicUser } from "../lib/auth";
import { hashPassword, validatePassword } from "../lib/password";
import { getCatalog } from "../lib/catalog";
import { inviteEmail, sendMail } from "../lib/mail";
import { HttpError, id } from "../lib/util";
import type { User } from "../../shared/types";

const admin = newApp();
admin.use("*", requireUser, requireAdmin);

admin.get("/users", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.*, 
       (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id) AS generations,
       (SELECT COUNT(*) FROM analyses a WHERE a.user_id = u.id) AS analyses,
       (SELECT COALESCE(SUM(cost_usd),0) FROM generations g WHERE g.user_id = u.id AND g.created_at >= u.period_start) + (SELECT COALESCE(SUM(cost_usd),0) FROM analyses a WHERE a.user_id = u.id AND a.created_at >= u.period_start) AS period_usd
     FROM users u ORDER BY u.created_at ASC`,
  ).all<Record<string, unknown>>();
  return c.json({ users: rows.results.map(publicUser) });
});

admin.post("/users", async (c) => {
  const me = c.get("user");
  const b = (await c.req.json()) as { email?: string; name?: string; credit_limit?: number; role?: "admin" | "member"; send_invite?: boolean; password?: string };
  if (b.password) validatePassword(b.password);
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
  if (await getUserByEmail(c.env, email)) throw new HttpError(409, "That person is already on the team");
  const user = await createUser(c.env, email, { name: b.name?.trim() || undefined, credit_limit: Math.max(0, Math.floor(Number(b.credit_limit ?? parseInt(c.env.DEFAULT_CREDIT_LIMIT, 10)))), role: b.role === "admin" ? "admin" : "member" });
  if (b.password) await c.env.DB.prepare("UPDATE users SET password_hash = ?2, must_set_password = 1 WHERE id = ?1").bind(user.id, await hashPassword(b.password)).run();
  let invited = false; let devLink: string | undefined;
  if (b.send_invite !== false) {
    try {
      const r = await issueMagicLink(c.env, email);
      invited = r.sent; devLink = r.devLink;
      if (r.sent) {
        // issueMagicLink already sent a sign-in mail; also send a friendlier invite with the credit allowance.
        const { html, text } = inviteEmail(c.env.APP_NAME, `${c.env.APP_URL.replace(/\/$/, "")}/login`, me.name ?? me.email, user.credit_limit);
        c.executionCtx.waitUntil(sendMail(c.env, email, `${me.name ?? me.email} invited you to ${c.env.APP_NAME}`, html, text).catch(() => {}));
      }
    } catch (e) { devLink = undefined; console.warn("invite mail failed", e); }
  }
  const fresh = (await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(user.id).first<Record<string, unknown>>())!;
  return c.json({ user: publicUser(fresh), invited, devLink }, 201);
});

admin.patch("/users/:id", async (c) => {
  const me = c.get("user");
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(c.req.param("id")).first<User>();
  if (!target) throw new HttpError(404, "User not found");
  const b = (await c.req.json()) as Partial<Pick<User, "name" | "credit_limit" | "role" | "status" | "period_reset">>;
  if (target.id === me.id && (b.role === "member" || b.status === "disabled")) throw new HttpError(400, "You can't demote or disable yourself");
  await c.env.DB.prepare("UPDATE users SET name = ?2, credit_limit = ?3, role = ?4, status = ?5, period_reset = ?6 WHERE id = ?1").bind(
    target.id, b.name !== undefined ? (String(b.name).trim().slice(0, 80) || null) : target.name,
    b.credit_limit !== undefined ? Math.max(0, Math.floor(Number(b.credit_limit))) : target.credit_limit,
    b.role === "admin" || b.role === "member" ? b.role : target.role,
    b.status === "disabled" || b.status === "active" ? b.status : target.status,
    b.period_reset === "never" || b.period_reset === "monthly" ? b.period_reset : target.period_reset,
  ).run();
  if (b.status === "disabled") await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(target.id).run();
  return c.json({ user: publicUser((await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(target.id).first<Record<string, unknown>>())!) });
});

admin.post("/users/:id/reset", async (c) => {
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(c.req.param("id")).first<User>();
  if (!target) throw new HttpError(404, "User not found");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET credits_used = 0 WHERE id = ?1").bind(target.id),
    c.env.DB.prepare("INSERT INTO credit_ledger (id, user_id, delta, reason, ref_type, ref_id) VALUES (?1, ?2, ?3, 'reset', 'admin', ?4)").bind(id("led"), target.id, -target.credits_used, c.get("user").id),
  ]);
  return c.json({ ok: true });
});

admin.post("/users/:id/adjust", async (c) => {
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(c.req.param("id")).first<User>();
  if (!target) throw new HttpError(404, "User not found");
  const { delta } = (await c.req.json()) as { delta: number };
  const d = Math.floor(Number(delta));
  if (!Number.isFinite(d) || d === 0) throw new HttpError(400, "delta must be a non-zero integer (negative = grant credits back)");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET credits_used = MAX(0, credits_used + ?2) WHERE id = ?1").bind(target.id, d),
    c.env.DB.prepare("INSERT INTO credit_ledger (id, user_id, delta, reason, ref_type, ref_id) VALUES (?1, ?2, ?3, 'adjust', 'admin', ?4)").bind(id("led"), target.id, d, c.get("user").id),
  ]);
  return c.json({ ok: true });
});

/** Set a temporary password; the person is asked to replace it on first sign-in. */
admin.post("/users/:id/password", async (c) => {
  const target = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?1").bind(c.req.param("id")).first<{ id: string }>();
  if (!target) throw new HttpError(404, "User not found");
  const { password } = (await c.req.json()) as { password?: string };
  validatePassword(password ?? "");
  await c.env.DB.prepare("UPDATE users SET password_hash = ?2, must_set_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?1").bind(target.id, await hashPassword(password!)).run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(target.id).run();
  return c.json({ ok: true });
});

admin.post("/users/:id/invite", async (c) => {
  const target = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(c.req.param("id")).first<User>();
  if (!target) throw new HttpError(404, "User not found");
  const r = await issueMagicLink(c.env, target.email);
  return c.json({ ok: true, sent: r.sent, devLink: r.devLink });
});

admin.delete("/users/:id", async (c) => {
  if (c.req.param("id") === c.get("user").id) throw new HttpError(400, "You can't remove yourself");
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

admin.get("/usage", async (c) => {
  const [byUser, byModel, recent, totals] = await Promise.all([
    c.env.DB.prepare("SELECT u.id, u.email, u.name, u.credit_limit, u.credits_used, u.period_start, COALESCE(SUM(l.delta),0) AS period_credits FROM users u LEFT JOIN credit_ledger l ON l.user_id = u.id AND l.created_at >= u.period_start AND l.reason != 'reset' GROUP BY u.id ORDER BY period_credits DESC").all(),
    c.env.DB.prepare("SELECT model, kind, COUNT(*) AS runs, COALESCE(SUM(actual_credits),0) AS credits, COALESCE(SUM(cost_usd),0) AS usd FROM generations WHERE status = 'done' AND created_at >= date('now','-30 days') GROUP BY model, kind ORDER BY credits DESC").all(),
    c.env.DB.prepare("SELECT l.*, u.email FROM credit_ledger l JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 100").all(),
    c.env.DB.prepare("SELECT (SELECT COALESCE(SUM(cost_usd),0) FROM generations WHERE created_at >= date('now','start of month')) + (SELECT COALESCE(SUM(cost_usd),0) FROM analyses WHERE created_at >= date('now','start of month')) AS month_usd, (SELECT COUNT(*) FROM generations WHERE created_at >= date('now','start of month')) AS month_generations, (SELECT COUNT(*) FROM analyses WHERE created_at >= date('now','start of month')) AS month_analyses, (SELECT COUNT(*) FROM generations WHERE status IN ('queued','running')) AS in_flight").first(),
  ]);
  return c.json({ byUser: byUser.results, byModel: byModel.results, recent: recent.results, totals });
});

admin.get("/models", async (c) => {
  const refresh = c.req.query("refresh") === "1";
  return c.json({ models: await getCatalog(c.env, { force: refresh, includeDisabled: true }) });
});

admin.patch("/models/:id{.+}", async (c) => {
  const mid = c.req.param("id");
  const b = (await c.req.json()) as { enabled?: boolean; label?: string | null; featured?: boolean; price_override?: Record<string, number> | null; kind?: string };
  const existing = await c.env.DB.prepare("SELECT * FROM model_settings WHERE model_id = ?1").bind(mid).first<{ enabled: number; label: string | null; featured: number; price_override_json: string | null; kind: string | null }>();
  const enabled = b.enabled !== undefined ? (b.enabled ? 1 : 0) : (existing?.enabled ?? 1);
  const label = b.label !== undefined ? (b.label?.trim() || null) : (existing?.label ?? null);
  const featured = b.featured !== undefined ? (b.featured ? 1 : 0) : (existing?.featured ?? 0);
  const price = b.price_override !== undefined ? (b.price_override ? JSON.stringify(b.price_override) : null) : (existing?.price_override_json ?? null);
  await c.env.DB.prepare(
    "INSERT INTO model_settings (model_id, enabled, label, featured, price_override_json, kind) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(model_id) DO UPDATE SET enabled=?2, label=?3, featured=?4, price_override_json=?5, kind=COALESCE(?6, kind), updated_at=datetime('now')",
  ).bind(mid, enabled, label, featured, price, b.kind ?? existing?.kind ?? null).run();
  return c.json({ ok: true });
});

admin.get("/ledger", async (c) => {
  const uid = c.req.query("user_id");
  const rows = uid
    ? await c.env.DB.prepare("SELECT * FROM credit_ledger WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 300").bind(uid).all()
    : await c.env.DB.prepare("SELECT l.*, u.email FROM credit_ledger l JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 300").all();
  return c.json({ entries: rows.results });
});

export default admin;
