import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Trash2, X } from "lucide-react";
import type { Estimate, Generation, Kind, ModelInfo } from "../../shared/types";
import { api, fileUrl, fmtCredits, parseJson, timeAgo } from "../lib/api";
import { useDebounced } from "../lib/hooks";
import { CopyButton, Spinner, StatusPill } from "./ui";

export function ModelPicker({ models, value, onChange }: { models: ModelInfo[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {models.map((m) => (
        <button key={m.id} type="button" className={`chip ${m.id === value ? "chip-on" : ""}`} onClick={() => onChange(m.id)} title={m.description ?? m.id}>
          {m.name}
          <span className="opacity-60">
            {m.kind === "image" && m.pricing.per_image !== undefined && ` · $${m.pricing.per_image.toFixed(3)}`}
            {m.kind === "video" && m.pricing.per_second !== undefined && ` · $${m.pricing.per_second.toFixed(2)}/s`}
            {(m.kind === "text" || m.kind === "analyze") && m.pricing.completion !== undefined && ` · $${(m.pricing.completion * 1e6).toFixed(1)}/M`}
          </span>
        </button>
      ))}
      {!models.length && <span className="muted text-sm">No models enabled. Ask an admin to enable some under Admin → Models.</span>}
    </div>
  );
}

export function useEstimate(req: { kind: Kind; model: string; prompt: string; params: Record<string, unknown>; reference_keys: string[]; count: number } | null) {
  const [est, setEst] = useState<Estimate | null>(null);
  const key = useDebounced(JSON.stringify(req), 350);
  useEffect(() => {
    const r = key ? (JSON.parse(key) as typeof req) : null;
    if (!r || !r.model) { setEst(null); return; }
    let live = true;
    api.post<Estimate>("/api/models/estimate", r).then((e) => { if (live) setEst(e); }).catch(() => { if (live) setEst(null); });
    return () => { live = false; };
  }, [key]);
  return est;
}

export function EstimateChip({ est, remaining }: { est: Estimate | null; remaining: number }) {
  if (!est) return <span className="chip opacity-60">Estimating…</span>;
  const over = est.credits > remaining;
  return (
    <span className={`chip ${over ? "border-red-400/50 text-red-200" : "chip-on"}`} title={`${est.breakdown.join(" · ")}${est.warning ? ` — ${est.warning}` : ""}`}>
      ≈ {fmtCredits(est.credits)} credits <span className="opacity-60">(${est.usd.toFixed(3)})</span>{over && " · over your limit"}
    </span>
  );
}

export function ReferenceUploader({ keys, onChange, max = 4, kind = "image", label = "Reference images" }: { keys: string[]; onChange: (k: string[]) => void; max?: number; kind?: "image" | "video"; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr(null);
    try {
      const next = [...keys];
      for (const f of Array.from(files).slice(0, max - keys.length)) {
        const fd = new FormData(); fd.append("file", f); fd.append("kind", kind);
        const r = await api.form<{ key: string }>("/api/upload", fd);
        next.push(r.key);
      }
      onChange(next);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <div>
      <div className="label">{label} <span className="opacity-60">({keys.length}/{max})</span></div>
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <div key={k} className="relative h-20 w-20 overflow-hidden rounded-xl border border-white/10">
            <img src={fileUrl(k)} className="h-full w-full object-cover" alt="" />
            <button type="button" className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70" onClick={() => onChange(keys.filter((x) => x !== k))}><X size={12} /></button>
          </div>
        ))}
        {keys.length < max && (
          <button type="button" className="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-white/20 text-white/60 hover:border-white/50 hover:text-white" onClick={() => ref.current?.click()} disabled={busy}>
            {busy ? <Spinner /> : <ImagePlus size={20} />}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
      {err && <div className="mt-1 text-xs text-red-300">{err}</div>}
    </div>
  );
}

export function GenerationCard({ g, onDelete, compact = false }: { g: Generation & { user_email?: string; user_name?: string }; onDelete?: (id: string) => void; compact?: boolean }) {
  const outputs = parseJson<{ key: string; mime: string }[]>(g.outputs_json, []);
  const params = parseJson<Record<string, unknown>>(g.params_json, {});
  const pending = g.status === "queued" || g.status === "running";
  return (
    <div className="glass fade-in overflow-hidden">
      {g.kind !== "text" && (
        <div className={`relative ${compact ? "aspect-square" : ""} bg-black/30`}>
          {pending && <div className={`shimmer ${compact ? "absolute inset-0" : "aspect-video"} grid place-items-center text-sm muted`}>{g.kind === "video" ? "Rendering video… this takes a few minutes" : "Generating…"}</div>}
          {g.status === "failed" && <div className={`${compact ? "absolute inset-0" : "aspect-video"} grid place-items-center p-4 text-center text-sm text-red-200`}>{g.error}</div>}
          {g.status === "done" && outputs.length > 0 && (
            <div className={`grid ${outputs.length > 1 && !compact ? "grid-cols-2" : ""} gap-0.5`}>
              {outputs.map((o) => o.mime.startsWith("video/")
                ? <video key={o.key} src={fileUrl(o.key)} controls playsInline className="w-full" />
                : <a key={o.key} href={fileUrl(o.key)} target="_blank" rel="noreferrer"><img src={fileUrl(o.key)} className={`w-full ${compact ? "aspect-square" : ""} object-cover`} alt={g.prompt.slice(0, 80)} loading="lazy" /></a>)}
            </div>
          )}
        </div>
      )}
      <div className="p-3">
        {g.kind === "text" && (
          <div className="mb-3">
            {pending && <div className="shimmer h-24 rounded-xl" />}
            {g.status === "failed" && <div className="text-sm text-red-200">{g.error}</div>}
            {g.status === "done" && <div className={`prose-out ${compact ? "max-h-40" : "max-h-[520px]"} overflow-auto scrollbar-thin`}>{g.text_output}</div>}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <StatusPill status={g.status} />
          <span className="text-[11px] muted">{g.model.split("/").pop()} · {fmtCredits(g.actual_credits ?? g.estimate_credits)} cr{g.actual_credits === null && pending ? " est." : ""} · {timeAgo(g.created_at)}{g.user_email ? ` · ${g.user_name || g.user_email.split("@")[0]}` : ""}</span>
        </div>
        {!compact && <p className="mt-2 line-clamp-3 text-xs muted" title={g.prompt}>{g.prompt}</p>}
        {!compact && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CopyButton text={g.prompt} id={`p-${g.id}`} label="Copy prompt" />
            {g.text_output && <CopyButton text={g.text_output} id={`t-${g.id}`} label="Copy output" />}
            {outputs.map((o, i) => <a key={o.key} className="btn btn-sm" href={fileUrl(o.key, true)}><Download size={14} /> {outputs.length > 1 ? `#${i + 1}` : "Download"}</a>)}
            {onDelete && <button className="btn btn-sm btn-ghost btn-danger" onClick={() => onDelete(g.id)}><Trash2 size={14} /></button>}
            {typeof params.aspect_ratio === "string" && <span className="chip opacity-70">{params.aspect_ratio}</span>}
            {typeof params.duration !== "undefined" && <span className="chip opacity-70">{String(params.duration)}s</span>}
          </div>
        )}
      </div>
    </div>
  );
}
