import { Hono } from "hono";
import type { Env, JobMessage } from "./env";
import { newApp, type AppEnv } from "./app";
import { currentUser } from "./lib/auth";
import { HttpError } from "./lib/util";
import { verifySignedFile } from "./lib/files";
import { pollVideo, runGeneration } from "./lib/jobs";
import { runAnalysis } from "./lib/analyze";
import auth from "./routes/auth";
import models from "./routes/models";
import generate from "./routes/generate";
import presets from "./routes/presets";
import analyze from "./routes/analyze";
import admin from "./routes/admin";

const app = newApp();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, ...(err.extra ?? {}) }, err.status as 400);
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true, app: c.env.APP_NAME, openrouter: !!c.env.OPENROUTER_API_KEY, email: !!c.env.RESEND_API_KEY, nas: !!c.env.NAS_ANALYZER_URL }));

app.route("/api/auth", auth);
app.route("/api/models", models);
app.route("/api", generate);
app.route("/api/presets", presets);
app.route("/api/analyses", analyze);
app.route("/api/admin", admin);

// --- File serving ---------------------------------------------------------
const files = new Hono<AppEnv>();

files.get("/signed/:key{.+}", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const ok = await verifySignedFile(c.env, key, c.req.query("exp") ?? "", c.req.query("sig") ?? "");
  if (!ok) return c.text("Link expired", 403);
  return serveObject(c.env, key, c.req.raw);
});

files.get("/:key{.+}", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Sign in required", 401);
  const key = decodeURIComponent(c.req.param("key"));
  // uploads are private to the uploader; outputs and covers are visible to the whole team
  if (key.startsWith("uploads/") && !key.startsWith(`uploads/${user.id}/`) && user.role !== "admin") return c.text("Forbidden", 403);
  return serveObject(c.env, key, c.req.raw);
});

async function serveObject(env: Env, key: string, req: Request): Promise<Response> {
  const range = req.headers.get("range");
  const obj = await env.FILES.get(key, range ? { range: req.headers } : undefined);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", key.startsWith("outputs/") || key.startsWith("covers/") ? "private, max-age=86400" : "private, max-age=3600");
  const name = obj.customMetadata?.filename;
  if (name && new URL(req.url).searchParams.has("download")) headers.set("content-disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
  if (range && obj.range) {
    const r = obj.range as { offset?: number; length?: number };
    const start = r.offset ?? 0; const len = r.length ?? obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set("content-length", String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}

app.route("/files", files);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const m = msg.body;
        if (m.type === "generation") await runGeneration(env, m.id);
        else if (m.type === "video_poll") await pollVideo(env, m.id, m.attempt);
        else if (m.type === "analysis") await runAnalysis(env, m.id);
        msg.ack();
      } catch (e) {
        console.error("job failed", msg.body, e);
        msg.retry({ delaySeconds: 30 });
      }
    }
  },

  /** Safety net: re-drive anything that looks stuck (lost queue message, worker restart). */
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const stuckVideo = await env.DB.prepare("SELECT id FROM generations WHERE kind = 'video' AND status = 'running' AND provider_job_id IS NOT NULL AND created_at < datetime('now','-3 minutes') AND created_at > datetime('now','-2 hours')").all<{ id: string }>();
    for (const g of stuckVideo.results) await env.JOBS.send({ type: "video_poll", id: g.id, attempt: 1 });
    const stale = await env.DB.prepare("SELECT id FROM generations WHERE status = 'queued' AND created_at < datetime('now','-5 minutes') AND created_at > datetime('now','-2 hours')").all<{ id: string }>();
    for (const g of stale.results) await env.JOBS.send({ type: "generation", id: g.id });
    const staleA = await env.DB.prepare("SELECT id FROM analyses WHERE status = 'queued' AND created_at < datetime('now','-5 minutes') AND created_at > datetime('now','-2 hours')").all<{ id: string }>();
    for (const a of staleA.results) await env.JOBS.send({ type: "analysis", id: a.id });
    // Expire old magic links & sessions
    await env.DB.batch([
      env.DB.prepare("DELETE FROM magic_links WHERE expires_at < datetime('now','-1 day')"),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    ]);
    // Give up on runs stuck > 2h
    await env.DB.prepare("UPDATE generations SET status = 'failed', error = 'Timed out', completed_at = datetime('now') WHERE status IN ('queued','running') AND created_at < datetime('now','-2 hours')").run();
    await env.DB.prepare("UPDATE analyses SET status = 'failed', error = 'Timed out', completed_at = datetime('now') WHERE status IN ('queued','running') AND created_at < datetime('now','-2 hours')").run();
  },
};
