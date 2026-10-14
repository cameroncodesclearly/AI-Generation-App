import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import type { ModelInfo, Preset } from "../../shared/types";
import { api, fileUrl, parseJson } from "../lib/api";
import { useDebounced } from "../lib/hooks";
import { ModelBadge, type Gen } from "./workspace";

export default function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "models" | "presets" | "generations">("all");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [gens, setGens] = useState<Gen[]>([]);
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (!open) return;
    setQ("");
    api.get<{ models: ModelInfo[] }>("/api/models").then((r) => setModels(r.models)).catch(() => {});
    api.get<{ presets: Preset[] }>("/api/presets").then((r) => setPresets(r.presets)).catch(() => {});
  }, [open]);
  useEffect(() => {
    if (!open) return;
    api.get<{ generations: Gen[] }>(`/api/generations?scope=team&status=done&limit=12${dq ? `&q=${encodeURIComponent(dq)}` : ""}`).then((r) => setGens(r.generations)).catch(() => {});
  }, [dq, open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  const ql = q.toLowerCase();
  const ms = useMemo(() => models.filter((m) => !ql || `${m.name} ${m.id} ${m.kind}`.toLowerCase().includes(ql)).slice(0, 8), [models, ql]);
  const ps = useMemo(() => presets.filter((p) => !ql || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(ql)).slice(0, 8), [presets, ql]);
  if (!open) return null;
  const go = (to: string) => { onClose(); nav(to); };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm sm:p-10" onClick={onClose}>
      <div className="panel mx-auto max-w-3xl p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-3.5 muted" /><input className="input !py-3 pl-10 text-base" placeholder="Search models, presets, prompts…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
          <button className="icon-btn h-11 w-11" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="mt-2 flex gap-1.5">{(["all", "models", "presets", "generations"] as const).map((c) => <button key={c} className={`chip ${cat === c ? "chip-on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="mt-3 max-h-[60vh] space-y-4 overflow-auto scrollbar-thin">
          {(cat === "all" || cat === "models") && ms.length > 0 && <div><div className="mb-1 px-2 text-[11px] muted">Models</div>{ms.map((m) => <button key={`${m.kind}${m.id}`} className="menu-item" onClick={() => go(`/create/${m.kind === "analyze" ? "text" : m.kind}?model=${encodeURIComponent(m.id)}`)}><span className="flex items-center gap-3"><ModelBadge id={m.id} /><span><span className="flex items-center gap-2 font-semibold text-white">{m.name}{m.featured && <span className="badge">Top</span>}</span><span className="block text-xs muted">{m.description || m.id}</span></span></span><span className="text-xs muted">{m.kind}</span></button>)}</div>}
          {(cat === "all" || cat === "presets") && ps.length > 0 && <div><div className="mb-1 px-2 text-[11px] muted">Presets</div><div className="grid gap-2 sm:grid-cols-3">{ps.map((p) => <button key={p.id} className="panel glass-hover overflow-hidden text-left" onClick={() => go(`/create/${p.kind}?preset=${p.id}`)}><div className={`aspect-[16/9] ${p.cover_key ? "" : "cover-fallback"}`}>{p.cover_key && <img src={fileUrl(p.cover_key)} className="h-full w-full object-cover" alt="" />}</div><div className="p-2"><div className="truncate text-sm font-semibold">{p.name}</div><div className="truncate text-[11px] muted">{p.kind} · {p.category}</div></div></button>)}</div></div>}
          {(cat === "all" || cat === "generations") && gens.length > 0 && <div><div className="mb-1 px-2 text-[11px] muted">{dq ? "Matching prompts" : "Recent from the team"}</div><div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{gens.map((g) => { const o = parseJson<{ key: string; mime: string }[]>(g.outputs_json, [])[0]; return <button key={g.id} className="relative aspect-square overflow-hidden rounded-lg bg-white/5" title={g.prompt} onClick={() => go(`/library?scope=team&q=${encodeURIComponent(g.prompt.slice(0, 40))}`)}>{o ? (o.mime.startsWith("video/") ? <video src={fileUrl(o.key)} muted className="h-full w-full object-cover" /> : <img src={fileUrl(o.key)} className="h-full w-full object-cover" alt="" />) : <span className="line-clamp-4 p-2 text-[10px] muted">{g.text_output}</span>}</button>; })}</div></div>}
          {!ms.length && !ps.length && !gens.length && <div className="p-4 text-center text-sm muted">No matches.</div>}
        </div>
      </div>
    </div>
  );
}
