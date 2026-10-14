import { newApp, requireAdmin, requireUser } from "../app";
import { listResearch, researchStatus, syncResearch, type ResearchItem } from "../lib/notion";
import { HttpError } from "../lib/util";

const research = newApp();
research.use("*", requireUser);

const slim = (r: ResearchItem) => { const { body, ...rest } = r; return { ...rest, has_transcript: /## Transcript/.test(body ?? "") }; };

research.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const types = (c.req.query("types") ?? "").split(",").filter(Boolean);
  const platforms = (c.req.query("platforms") ?? "").split(",").filter(Boolean);
  const items = await listResearch(c.env, { q, types, platforms, sort: c.req.query("sort"), limit: parseInt(c.req.query("limit") ?? "120", 10) });
  const all = (await c.env.DB.prepare("SELECT type, platform FROM research_items").all<{ type: string | null; platform: string | null }>()).results;
  const facet = (k: "type" | "platform") => Object.entries(all.reduce((m, r) => { const v = r[k]; if (v) m[v] = (m[v] ?? 0) + 1; return m; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return c.json({ items: items.map(slim), facets: { types: facet("type"), platforms: facet("platform") }, status: await researchStatus(c.env) });
});

research.get("/status", async (c) => c.json(await researchStatus(c.env)));

research.get("/:id", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM research_items WHERE page_id = ?1").bind(c.req.param("id")).first<ResearchItem>();
  if (!r) throw new HttpError(404, "Not found");
  return c.json({ item: r });
});

research.post("/sync", requireAdmin, async (c) => c.json(await syncResearch(c.env)));

export default research;
