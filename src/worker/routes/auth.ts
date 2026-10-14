import { newApp, requireUser, remaining } from "../app";
import { adminEmails, consumeMagicLink, createSession, createUser, destroySession, getUserByEmail, issueMagicLink, loginWithPassword, publicUser } from "../lib/auth";
import { hashPassword, validatePassword, verifyPassword } from "../lib/password";
import { allowedDomains, authUrl, exchangeCode, googleEnabled } from "../lib/google";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { token } from "../lib/util";
import { creditConfig } from "../lib/catalog";
import { HttpError } from "../lib/util";

const auth = newApp();

auth.get("/providers", (c) => c.json({ google: googleEnabled(c.env), email: !!c.env.RESEND_API_KEY || c.env.DEV_PRINT_MAGIC_LINK === "1" }));

auth.post("/request", async (c) => {
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const e = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, "Enter a valid email");
  let user = await getUserByEmail(c.env, e);
  if (!user) {
    if (!adminEmails(c.env).includes(e)) {
      // Do not reveal whether an account exists.
      return c.json({ ok: true, message: "If that address is on the team, a sign-in link is on its way." });
    }
    user = await createUser(c.env, e, { role: "admin" });
  }
  if (user.status !== "active") return c.json({ ok: true, message: "If that address is on the team, a sign-in link is on its way." });
  const r = await issueMagicLink(c.env, e);
  return c.json({ ok: true, message: r.sent ? "Check your inbox for the sign-in link." : "Dev mode: link printed to the worker console.", devLink: r.devLink });
});

auth.post("/login", async (c) => {
  const { email, password } = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !password) throw new HttpError(400, "Email and password are required");
  const user = await loginWithPassword(c.env, e, password);
  await createSession(c, user);
  return c.json({ ok: true, must_set_password: !!user.must_set_password });
});

auth.post("/password", requireUser, async (c) => {
  const u = c.get("user");
  const { password, current } = (await c.req.json()) as { password?: string; current?: string };
  validatePassword(password ?? "");
  const row = await c.env.DB.prepare("SELECT password_hash, must_set_password FROM users WHERE id = ?1").bind(u.id).first<{ password_hash: string | null; must_set_password: number }>();
  // Changing an existing password requires the current one, unless an admin issued a temporary password.
  if (row?.password_hash && !row.must_set_password) {
    if (!current || !(await verifyPassword(current, row.password_hash))) throw new HttpError(403, "Current password is incorrect");
  }
  await c.env.DB.prepare("UPDATE users SET password_hash = ?2, must_set_password = 0, failed_logins = 0, locked_until = NULL WHERE id = ?1").bind(u.id, await hashPassword(password!)).run();
  return c.json({ ok: true });
});

auth.get("/google", async (c) => {
  if (!googleEnabled(c.env)) throw new HttpError(503, "Google sign-in is not configured");
  const state = token();
  setCookie(c, "ccs_oauth_state", state, { httpOnly: true, secure: c.env.APP_URL.startsWith("https://"), sameSite: "Lax", path: "/api/auth", maxAge: 600 });
  return c.redirect(authUrl(c.env, state));
});

auth.get("/google/callback", async (c) => {
  const base = c.env.APP_URL.replace(/\/$/, "");
  try {
    if (!googleEnabled(c.env)) throw new HttpError(503, "Google sign-in is not configured");
    const state = c.req.query("state"); const code = c.req.query("code");
    const expected = getCookie(c, "ccs_oauth_state");
    deleteCookie(c, "ccs_oauth_state", { path: "/api/auth" });
    if (!code || !state || !expected || state !== expected) throw new HttpError(400, "Sign-in session expired. Try again.");
    const profile = await exchangeCode(c.env, code);
    const email = profile.email.toLowerCase();
    let user = await getUserByEmail(c.env, email);
    if (!user) {
      const domain = email.split("@")[1];
      const ok = adminEmails(c.env).includes(email) || allowedDomains(c.env).includes(domain);
      if (!ok) throw new HttpError(403, "This Google account isn't on the team yet. Ask an admin to invite you.");
      user = await createUser(c.env, email, { name: profile.name });
    }
    if (user.status !== "active") throw new HttpError(403, "This account is disabled.");
    await c.env.DB.prepare("UPDATE users SET google_sub = ?2, avatar_url = COALESCE(?3, avatar_url), name = COALESCE(name, ?4) WHERE id = ?1").bind(user.id, profile.sub, profile.picture ?? null, profile.name ?? null).run();
    await createSession(c, user);
    return c.redirect(`${base}/`);
  } catch (e) {
    return c.redirect(`${base}/login?error=${encodeURIComponent(e instanceof Error ? e.message : "Google sign-in failed")}`);
  }
});

auth.get("/verify", async (c) => {
  const tok = c.req.query("token") ?? "";
  const base = c.env.APP_URL.replace(/\/$/, "");
  try {
    const user = await consumeMagicLink(c.env, tok);
    await createSession(c, user);
    return c.redirect(`${base}/`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign-in failed";
    return c.redirect(`${base}/login?error=${encodeURIComponent(msg)}`);
  }
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

auth.get("/me", requireUser, async (c) => {
  const u = c.get("user");
  const { usd, markup } = creditConfig(c.env);
  return c.json({
    user: publicUser(u as unknown as Record<string, unknown>),
    remaining: remaining(u),
    config: { app_name: c.env.APP_NAME, credit_usd: usd, markup, nas_bridge: !!c.env.NAS_ANALYZER_URL, openrouter: !!c.env.OPENROUTER_API_KEY, email: !!c.env.RESEND_API_KEY, google: googleEnabled(c.env) },
  });
});

auth.patch("/me", requireUser, async (c) => {
  const { name } = (await c.req.json()) as { name?: string };
  await c.env.DB.prepare("UPDATE users SET name = ?2 WHERE id = ?1").bind(c.get("user").id, (name ?? "").trim().slice(0, 80) || null).run();
  return c.json({ ok: true });
});

auth.get("/ledger", requireUser, async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM credit_ledger WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200").bind(c.get("user").id).all();
  return c.json({ entries: rows.results });
});

export default auth;
