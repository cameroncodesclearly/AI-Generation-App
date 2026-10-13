import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, Play, Plus, Trash2, Wand2 } from "lucide-react";
import type { Generation, Kind, ModelInfo, Preset, PresetVariable } from "../../shared/types";
import { api, fileUrl, parseJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDebounced, usePoll } from "../lib/hooks";
import { Empty, Field, Modal, Spinner, useToast } from "../components/ui";
import { EstimateChip, GenerationCard, ReferenceUploader, useEstimate } from "../components/generation";

type P = Preset & { author_name?: string; author_email?: string };

export default function Presets() {
  const { me } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [toast, say] = useToast();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const list = usePoll(() => api.get<{ presets: P[] }>("/api/presets"), 30000, false);
  const runId = sp.get("run");
  const running = useMemo(() => list.data?.presets.find((p) => p.id === runId) ?? null, [list.data, runId]);
  const presets = (list.data?.presets ?? []).filter((p) => (kind === "all" || p.kind === kind) && (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q.toLowerCase())));
  const cats = [...new Set(presets.map((p) => p.category))];
  const remove = async (p: P) => {
    if (!confirm(`Delete preset "${p.name}"?`)) return;
    await api.del(`/api/presets/${p.id}`); void list.reload(); say("Preset deleted");
  };
  return (
    <div className="space-y-5">
      {toast}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow">Team library</div><h1 className="display text-4xl">Presets</h1></div>
        <Link to="/presets/new" className="btn btn-sun"><Plus size={16} /> New preset</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "image", "video", "text"] as const).map((k) => <button key={k} className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>{k}</button>)}
        <input className="input ml-auto max-w-xs" placeholder="Search presets…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {cats.map((cat) => (
        <section key={cat}>
          <h2 className="mb-2 text-sm font-semibold muted">{cat}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {presets.filter((p) => p.category === cat).map((p) => (
              <div key={p.id} className="glass glass-hover group relative overflow-hidden">
                <button className="block w-full text-left" onClick={() => setSp({ run: p.id })}>
                  <div className={`aspect-square ${p.cover_key ? "" : "cover-fallback"} relative`}>
                    {p.cover_key && <img src={fileUrl(p.cover_key)} className="h-full w-full object-cover" alt="" loading="lazy" />}
                    <span className="pill absolute left-2 top-2 bg-black/50 text-white">{p.kind}</span>
                    {p.visibility === "private" && <span className="pill absolute right-2 top-2 bg-black/50 text-white">private</span>}
                    <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"><span className="btn btn-sun"><Play size={16} /> Run</span></span>
                  </div>
                  <div className="p-3">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="muted line-clamp-2 text-xs">{p.description || p.template.slice(0, 90)}</div>
                    <div className="muted mt-2 text-[11px]">{p.model.split("/").pop()} · {p.runs} runs · {p.author_name || p.author_email?.split("@")[0] || "team"}</div>
                  </div>
                </button>
                {(p.created_by === me?.user.id || me?.user.role === "admin") && (
                  <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <Link to={`/presets/${p.id}/edit`} className="btn btn-sm"><Pencil size={13} /></Link>
                    <button className="btn btn-sm btn-danger" onClick={() => void remove(p)}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      {!list.loading && !presets.length && <Empty title="No presets yet"><p>Presets turn a great prompt into a reusable form the whole team can run. <Link to="/presets/new" className="text-sun underline">Build the first one</Link>, or save any prompt from the studio with the Preset button.</p></Empty>}
      {running && <RunPresetModal preset={running} onClose={() => setSp({})} />}
    </div>
  );
}

export function RunPresetModal({ preset, onClose }: { preset: Preset; onClose: () => void }) {
  const { me, refresh } = useAuth();
  const [toast, say] = useToast();
  const defs = parseJson<PresetVariable[]>(preset.variables_json, []);
  const [vars, setVars] = useState<Record<string, string>>(() => Object.fromEntries(defs.map((d) => [d.key, d.default ?? ""])));
  const [refs, setRefs] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [gens, setGens] = useState<Generation[]>([]);
  const dv = useDebounced(vars, 250);
  useEffect(() => { api.post<{ prompt: string }>(`/api/presets/${preset.id}/preview`, { variables: dv }).then((r) => setPreview(r.prompt)).catch(() => {}); }, [dv, preset.id]);
  const params = parseJson<Record<string, unknown>>(preset.params_json, {});
  const est = useEstimate({ kind: preset.kind, model: preset.model, prompt: preview, params, reference_keys: [...parseJson<string[]>(preset.reference_keys_json, []), ...refs], count });
  const pending = gens.some((g) => g.status === "queued" || g.status === "running");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const r = await api.get<{ generations: Generation[] }>(`/api/generations?ids=${gens.map((g) => g.id).join(",")}`);
      setGens(r.generations);
      if (!r.generations.some((g) => g.status === "queued" || g.status === "running")) void refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [pending, gens.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ generation: Generation }>(`/api/presets/${preset.id}/run`, { variables: vars, reference_keys: refs, count });
      setGens((g) => [r.generation, ...g]); void refresh();
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={preset.name} wide>
      {toast}
      <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          {preset.description && <p className="muted text-sm">{preset.description}</p>}
          {defs.map((d) => (
            <Field key={d.key} label={`${d.label}${d.required ? " *" : ""}`} hint={d.help}>
              {d.type === "textarea" ? <textarea className="textarea" rows={3} value={vars[d.key] ?? ""} onChange={(e) => setVars({ ...vars, [d.key]: e.target.value })} />
                : d.type === "select" ? <select className="select" value={vars[d.key] ?? ""} onChange={(e) => setVars({ ...vars, [d.key]: e.target.value })}>{(d.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : <input className="input" type={d.type === "number" ? "number" : "text"} value={vars[d.key] ?? ""} onChange={(e) => setVars({ ...vars, [d.key]: e.target.value })} />}
            </Field>
          ))}
          {!defs.length && <p className="muted text-sm">This preset has no inputs. Just run it.</p>}
          {preset.kind !== "text" && <ReferenceUploader keys={refs} onChange={setRefs} max={preset.kind === "video" ? 2 : 4} label={preset.kind === "video" ? "First frame (optional)" : "Extra references (optional)"} />}
          <div className="glass p-3">
            <div className="eyebrow mb-1">Final prompt</div>
            <div className="prose-out max-h-40 overflow-auto text-xs scrollbar-thin">{preview}</div>
            <div className="muted mt-2 text-[11px]">{preset.model} · {Object.entries(params).filter(([k]) => k !== "count").map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <EstimateChip est={est} remaining={me?.remaining ?? 0} />
            <div className="flex items-center gap-2">
              <select className="select w-20" value={count} onChange={(e) => setCount(Number(e.target.value))}>{(preset.kind === "video" ? [1, 2] : [1, 2, 3, 4]).map((n) => <option key={n} value={n}>×{n}</option>)}</select>
              <button className="btn btn-sun" onClick={run} disabled={busy || (est ? est.credits > (me?.remaining ?? 0) : false)}>{busy ? <Spinner /> : <Wand2 size={16} />} Run preset</button>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {gens.map((g) => <GenerationCard key={g.id} g={g} />)}
          {!gens.length && <div className="glass grid h-full min-h-48 place-items-center p-6 text-center text-sm muted">Results show up here.</div>}
        </div>
      </div>
    </Modal>
  );
}

/** Save the current studio prompt as a preset. Automatically turns {{placeholders}} into variables. */
export function SavePresetModal({ open, onClose, seed, onSaved }: { open: boolean; onClose: () => void; seed: { kind: Kind; model: string; template: string; negative?: string; params: Record<string, unknown>; reference_keys: string[] }; onSaved: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const found = [...new Set([...seed.template.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map((m) => m[1]))];
  const save = async (edit: boolean) => {
    setBusy(true); setErr(null);
    try {
      const { count, ...params } = seed.params;
      void count;
      const r = await api.post<{ preset: Preset }>("/api/presets", { name, description, category, visibility, kind: seed.kind, model: seed.model, template: seed.template, negative: seed.negative || undefined, params, reference_keys: seed.reference_keys, variables: found.map((k) => ({ key: k, label: k.replace(/[_-]+/g, " "), type: "text", required: true })) });
      onSaved();
      if (edit) nav(`/presets/${r.preset.id}/edit`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Save as preset">
      <div className="space-y-3">
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Golden hour product hero" autoFocus /></Field>
        <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When to use this and what it's good at" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
          <Field label="Visibility"><select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value as "team" | "private")}><option value="team">Whole team</option><option value="private">Only me</option></select></Field>
        </div>
        <div className="glass p-3 text-xs muted">
          Tip: wrap the parts people should change in double braces, like <code className="text-sun">{"{{product}}"}</code> or <code className="text-sun">{"{{scene}}"}</code>. {found.length ? <>Found: <b className="text-white">{found.join(", ")}</b>. </> : "No placeholders found, so this preset will run as-is. "}You can refine inputs in the editor.
        </div>
        {err && <div className="text-sm text-red-300">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => void save(true)} disabled={busy || !name.trim()}>Save & edit inputs</button>
          <button className="btn btn-sun" onClick={() => void save(false)} disabled={busy || !name.trim()}>{busy ? <Spinner /> : "Save preset"}</button>
        </div>
      </div>
    </Modal>
  );
}

export function useModels(kind: Kind) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => { api.get<{ models: ModelInfo[] }>(`/api/models?kind=${kind}`).then((r) => setModels(r.models)).catch(() => setModels([])); }, [kind]);
  return models;
}
