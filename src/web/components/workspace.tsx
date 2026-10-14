import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Copy, Download, ImagePlus, RotateCcw, Search, Trash2, X } from "lucide-react";
import type { Generation, ModelInfo, Preset } from "../../shared/types";
import { api, fileUrl, fmtCredits, parseJson, timeAgo } from "../lib/api";
import { useCopy } from "../lib/hooks";
import { Modal, Spinner, StatusPill } from "./ui";

/** A compact chip that opens a popover menu of options (duration, resolution, ratio, count…). */
export function ChipMenu<T extends string | number>({ icon, label, value, options, onChange, format }: { icon?: ReactNode; label?: string; value: T | undefined; options: T[]; onChange: (v: T) => void; format?: (v: T) => string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const f = format ?? ((v: T) => String(v));
  return (
    <div ref={ref} className="relative">
      <button type="button" className="cchip" onClick={() => setOpen((o) => !o)} title={label}>
        {icon}{value !== undefined ? f(value) : label}<ChevronDown size={12} className="opacity-60" />
      </button>
      {open && (
        <div className="menu left-0 top-[calc(100%+6px)]">
          {label && <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[.2em] muted">{label}</div>}
          {options.map((o) => <button key={String(o)} type="button" className={`menu-item ${o === value ? "on" : ""}`} onClick={() => { onChange(o); setOpen(false); }}>{f(o)}</button>)}
        </div>
      )}
    </div>
  );
}

/** Square upload tile (Start frame / End frame / Reference). */
export function FrameTile({ label, value, onChange, kind = "image" }: { label: string; value: string | null; onChange: (key: string | null) => void; kind?: "image" }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { const fd = new FormData(); fd.append("file", f); fd.append("kind", kind); const r = await api.form<{ key: string }>("/api/upload", fd); onChange(r.key); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <div className="tile" onClick={() => !value && ref.current?.click()}>
      {value ? (<>
        <img src={fileUrl(value)} alt="" />
        <button type="button" className="icon-btn absolute right-1.5 top-1.5 z-10 h-6 w-6 bg-black/70" onClick={(e) => { e.stopPropagation(); onChange(null); }}><X size={12} /></button>
        <span className="absolute bottom-1.5 left-1.5 z-10 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{label}</span>
      </>) : (<>{busy ? <Spinner /> : <ImagePlus size={20} />}<span>{label}</span></>)}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
    </div>
  );
}

const PROVIDER_ICON: Record<string, string> = { google: "G", openai: "O", anthropic: "A", "black-forest-labs": "F", bytedance: "S", alibaba: "W", kwaivgi: "K", "x-ai": "X", "meta-llama": "M" };

export function ModelBadge({ id }: { id: string }) {
  const p = id.split("/")[0];
  return <span className="grid h-5 w-5 place-items-center rounded-md bg-white/10 text-[10px] font-bold">{PROVIDER_ICON[p] ?? p[0]?.toUpperCase()}</span>;
}

export function priceLabel(m: ModelInfo): string {
  if (m.kind === "image") return m.pricing.per_image !== undefined ? `$${m.pricing.per_image.toFixed(3)} / image` : "";
  if (m.kind === "video") return m.pricing.per_second !== undefined ? `$${m.pricing.per_second.toFixed(2)} / sec` : "";
  return m.pricing.completion !== undefined ? `$${(m.pricing.completion * 1e6).toFixed(2)} / M tokens` : "";
}

/** Higgsfield-style model picker: a row in the panel that opens a searchable modal list. */
export function ModelRow({ models, value, onChange }: { models: ModelInfo[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const m = models.find((x) => x.id === value);
  const list = models.filter((x) => !q || `${x.name} ${x.id} ${x.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (<>
    <button type="button" className="panel-row w-full" onClick={() => setOpen(true)}>
      <span className="min-w-0 text-left">
        <span className="block text-[11px] muted">Model</span>
        <span className="flex items-center gap-2 text-sm font-semibold">{m && <ModelBadge id={m.id} />}<span className="truncate">{m?.name ?? "Choose a model"}</span>{m?.featured && <span className="badge">Top</span>}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 opacity-60" />
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="Choose a model">
      <div className="relative mb-3"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input pl-9" placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="max-h-[60vh] space-y-1 overflow-auto scrollbar-thin">
        {list.map((x) => (
          <button key={x.id} type="button" className={`menu-item ${x.id === value ? "on" : ""}`} onClick={() => { onChange(x.id); setOpen(false); }}>
            <span className="flex min-w-0 items-center gap-3">
              <ModelBadge id={x.id} />
              <span className="min-w-0"><span className="flex items-center gap-2 font-semibold text-white">{x.name}{x.featured && <span className="badge">Top</span>}</span><span className="block truncate text-xs muted">{x.description || x.id}</span></span>
            </span>
            <span className="shrink-0 text-xs muted">{priceLabel(x)}</span>
          </button>
        ))}
        {!list.length && <div className="p-3 text-sm muted">No models match. Admins enable models under Admin → Models.</div>}
      </div>
    </Modal>
  </>);
}

/** The "style" card at the top of the control panel: the active preset, or none. */
export function StyleCard({ preset, onChange, onClear }: { preset: Preset | null; onChange: () => void; onClear: () => void }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 ${preset?.cover_key ? "" : "cover-fallback"}`} style={{ minHeight: 112 }}>
      {preset?.cover_key && <img src={fileUrl(preset.cover_key)} className="absolute inset-0 h-full w-full object-cover" alt="" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="relative flex h-full min-h-[112px] flex-col justify-end p-3">
        <div className="display text-lg leading-none">{preset ? preset.name : "Freeform"}</div>
        <div className="text-[11px] text-white/70">{preset ? `${preset.kind} preset · ${preset.model.split("/").pop()}` : "No preset. Pick one to lock a look."}</div>
      </div>
      <div className="absolute right-2 top-2 flex gap-1">
        {preset && <button type="button" className="cchip !py-1 !text-[11px]" onClick={onClear}>Clear</button>}
        <button type="button" className="cchip !py-1 !text-[11px]" onClick={onChange}>Change</button>
      </div>
    </div>
  );
}

export type Gen = Generation & { user_email?: string; user_name?: string };

/** One item in the center feed: full-width media, or the text output. */
export function FeedItem({ g, active, onSelect }: { g: Gen; active: boolean; onSelect: () => void }) {
  const outputs = parseJson<{ key: string; mime: string }[]>(g.outputs_json, []);
  const pending = g.status === "queued" || g.status === "running";
  return (
    <div className={`feed-card fade-in cursor-pointer ${active ? "active" : ""}`} onClick={onSelect}>
      {g.kind !== "text" ? (
        <div className="relative">
          {pending && <div className="shimmer grid aspect-video place-items-center text-sm muted">{g.kind === "video" ? "Rendering… a few minutes" : "Generating…"}</div>}
          {g.status === "failed" && <div className="grid aspect-video place-items-center p-6 text-center text-sm text-red-200">{g.error}</div>}
          {g.status === "done" && outputs.length > 0 && (
            <div className={`grid gap-0.5 ${outputs.length > 1 ? "grid-cols-2" : ""}`}>
              {outputs.map((o) => o.mime.startsWith("video/")
                ? <video key={o.key} src={fileUrl(o.key)} controls playsInline className="w-full bg-black" />
                : <img key={o.key} src={fileUrl(o.key)} className="w-full object-cover" alt="" loading="lazy" />)}
            </div>
          )}
          <div className="absolute left-2 top-2 flex items-center gap-1.5"><StatusPill status={g.status} /></div>
        </div>
      ) : (
        <div className="p-4">
          {pending && <div className="shimmer h-20 rounded-xl" />}
          {g.status === "failed" && <div className="text-sm text-red-200">{g.error}</div>}
          {g.status === "done" && <div className="prose-out max-h-[480px] overflow-auto scrollbar-thin">{g.text_output}</div>}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] muted">
        <span className="flex items-center gap-2"><ModelBadge id={g.model} />{g.model.split("/").pop()}</span>
        <span>{fmtCredits(g.actual_credits ?? g.estimate_credits)} cr · {timeAgo(g.created_at)}{g.user_email ? ` · ${g.user_name || g.user_email.split("@")[0]}` : ""}</span>
      </div>
    </div>
  );
}

/** Right-hand metadata card for the selected generation. */
export function MetaCard({ g, onRerun, onDelete, onReuse }: { g: Gen; onRerun: () => void; onDelete: () => void; onReuse: () => void }) {
  const [copied, copy] = useCopy();
  const refs = parseJson<string[]>(g.input_keys_json, []);
  const params = parseJson<Record<string, unknown>>(g.params_json, {});
  const outputs = parseJson<{ key: string; mime: string }[]>(g.outputs_json, []);
  return (
    <div className="panel flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs font-semibold"><ModelBadge id={g.model} />{g.model.split("/").pop()}</span>
        <StatusPill status={g.status} />
      </div>
      <p className="prose-out max-h-56 overflow-auto text-[13px] scrollbar-thin">{g.prompt}</p>
      {typeof params.negative === "string" && params.negative && <p className="text-xs muted"><b>Avoid:</b> {params.negative}</p>}
      {refs.length > 0 && <div className="flex gap-1.5">{refs.map((k) => <img key={k} src={fileUrl(k)} className="h-10 w-10 rounded-md object-cover" alt="" />)}</div>}
      <div className="flex flex-wrap gap-1.5 text-[11px] muted">
        {Object.entries(params).filter(([k, v]) => !["negative", "system", "cover_for"].includes(k) && v !== "" && v !== undefined).map(([k, v]) => <span key={k} className="rounded-md bg-white/5 px-1.5 py-0.5">{k.replace(/_/g, " ")}: {String(v)}</span>)}
        <span className="rounded-md bg-white/5 px-1.5 py-0.5">{fmtCredits(g.actual_credits ?? g.estimate_credits)} credits{g.cost_usd !== null && g.cost_usd !== undefined ? ` · $${g.cost_usd.toFixed(3)}` : ""}</span>
      </div>
      {g.error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-200">{g.error}</div>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
        <button type="button" className="cchip" onClick={onRerun}><RotateCcw size={13} /> Rerun</button>
        <button type="button" className="cchip" onClick={onReuse}>Use prompt</button>
        <span className="ml-auto flex gap-1">
          <button type="button" className="icon-btn" title="Copy prompt" onClick={() => copy(g.prompt, g.id)}>{copied === g.id ? "✓" : <Copy size={14} />}</button>
          {g.text_output && <button type="button" className="icon-btn" title="Copy output" onClick={() => copy(g.text_output ?? "", `t${g.id}`)}>{copied === `t${g.id}` ? "✓" : "T"}</button>}
          {outputs.map((o, i) => <a key={o.key} className="icon-btn" title={`Download ${i + 1}`} href={fileUrl(o.key, true)}><Download size={14} /></a>)}
          <button type="button" className="icon-btn btn-danger" title="Delete" onClick={onDelete}><Trash2 size={14} /></button>
        </span>
      </div>
    </div>
  );
}
