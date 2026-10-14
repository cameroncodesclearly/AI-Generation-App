import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, Check, ExternalLink, PenLine, RefreshCw, Search } from "lucide-react";
import type { ResearchItem } from "../../shared/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDebounced, usePoll } from "../lib/hooks";
import { Modal, Spinner, useToast } from "../components/ui";
import { compact, RESEARCH_TYPES } from "../components/research";
import { timeAgo } from "../lib/api";

type Item = ResearchItem & { has_transcript?: boolean };
type Resp = { items: Item[]; facets: { types: { name: string; count: number }[]; platforms: { name: string; count: number }[] }; status: { connected: boolean; items: number; last_sync: { at: string; total: number; updated: number } | null } };

export default function Research() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [toast, say] = useToast();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [platform, setPlatform] = useState("");
  const [sort, setSort] = useState("views");
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [syncing, setSyncing] = useState(false);
  const dq = useDebounced(q, 250);
  const url = `/api/research?limit=200&sort=${sort}${dq ? `&q=${encodeURIComponent(dq)}` : ""}${type ? `&types=${encodeURIComponent(type)}` : ""}${platform ? `&platforms=${encodeURIComponent(platform)}` : ""}`;
  const data = usePoll(() => api.get<Resp>(url), 60000, false, [url]);
  const items = data.data?.items ?? [];
  const st = data.data?.status;
  const types = useMemo(() => data.data?.facets.types.map((t) => t.name) ?? RESEARCH_TYPES, [data.data]);
  const sync = async () => { setSyncing(true); try { const r = await api.post<{ total: number; updated: number; removed: number }>("/api/research/sync"); say(`Synced ${r.total} entries from Notion (${r.updated} updated)`); void data.reload(); } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setSyncing(false); } };
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(0, 12)));

  return (
    <div className="space-y-4">
      {toast}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">Social Research</h1>
          <p className="muted text-sm">The posts the team saved in Notion. Copy runs use these to ground hooks, scripts and strategy.</p>
          <p className="mt-1 text-xs muted">{st?.connected ? `${st.items} entries · last synced ${st.last_sync ? timeAgo(st.last_sync.at) : "never"} · refreshes hourly` : "Notion isn't connected yet. Add NOTION_TOKEN to switch this on."}</p>
        </div>
        {me?.user.role === "admin" && st?.connected && <button className="btn" onClick={sync} disabled={syncing}>{syncing ? <Spinner /> : <RefreshCw size={14} />} Sync now</button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input !w-72 pl-9" placeholder="Search hooks, takeaways, clients" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select !w-44" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select className="select !w-36" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All platforms</option>{(data.data?.facets.platforms ?? []).map((p) => <option key={p.name} value={p.name}>{p.name} ({p.count})</option>)}</select>
        <div className="seg ml-auto">{[["views", "Most viewed"], ["grade", "Top graded"], ["recent", "Newest"]].map(([k, l]) => <button key={k} className={sort === k && !dq ? "on" : ""} onClick={() => setSort(k)} disabled={!!dq}>{l}</button>)}</div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => { const on = sel.includes(i.page_id); return (
          <div key={i.page_id} className={`panel flex flex-col gap-2 p-3 ${on ? "!border-sun/70" : ""}`}>
            <div className="flex items-start gap-2">
              <button type="button" aria-label="Select" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-sun bg-sun text-ink" : "border-white/25"}`} onClick={() => toggle(i.page_id)}>{on && <Check size={12} />}</button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(i)}><div className="line-clamp-2 font-semibold">{i.hook ?? "Untitled"}</div></button>
            </div>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {i.type && <span className="rounded-md bg-white/5 px-1.5 py-0.5">{i.type}</span>}
              {i.platform && <span className="rounded-md bg-white/5 px-1.5 py-0.5">{i.platform}</span>}
              {i.views ? <span className="rounded-md bg-white/5 px-1.5 py-0.5">{compact(i.views)} views</span> : null}
              {i.likes ? <span className="rounded-md bg-white/5 px-1.5 py-0.5">{compact(i.likes)} likes</span> : null}
              {i.grade !== null && <span className="rounded-md bg-sun/20 px-1.5 py-0.5 text-sun">grade {i.grade}</span>}
            </div>
            {i.use_case && <p className="line-clamp-2 text-xs"><span className="muted">Use: </span>{i.use_case}</p>}
            <p className="line-clamp-3 text-xs muted">{(i.summary ?? (i.ai_status === "Done" ? "" : "Not analyzed yet")).replace(/<br>/g, " ")}</p>
            <div className="mt-auto flex items-center justify-between text-[11px] muted"><span>{i.submitted_by ? `Saved by ${i.submitted_by}` : ""}</span>{i.url && <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">Notion <ExternalLink size={11} /></a>}</div>
          </div>
        ); })}
      </div>
      {!data.loading && !items.length && <div className="panel p-6 text-sm muted">{st?.connected ? "No entries match." : "Connect Notion to bring in the Social Research database."}</div>}

      {sel.length > 0 && (
        <div className="bar flex flex-wrap items-center justify-between gap-2 !py-2.5">
          <span className="text-sm"><b>{sel.length}</b> selected <button className="ml-2 text-xs muted hover:text-white" onClick={() => setSel([])}>clear</button></span>
          <button className="btn-generate !w-auto px-5" onClick={() => nav(`/create/text?research=${sel.join(",")}`)}><PenLine size={15} /> Write with these</button>
        </div>
      )}

      <ResearchDetail item={open} onClose={() => setOpen(null)} onUse={(id) => nav(`/create/text?research=${id}`)} />
    </div>
  );
}

function ResearchDetail({ item, onClose, onUse }: { item: Item | null; onClose: () => void; onUse: (id: string) => void }) {
  const full = usePoll(() => (item ? api.get<{ item: ResearchItem }>(`/api/research/${item.page_id}`) : Promise.resolve(null)), 600000, false, [item?.page_id]);
  if (!item) return null;
  const body = full.data?.item.body ?? "";
  return (
    <Modal open onClose={onClose} title={item.hook ?? "Research entry"} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {[item.type, item.platform, item.views ? `${compact(item.views)} views` : "", item.likes ? `${compact(item.likes)} likes` : "", item.comments ? `${compact(item.comments)} comments` : "", item.posted ? `posted ${item.posted.slice(0, 10)}` : ""].filter(Boolean).map((t) => <span key={t} className="chip">{t}</span>)}
        <span className="ml-auto flex gap-2">
          {item.link && <a className="btn btn-sm" href={item.link} target="_blank" rel="noreferrer">Original post <ExternalLink size={12} /></a>}
          {item.url && <a className="btn btn-sm" href={item.url} target="_blank" rel="noreferrer"><BookMarked size={13} /> Notion</a>}
          <button className="btn btn-sm btn-sun" onClick={() => onUse(item.page_id)}><PenLine size={13} /> Write with this</button>
        </span>
      </div>
      {item.use_case && <div className="panel mb-3 p-3 text-sm"><span className="muted">Team note on use: </span>{item.use_case}</div>}
      <div className="prose-out max-h-[55vh] overflow-auto text-sm scrollbar-thin">{full.loading ? <Spinner /> : body || (item.summary ?? "").replace(/<br>/g, "\n")}</div>
    </Modal>
  );
}
