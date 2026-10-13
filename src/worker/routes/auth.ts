import { newApp, requireUser, remaining } from "../app";
import { adminEmails, consumeMagicLink, createSession, createUser, destroySession, getUserByEmail, issueMagicLink } from "../lib/auth";
import { creditConfig } from "../lib/catalog";
import { HttpError } from "../lib/util";

const auth = newApp();

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
    user: u,
    remaining: remaining(u),
    config: { app_name: c.env.APP_NAME, credit_usd: usd, markup, nas_bridge: !!c.env.NAS_ANALYZER_URL, openrouter: !!c.env.OPENROUTER_API_KEY, email: !!c.env.RESEND_API_KEY },
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
