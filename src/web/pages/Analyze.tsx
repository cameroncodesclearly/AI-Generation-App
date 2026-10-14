import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Film, Link2, RefreshCw, Trash2, Upload } from "lucide-react";
import type { Analysis, Batch, Estimate, ModelInfo } from "../../shared/types";
import { api, fmtCredits, parseJson, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDebounced, usePoll } from "../lib/hooks";
import { CopyBlock, CopyButton, Field, Modal, Spinner, StatusPill, useToast } from "../components/ui";

export default function Analyze() {
  const { me, refresh } = useAuth();
  const [toast, say] = useToast();
  const [tab, setTab] = useState<"single" | "batch">("single");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [open, setOpen] = useState<Analysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("");
  const [rowsText, setRowsText] = useState("");

  useEffect(() => { api.get<{ models: ModelInfo[] }>("/api/models?kind=analyze").then((r) => { setModels(r.models); setModel(r.models[0]?.id ?? ""); }).catch(() => {}); }, []);
  const dnote = useDebounced(note, 300);
  useEffect(() => { if (!model) return; api.post<Estimate>("/api/models/estimate-analysis", { model, note: dnote }).then(setEst).catch(() => setEst(null)); }, [model, dnote]);

  const list = usePoll(() => api.get<{ analyses: Analysis[] }>("/api/analyses?limit=40"), 5000, true);
  const batches = usePoll(() => api.get<{ batches: Batch[] }>("/api/analyses/batches"), 6000, true);
  const pending = (list.data?.analyses ?? []).some((a) => a.status === "queued" || a.status === "running") || (batches.data?.batches ?? []).some((b) => (b.done ?? 0) + (b.failed ?? 0) < b.total);
  useEffect(() => { if (!pending) void refresh(); }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { const fresh = list.data?.analyses.find((a) => a.id === open.id); if (fresh && fresh.status !== open.status) setOpen(fresh); } }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!url.trim() && !file) return;
    setBusy(true);
    try {
      let file_key: string | undefined; let filename: string | undefined;
      if (file) {
        const fd = new FormData(); fd.append("file", file); fd.append("kind", "video");
        const r = await api.form<{ key: string; filename: string }>("/api/upload", fd);
        file_key = r.key; filename = r.filename;
      }
      const r = await api.post<{ analysis: Analysis }>("/api/analyses", { source_url: url.trim() || undefined, file_key, filename, note, model });
      setUrl(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
      say(`Queued · ${r.analysis.estimate_credits} credits reserved`); void list.reload(); void refresh();
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setBusy(false); }
  };

  const submitBatch = async () => {
    setBusy(true);
    try {
      let r: { batch_id: string; created: number; errors: string[] };
      if (csv) { const fd = new FormData(); fd.append("file", csv); fd.append("name", batchName || csv.name); if (model) fd.append("model", model); r = await api.form("/api/analyses/batch", fd); }
      else {
        const rows = rowsText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [u, ...rest] = l.split(/\s*[|\t]\s*|\s{2,}/); return { url: u, note: rest.join(" ") }; });
        r = await api.post("/api/analyses/batch", { name: batchName || "Batch", model, rows });
      }
      say(`Batch started: ${r.created} videos queued${r.errors.length ? `, ${r.errors.length} skipped` : ""}`);
      if (r.errors.length) console.warn(r.errors);
      setCsv(null); setRowsText(""); if (csvRef.current) csvRef.current.value = ""; void batches.reload(); void refresh();
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      {toast}
      <div><div className="eyebrow">Research</div><h1 className="display text-2xl">Analyze video</h1>
        <p className="muted mt-1 max-w-2xl text-sm">Drop in a social video and a note. Get a transcript, a summary, a scene-by-scene visual description, the hook, and caption ideas you can copy in one tap. Or upload a CSV and get a CSV back.</p>
        {!me?.config.nas_bridge && <p className="mt-2 text-xs text-sun/90">TikTok and Instagram links need the NAS analyzer bridge (not connected). Upload the file or use a direct .mp4 or YouTube link.</p>}
      </div>
      <div className="flex gap-2">{(["single", "batch"] as const).map((t) => <button key={t} className={`chip ${tab === t ? "chip-on" : ""}`} onClick={() => setTab(t)}>{t === "single" ? "One video" : "CSV batch"}</button>)}</div>

      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <div className="glass glass-strong space-y-4 p-5">
          {tab === "single" ? (<>
            <Field label="Video link"><div className="relative"><Link2 size={14} className="absolute left-3 top-3.5 muted" /><input className="input pl-8" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@…  or  https://youtu.be/…" disabled={!!file} /></div></Field>
            <div className="text-center text-xs muted">or</div>
            <div>
              <button type="button" className="glass flex w-full items-center justify-center gap-2 border-dashed p-4 text-sm hover:border-white/40" onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : "Upload a video file (mp4, mov, webm)"}
              </button>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <button className="btn btn-sm btn-ghost mt-1" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>Remove</button>}
            </div>
            <Field label="Note (what do you want to know?)"><textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this hook working? What's the editing rhythm? Pull every product mention." /></Field>
          </>) : (<>
            <Field label="Batch name"><input className="input" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Competitor hooks, Oct" /></Field>
            <div>
              <button type="button" className="glass flex w-full items-center justify-center gap-2 border-dashed p-4 text-sm hover:border-white/40" onClick={() => csvRef.current?.click()}>
                <FileSpreadsheet size={16} /> {csv ? csv.name : "Upload CSV with columns: url, note"}
              </button>
              <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setCsv(e.target.files?.[0] ?? null)} />
            </div>
            <div className="text-center text-xs muted">or paste links, one per line (optional note after a | )</div>
            <textarea className="textarea font-mono text-xs" rows={6} value={rowsText} onChange={(e) => setRowsText(e.target.value)} placeholder={"https://www.tiktok.com/@brand/video/1 | why does this hook land?\nhttps://youtu.be/abc"} disabled={!!csv} />
          </>)}
          <Field label="Model"><select className="select" value={model} onChange={(e) => setModel(e.target.value)}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span className="chip chip-on" title={est?.breakdown.join(" · ")}>≈ {fmtCredits(est?.credits)} credits / video</span>
            {tab === "single"
              ? <button className="btn btn-sun" onClick={submit} disabled={busy || (!url.trim() && !file)}>{busy ? <Spinner /> : <Film size={16} />} Analyze</button>
              : <button className="btn btn-sun" onClick={submitBatch} disabled={busy || (!csv && !rowsText.trim())}>{busy ? <Spinner /> : <FileSpreadsheet size={16} />} Run batch</button>}
          </div>
        </div>

        <div className="space-y-5">
          {tab === "batch" && (
            <section>
              <h2 className="mb-2 font-semibold">Batches</h2>
              <div className="space-y-2">
                {(batches.data?.batches ?? []).map((b) => {
                  const done = (b.done ?? 0) + (b.failed ?? 0);
                  return (
                    <div key={b.id} className="glass flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{b.name}</div><div className="muted text-xs">{done}/{b.total} processed{b.failed ? ` · ${b.failed} failed` : ""} · {timeAgo(b.created_at)}</div><div className="meter mt-2"><div style={{ width: `${b.total ? (done / b.total) * 100 : 0}%` }} /></div></div>
                      <a className="btn btn-sm" href={`/api/analyses/batches/${b.id}/export.csv`}><Download size={14} /> CSV</a>
                      <button className="btn btn-sm" onClick={async () => { const r = await api.get<{ analyses: Analysis[] }>(`/api/analyses?batch_id=${b.id}&limit=300`); list.setData({ analyses: r.analyses }); setTab("single"); }}>View</button>
                    </div>
                  );
                })}
                {!(batches.data?.batches ?? []).length && <div className="glass p-5 text-sm muted">No batches yet.</div>}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2 font-semibold">Results</h2>
            <div className="space-y-2">
              {(list.data?.analyses ?? []).map((a) => {
                const x = parseJson<Record<string, unknown>>(a.extras_json, {});
                return (
                  <div key={a.id} className="glass glass-hover cursor-pointer p-3" onClick={() => setOpen(a)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate text-sm font-semibold">{a.filename || a.source_url}</div>
                      <StatusPill status={a.status} />
                    </div>
                    <div className="muted mt-1 line-clamp-2 text-xs">{a.status === "failed" ? <span className="text-red-300">{a.error}</span> : a.summary || (a.status === "running" ? "Watching the video…" : a.note || "Queued")}</div>
                    <div className="muted mt-1 text-[11px]">{String(x.format ?? "")}{x.format ? " · " : ""}{fmtCredits(a.actual_credits ?? a.estimate_credits)} cr · {timeAgo(a.created_at)}</div>
                  </div>
                );
              })}
              {!list.loading && !(list.data?.analyses ?? []).length && <div className="glass p-5 text-sm muted">Analyses land here as they finish.</div>}
            </div>
          </section>
        </div>
      </div>
      {open && <AnalysisModal a={open} onClose={() => setOpen(null)} onChanged={() => void list.reload()} />}
    </div>
  );
}

function AnalysisModal({ a, onClose, onChanged }: { a: Analysis; onClose: () => void; onChanged: () => void }) {
  const x = parseJson<{ on_screen_text?: string; hook?: string; format?: string; key_moments?: string[]; caption_ideas?: string[]; hashtags?: string[]; note_response?: string; duration_seconds?: number | null; meta?: Record<string, unknown> }>(a.extras_json, {});
  const all = [`SOURCE: ${a.filename || a.source_url}`, a.note ? `NOTE: ${a.note}` : "", `FORMAT: ${x.format ?? ""}`, `HOOK:\n${x.hook ?? ""}`, `SUMMARY:\n${a.summary ?? ""}`, `TRANSCRIPT:\n${a.transcript ?? ""}`, `VISUAL DESCRIPTION:\n${a.visual ?? ""}`, x.on_screen_text ? `ON-SCREEN TEXT:\n${x.on_screen_text}` : "", x.key_moments?.length ? `KEY MOMENTS:\n${x.key_moments.join("\n")}` : "", x.caption_ideas?.length ? `CAPTION IDEAS:\n${x.caption_ideas.join("\n")}` : "", x.hashtags?.length ? `HASHTAGS: ${x.hashtags.map((h) => `#${h}`).join(" ")}` : "", x.note_response ? `ANSWER TO NOTE:\n${x.note_response}` : ""].filter(Boolean).join("\n\n");
  return (
    <Modal open onClose={onClose} title={a.filename || a.source_url || "Analysis"} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill status={a.status} />
        {x.format && <span className="chip">{x.format}</span>}
        {x.duration_seconds ? <span className="chip">{Math.round(Number(x.duration_seconds))}s</span> : null}
        <span className="chip">{fmtCredits(a.actual_credits ?? a.estimate_credits)} credits</span>
        <span className="ml-auto flex gap-2">
          <CopyButton text={all} id="all" label="Copy everything" />
          {a.status === "failed" && <button className="btn btn-sm" onClick={async () => { await api.post(`/api/analyses/${a.id}/retry`); onChanged(); onClose(); }}><RefreshCw size={14} /> Retry</button>}
          <button className="btn btn-sm btn-ghost btn-danger" onClick={async () => { if (confirm("Delete this analysis?")) { await api.del(`/api/analyses/${a.id}`); onChanged(); onClose(); } }}><Trash2 size={14} /></button>
        </span>
      </div>
      {a.status === "failed" && <div className="glass mb-3 border-red-400/30 p-3 text-sm text-red-200">{a.error}</div>}
      {(a.status === "queued" || a.status === "running") && <div className="shimmer mb-3 h-20 rounded-xl" />}
      {a.note && <div className="muted mb-3 text-sm"><b className="text-white">Note:</b> {a.note}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {x.note_response && <div className="md:col-span-2"><CopyBlock title="Answer to your note" text={x.note_response} /></div>}
        <CopyBlock title="Summary" text={a.summary ?? ""} />
        <CopyBlock title="Hook (first 3s)" text={x.hook ?? ""} />
        <CopyBlock title="Transcript" text={a.transcript ?? ""} />
        <CopyBlock title="Visual description" text={a.visual ?? ""} />
        {x.on_screen_text && <CopyBlock title="On-screen text" text={x.on_screen_text} />}
        {x.key_moments?.length ? <CopyBlock title="Key moments" text={x.key_moments.join("\n")} /> : null}
        {x.caption_ideas?.length ? <CopyBlock title="Caption ideas" text={x.caption_ideas.join("\n\n")} /> : null}
        {x.hashtags?.length ? <CopyBlock title="Hashtags" text={x.hashtags.map((h) => `#${h}`).join(" ")} /> : null}
      </div>
    </Modal>
  );
}
