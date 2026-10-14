import type { Env } from "../env";
import { HttpError, nowIso, safeJson } from "./util";

/**
 * Social Research integration.
 * The Notion database is synced into D1 (research_items) so retrieval is fast, free and works even if Notion is slow.
 * Needs a Notion internal integration token (NOTION_TOKEN) with the Social Research database shared to it.
 */

export interface ResearchItem {
  page_id: string; url: string | null; hook: string | null; type: string | null; platform: string | null;
  views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null;
  engagement: number | null; grade: number | null; success_score: number | null;
  use_case: string | null; notes: string | null; submitted_by: string | null; posted: string | null; link: string | null;
  ai_status: string | null; summary: string | null; body: string | null; edited_at: string | null; synced_at: string | null;
}

export interface ResearchConfig {
  mode?: "off" | "auto" | "pick";
  focus?: string;          // client or theme to boost, e.g. a client name
  types?: string[];        // Trend, Compelling Hook, Script Example, ...
  platforms?: string[];
  count?: number;          // auto mode: how many entries
  ids?: string[];          // pick mode: exact entries
}

export function notionEnabled(env: Env): boolean {
  return !!env.NOTION_TOKEN && !!(env.NOTION_RESEARCH_SOURCE || env.NOTION_RESEARCH_DB);
}

async function notionFetch(env: Env, path: string, init: RequestInit = {}, version = "2022-06-28", attempt = 0): Promise<Response> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": version, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 429 && attempt < 5) {
    const wait = Math.min(10, parseFloat(res.headers.get("retry-after") ?? "1") || 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return notionFetch(env, path, init, version, attempt + 1);
  }
  return res;
}

type NotionProp = { type: string; [k: string]: unknown };
type NotionPage = { id: string; url: string; last_edited_time: string; properties: Record<string, NotionProp> };

function rich(arr: unknown): string {
  return Array.isArray(arr) ? arr.map((t) => (t as { plain_text?: string }).plain_text ?? "").join("") : "";
}

/** Any Notion property value → plain text / number. */
function propValue(p: NotionProp | undefined): string | number | null {
  if (!p) return null;
  switch (p.type) {
    case "title": return rich(p.title) || null;
    case "rich_text": return rich(p.rich_text) || null;
    case "number": return (p.number as number | null) ?? null;
    case "select": return ((p.select as { name?: string } | null)?.name) ?? null;
    case "status": return ((p.status as { name?: string } | null)?.name) ?? null;
    case "multi_select": return ((p.multi_select as { name: string }[]) ?? []).map((o) => o.name).join(", ") || null;
    case "date": return ((p.date as { start?: string } | null)?.start) ?? null;
    case "url": return (p.url as string | null) ?? null;
    case "created_time": return (p.created_time as string) ?? null;
    case "formula": { const f = p.formula as { type: string; number?: number; string?: string; boolean?: boolean }; return f?.type === "number" ? f.number ?? null : f?.type === "string" ? f.string ?? null : null; }
    case "people": return ((p.people as { name?: string }[]) ?? []).map((x) => x.name).filter(Boolean).join(", ") || null;
    default: return null;
  }
}

function pick(props: Record<string, NotionProp>, ...names: string[]): string | number | null {
  for (const n of names) { const v = propValue(props[n]); if (v !== null && v !== "") return v; }
  return null;
}
const num = (v: string | number | null) => (typeof v === "number" ? v : v !== null && !isNaN(Number(v)) ? Number(v) : null);
const str = (v: string | number | null) => (v === null ? null : String(v));

function mapPage(page: NotionPage): Omit<ResearchItem, "body" | "synced_at"> {
  const p = page.properties;
  const titleProp = Object.values(p).find((x) => x.type === "title");
  return {
    page_id: page.id, url: page.url, edited_at: page.last_edited_time,
    hook: str(pick(p, "Hook")) ?? str(propValue(titleProp)),
    type: str(pick(p, "Type")), platform: str(pick(p, "Platform")),
    views: num(pick(p, "Views")), likes: num(pick(p, "Likes")), comments: num(pick(p, "Comments")),
    shares: num(pick(p, "Shares")), saves: num(pick(p, "Saves")), engagement: num(pick(p, "Engagement")),
    grade: num(pick(p, "Grade")), success_score: num(pick(p, "Success Score")),
    use_case: str(pick(p, "Use Case")), notes: str(pick(p, "Notes")),
    submitted_by: str(pick(p, "Person who submitted")), posted: str(pick(p, "Posted")),
    link: str(pick(p, "Link")), ai_status: str(pick(p, "AI Status")), summary: str(pick(p, "AI Summary")),
  };
}

async function queryAll(env: Env): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  // Prefer the data-source endpoint (current API); fall back to the classic database endpoint.
  let mode: "source" | "db" = env.NOTION_RESEARCH_SOURCE ? "source" : "db";
  for (let guard = 0; guard < 50; guard++) {
    const body = JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    let res = mode === "source"
      ? await notionFetch(env, `/data_sources/${env.NOTION_RESEARCH_SOURCE}/query`, { method: "POST", body }, "2025-09-03")
      : await notionFetch(env, `/databases/${env.NOTION_RESEARCH_DB}/query`, { method: "POST", body });
    if (!res.ok && mode === "source" && env.NOTION_RESEARCH_DB && !cursor) {
      mode = "db";
      res = await notionFetch(env, `/databases/${env.NOTION_RESEARCH_DB}/query`, { method: "POST", body });
    }
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new HttpError(502, `Notion ${res.status}: ${msg.slice(0, 200)}. Check NOTION_TOKEN and that the Social Research database is shared with the integration.`);
    }
    const j = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
    pages.push(...j.results.filter((r) => r.properties));
    if (!j.has_more || !j.next_cursor) break;
    cursor = j.next_cursor;
  }
  return pages;
}

/** Page body → compact text (the AI breakdown, on-screen notes and transcript the research app writes there). */
async function pageBody(env: Env, pageId: string): Promise<string> {
  const res = await notionFetch(env, `/blocks/${pageId}/children?page_size=100`);
  if (!res.ok) return "";
  const j = (await res.json()) as { results: { type: string; [k: string]: unknown }[] };
  const lines: string[] = [];
  for (const b of j.results) {
    const block = b[b.type] as { rich_text?: unknown } | undefined;
    const t = rich(block?.rich_text).trim();
    if (!t) continue;
    if (b.type.startsWith("heading")) lines.push(`\n## ${t}`);
    else if (b.type === "bulleted_list_item" || b.type === "numbered_list_item") lines.push(`- ${t}`);
    else lines.push(t);
  }
  return lines.join("\n").trim().slice(0, 12000);
}

export async function syncResearch(env: Env): Promise<{ total: number; updated: number; removed: number }> {
  if (!notionEnabled(env)) throw new HttpError(503, "Notion is not connected (NOTION_TOKEN and NOTION_RESEARCH_SOURCE / NOTION_RESEARCH_DB)");
  const started = nowIso();
  const pages = await queryAll(env);
  const existing = new Map((await env.DB.prepare("SELECT page_id, edited_at FROM research_items").all<{ page_id: string; edited_at: string }>()).results.map((r) => [r.page_id, r.edited_at]));
  let updated = 0;
  for (const page of pages) {
    const m = mapPage(page);
    const changed = existing.get(page.id) !== page.last_edited_time;
    if (!changed) {
      await env.DB.prepare("UPDATE research_items SET synced_at = ?2 WHERE page_id = ?1").bind(page.id, started).run();
      continue;
    }
    const body = await pageBody(env, page.id);
    await env.DB.prepare(
      `INSERT INTO research_items (page_id,url,hook,type,platform,views,likes,comments,shares,saves,engagement,grade,success_score,use_case,notes,submitted_by,posted,link,ai_status,summary,body,edited_at,synced_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)
       ON CONFLICT(page_id) DO UPDATE SET url=?2,hook=?3,type=?4,platform=?5,views=?6,likes=?7,comments=?8,shares=?9,saves=?10,engagement=?11,grade=?12,success_score=?13,use_case=?14,notes=?15,submitted_by=?16,posted=?17,link=?18,ai_status=?19,summary=?20,body=?21,edited_at=?22,synced_at=?23`,
    ).bind(m.page_id, m.url, m.hook, m.type, m.platform, m.views, m.likes, m.comments, m.shares, m.saves, m.engagement, m.grade, m.success_score, m.use_case, m.notes, m.submitted_by, m.posted, m.link, m.ai_status, m.summary, body, m.edited_at, started).run();
    updated++;
  }
  const removed = (await env.DB.prepare("DELETE FROM research_items WHERE synced_at < ?1").bind(started).run()).meta.changes ?? 0;
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('research_synced_at', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(JSON.stringify({ at: started, total: pages.length, updated, removed })).run();
  return { total: pages.length, updated, removed };
}

export async function researchStatus(env: Env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'research_synced_at'").first<{ value: string }>();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM research_items").first<{ n: number }>();
  return { connected: notionEnabled(env), items: count?.n ?? 0, last_sync: safeJson<{ at: string; total: number; updated: number; removed: number } | null>(row?.value, null) };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------
const STOP = new Set("a an and are as at be but by for from has have how i in into is it its me my of on or our so that the their them then this to was we what when where which who why will with you your write video videos make about give create short shorts reel reels tiktok instagram hook hooks script scripts caption captions idea ideas content post posts second seconds 30s 60s".split(" "));

export function tokenize(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []).filter((w) => !STOP.has(w)))].slice(0, 40);
}

function perf(i: ResearchItem): number {
  return Math.log10((i.views ?? 0) + 1) * 0.6 + (i.grade ?? 0) * 0.25 + (i.ai_status === "Done" ? 1 : 0);
}

export function scoreItem(i: ResearchItem, tokens: string[], focus: string[]): number {
  const hook = (i.hook ?? "").toLowerCase(); const uc = `${i.use_case ?? ""} ${i.notes ?? ""}`.toLowerCase();
  const sum = (i.summary ?? "").toLowerCase(); const body = (i.body ?? "").toLowerCase().slice(0, 4000);
  let s = 0;
  for (const t of tokens) { if (hook.includes(t)) s += 3; if (uc.includes(t)) s += 2.5; if (sum.includes(t)) s += 1; if (body.includes(t)) s += 0.4; }
  for (const f of focus) { if (uc.includes(f)) s += 6; if (hook.includes(f) || sum.includes(f)) s += 2; }
  return s;
}

export async function listResearch(env: Env, opts: { q?: string; types?: string[]; platforms?: string[]; sort?: string; limit?: number } = {}): Promise<ResearchItem[]> {
  const rows = (await env.DB.prepare("SELECT * FROM research_items").all<ResearchItem>()).results;
  let list = rows.filter((r) => (!opts.types?.length || opts.types.includes(r.type ?? "")) && (!opts.platforms?.length || opts.platforms.includes(r.platform ?? "")));
  const tokens = tokenize(opts.q ?? "");
  if (tokens.length) {
    const scored = list.map((r) => ({ r, s: scoreItem(r, tokens, []) })).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s || perf(b.r) - perf(a.r));
    list = scored.map((x) => x.r);
  } else if (opts.sort === "grade") list.sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1) || (b.views ?? 0) - (a.views ?? 0));
  else if (opts.sort === "recent") list.sort((a, b) => String(b.posted ?? b.edited_at ?? "").localeCompare(String(a.posted ?? a.edited_at ?? "")));
  else list.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return list.slice(0, Math.min(500, opts.limit ?? 120));
}

/** Choose the research entries for a generation. Deterministic for a given prompt + config so the estimate matches the run. */
export async function selectResearch(env: Env, prompt: string, cfg: ResearchConfig | undefined): Promise<ResearchItem[]> {
  if (!cfg || !cfg.mode || cfg.mode === "off") return [];
  if (cfg.mode === "pick") {
    const ids = (cfg.ids ?? []).slice(0, 12);
    if (!ids.length) return [];
    const rows = (await env.DB.prepare(`SELECT * FROM research_items WHERE page_id IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`).bind(...ids).all<ResearchItem>()).results;
    return ids.map((id) => rows.find((r) => r.page_id === id)).filter((r): r is ResearchItem => !!r);
  }
  const count = Math.max(1, Math.min(12, Number(cfg.count ?? 6)));
  const rows = (await env.DB.prepare("SELECT * FROM research_items").all<ResearchItem>()).results
    .filter((r) => (!cfg.types?.length || cfg.types.includes(r.type ?? "")) && (!cfg.platforms?.length || cfg.platforms.includes(r.platform ?? "")));
  const tokens = tokenize(prompt);
  const focus = tokenize(cfg.focus ?? "");
  const scored = rows.map((r) => ({ r, s: scoreItem(r, tokens, focus) }));
  const anyMatch = scored.some((x) => x.s > 0);
  scored.sort((a, b) => (anyMatch ? b.s - a.s : 0) || perf(b.r) - perf(a.r));
  return scored.slice(0, count).map((x) => x.r);
}

const fmtN = (n: number | null) => (n === null ? null : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export function formatResearch(items: ResearchItem[]): string {
  if (!items.length) return "";
  const blocks = items.map((i, n) => {
    const stats = [fmtN(i.views) && `${fmtN(i.views)} views`, fmtN(i.likes) && `${fmtN(i.likes)} likes`, i.grade !== null && `team grade ${i.grade}/10`].filter(Boolean).join(", ");
    const transcript = /## Transcript\n([\s\S]*)/.exec(i.body ?? "")?.[1]?.trim();
    const lines = [
      `[R${n + 1}] "${(i.hook ?? "Untitled").slice(0, 160)}" · ${i.type ?? "Research"} · ${i.platform ?? "unknown platform"}${stats ? ` · ${stats}` : ""}${i.posted ? ` · posted ${i.posted.slice(0, 10)}` : ""}`,
      i.use_case ? `Team note on use: ${i.use_case.slice(0, 280)}` : "",
      i.summary ? `Why it works: ${i.summary.replace(/<br>/g, "\n").slice(0, 900)}` : "",
      transcript && transcript !== "No speech detected." ? `Transcript excerpt: ${transcript.slice(0, 400)}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  });
  return `SOCIAL RESEARCH (from the team's Notion "Social Research" database; real posts the team saved because they performed):\n\n${blocks.join("\n\n")}\n\nUse these as evidence. Adapt the patterns (hook structure, pacing, format, emotional pull) to the brief rather than copying lines. When you borrow a pattern, cite it inline like [R2]. If none of the research fits the brief, say so briefly and proceed.`;
}
