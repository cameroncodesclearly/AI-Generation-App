import { useEffect, useState } from "react";
import { BookMarked, Check, Search, X } from "lucide-react";
import type { Estimate, ResearchConfig, ResearchItem } from "../../shared/types";
import { api } from "../lib/api";
import { useDebounced } from "../lib/hooks";
import { Modal } from "./ui";
import { NotionLink } from "./Cost";

export const RESEARCH_TYPES = ["Compelling Hook", "Script Example", "Trend", "Unique Concept", "Viral Marketing", "Audio"];
export const compact = (n: number | null | undefined) => (n === null || n === undefined ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** Research controls for the Copy studio and text presets. */
export function ResearchPanel({ value, onChange, est, enabled }: { value: ResearchConfig | undefined; onChange: (v: ResearchConfig) => void; est: Estimate | null; enabled: boolean }) {
  const cfg: ResearchConfig = value ?? { mode: "off" };
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<ResearchConfig>) => onChange({ ...cfg, ...patch });
  const used = est?.research ?? [];
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.2em] muted"><BookMarked size={12} /> Social Research</div>
        <div className="seg !p-0.5">{(["off", "auto", "pick"] as const).map((m) => <button key={m} type="button" className={`!px-2.5 !py-1 !text-xs ${cfg.mode === m ? "on" : ""}`} disabled={!enabled && m !== "off"} onClick={() => set({ mode: m })}>{m === "off" ? "Off" : m === "auto" ? "Auto" : "Pick"}</button>)}</div>
      </div>
      {!enabled && <p className="text-xs muted">Not connected yet. An admin adds the Notion token to switch this on.</p>}
      {enabled && cfg.mode === "off" && <p className="text-xs muted">Turn on to ground hooks, scripts and strategy in the posts the team saved in Notion.</p>}
      {enabled && cfg.mode === "auto" && (
        <div className="space-y-2">
          <input className="input !py-1.5 text-xs" placeholder="Client or focus to favour, e.g. a client name" value={cfg.focus ?? ""} onChange={(e) => set({ focus: e.target.value })} />
          <div className="flex flex-wrap gap-1">{RESEARCH_TYPES.map((t) => { const on = cfg.types?.includes(t); return <button key={t} type="button" className={`tag !px-2 !py-1 !text-[10px] ${on ? "on" : ""}`} onClick={() => set({ types: on ? cfg.types!.filter((x) => x !== t) : [...(cfg.types ?? []), t] })}>{t}</button>; })}</div>
          <div className="flex items-center justify-between text-xs muted"><span>Entries to use</span><span className="stepper"><button type="button" onClick={() => set({ count: Math.max(1, (cfg.count ?? 6) - 1) })}>−</button><span>{cfg.count ?? 6}</span><button type="button" onClick={() => set({ count: Math.min(12, (cfg.count ?? 6) + 1) })}>+</button></span></div>
        </div>
      )}
      {enabled && cfg.mode === "pick" && <button type="button" className="btn btn-sm w-full" onClick={() => setPicking(true)}>{cfg.ids?.length ? `${cfg.ids.length} entries chosen · change` : "Choose entries"}</button>}
      {enabled && cfg.mode !== "off" && used.length > 0 && (
        <ol className="mt-2 max-h-40 space-y-1 overflow-auto text-xs scrollbar-thin">
          {used.map((r, n) => <li key={r.id} className="flex items-start gap-1.5"><span className="muted">R{n + 1}</span><span className="min-w-0 flex-1"><NotionLink url={r.url}><span className="line-clamp-1">{r.hook ?? "Untitled"}</span></NotionLink><span className="block text-[10px] muted">{[r.type, r.platform, r.views ? `${compact(r.views)} views` : ""].filter(Boolean).join(" · ")}</span></span></li>)}
        </ol>
      )}
      {enabled && cfg.mode === "auto" && est && !used.length && <p className="mt-2 text-xs muted">No entries match these filters.</p>}
      <ResearchPicker open={picking} selected={cfg.ids ?? []} onClose={() => setPicking(false)} onDone={(ids) => { set({ ids }); setPicking(false); }} />
    </div>
  );
}

export function ResearchPicker({ open, selected, onClose, onDone }: { open: boolean; selected: string[]; onClose: () => void; onDone: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>(selected);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const dq = useDebounced(q, 250);
  useEffect(() => { if (open) setSel(selected); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) api.get<{ items: ResearchItem[] }>(`/api/research?limit=80${dq ? `&q=${encodeURIComponent(dq)}` : ""}`).then((r) => setItems(r.items)).catch(() => {}); }, [open, dq]);
  return (
    <Modal open={open} onClose={onClose} title="Choose research entries" wide>
      <div className="relative mb-3"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input pl-9" placeholder="Search hooks, takeaways, clients…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="max-h-[55vh] space-y-1.5 overflow-auto scrollbar-thin">
        {items.map((i) => { const on = sel.includes(i.page_id); return (
          <button key={i.page_id} type="button" className={`panel-row w-full !items-start text-left ${on ? "!border-sun/60" : ""}`} onClick={() => setSel(on ? sel.filter((x) => x !== i.page_id) : [...sel, i.page_id].slice(0, 12))}>
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-sun bg-sun text-ink" : "border-white/20"}`}>{on && <Check size={12} />}</span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{i.hook ?? "Untitled"}</span><span className="block text-[11px] muted">{[i.type, i.platform, i.views ? `${compact(i.views)} views` : "", i.use_case ? `Use: ${i.use_case.slice(0, 80)}` : ""].filter(Boolean).join(" · ")}</span></span>
          </button>
        ); })}
        {!items.length && <div className="p-4 text-sm muted">No research yet. Admins can sync it from Notion on the Research page.</div>}
      </div>
      <div className="mt-3 flex items-center justify-between"><span className="text-xs muted">{sel.length}/12 selected</span><span className="flex gap-2"><button className="btn" onClick={() => setSel([])}><X size={14} /> Clear</button><button className="btn btn-sun" onClick={() => onDone(sel)}>Use {sel.length} entries</button></span></div>
    </Modal>
  );
}
