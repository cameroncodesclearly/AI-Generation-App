import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Kind, ModelInfo, Preset } from "../../shared/types";
import { api, fileUrl, parseJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { Empty, Field, Modal, Spinner, useToast } from "../components/ui";
import type { Gen } from "../components/workspace";

type P = Preset & { author_name?: string; author_email?: string };

export default function Presets() {
  const { me } = useAuth();
  const [toast, say] = useToast();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [cat, setCat] = useState<string>("All");
  const list = usePoll(() => api.get<{ presets: P[] }>("/api/presets"), 30000, false);
  const looks = usePoll(() => api.get<{ generations: Gen[] }>("/api/generations?scope=team&status=done&limit=40"), 20000, false);
  const all = list.data?.presets ?? [];
  const cats = ["All", ...new Set(all.map((p) => p.category))];
  const presets = all.filter((p) => (kind === "all" || p.kind === kind) && (cat === "All" || p.category === cat) && (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q.toLowerCase())));
  const remove = async (p: P) => { if (!confirm(`Delete preset "${p.name}"?`)) return; await api.del(`/api/presets/${p.id}`); void list.reload(); say("Preset deleted"); };
  const fromPresets = (looks.data?.generations ?? []).filter((g) => g.preset_id);
  return (
    <div className="space-y-6">
      {toast}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="display text-5xl">Presets</h1><p className="muted text-sm">The team's looks. Pick one, fill the inputs, generate.</p></div>
        <Link to="/presets/new" className="btn btn-sun"><Plus size={16} /> New preset</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input w-56 pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="panel flex flex-wrap gap-1 p-1">{cats.map((c) => <button key={c} className={`chip !border-transparent ${cat === c ? "!bg-white !text-ink" : "!bg-transparent"}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="ml-auto flex gap-1">{(["all", "image", "video", "text"] as const).map((k) => <button key={k} className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>{k}</button>)}</div>
      </div>

      {/* Soul-style tag cloud: every preset as a tag */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => <Link key={p.id} to={`/create/${p.kind}?preset=${p.id}`} className="tag">{p.name}</Link>)}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {presets.map((p) => (
          <div key={p.id} className="panel glass-hover group relative overflow-hidden">
            <Link to={`/create/${p.kind}?preset=${p.id}`} className={`relative block aspect-square ${p.cover_key ? "" : "cover-fallback"}`}>
              {p.cover_key && <img src={fileUrl(p.cover_key)} className="h-full w-full object-cover" alt="" loading="lazy" />}
              <span className="pill absolute left-2 top-2 bg-black/50 text-white">{p.kind}</span>
              {p.runs > 5 && <span className="badge absolute right-2 top-2">Trending</span>}
              {p.visibility === "private" && <span className="pill absolute bottom-2 left-2 bg-black/50 text-white">private</span>}
            </Link>
            <div className="p-3">
              <div className="truncate font-semibold">{p.name}</div>
              <div className="muted line-clamp-2 min-h-[2lh] text-xs">{p.description || p.template.slice(0, 90)}</div>
              <div className="muted mt-2 text-[11px]">{p.model.split("/").pop()} · {p.runs} runs · {p.author_name || p.author_email?.split("@")[0] || "team"}</div>
              <div className="mt-3 flex gap-1.5">
                <Link to={`/create/${p.kind}?preset=${p.id}`} className="btn flex-1 !bg-white !text-ink">▶ Try now</Link>
                {(p.created_by === me?.user.id || me?.user.role === "admin") && (<>
                  <Link to={`/presets/${p.id}/edit`} className="btn"><Pencil size={13} /></Link>
                  <button className="btn btn-danger" onClick={() => void remove(p)}><Trash2 size={13} /></button>
                </>)}
              </div>
            </div>
          </div>
        ))}
      </div>
      {!list.loading && !presets.length && <Empty title="No presets yet"><p>Presets turn a great prompt into a reusable form the whole team can run. <Link to="/presets/new" className="text-sun underline">Build the first one</Link>, or save any prompt from the studio.</p></Empty>}

      {fromPresets.length > 0 && (
        <section>
          <h2 className="display mb-3 text-2xl">Made with presets</h2>
          <div className="masonry">
            {fromPresets.map((g) => {
              const out = parseJson<{ key: string; mime: string }[]>(g.outputs_json, [])[0];
              const p = all.find((x) => x.id === g.preset_id);
              return (
                <Link key={g.id} to={p ? `/create/${p.kind}?preset=${p.id}` : "/library"} className="feed-card glass-hover block">
                  {out ? (out.mime.startsWith("video/") ? <video src={fileUrl(out.key)} muted playsInline className="w-full" /> : <img src={fileUrl(out.key)} className="w-full" alt="" loading="lazy" />) : <div className="prose-out line-clamp-5 p-3 text-xs">{g.text_output}</div>}
                  <div className="truncate px-2.5 py-1.5 text-[11px] muted">{p?.name ?? "preset"} · {g.user_name || g.user_email?.split("@")[0]}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Picker used by the Create workspace's "Change" button. */
export function PresetPickerModal({ open, kind, onClose, onPick }: { open: boolean; kind: Kind; onClose: () => void; onPick: (p: Preset) => void }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState<P[]>([]);
  useEffect(() => { if (open) api.get<{ presets: P[] }>("/api/presets").then((r) => setAll(r.presets)).catch(() => {}); }, [open]);
  const list = useMemo(() => all.filter((p) => (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => Number(b.kind === kind) - Number(a.kind === kind) || b.runs - a.runs), [all, q, kind]);
  return (
    <Modal open={open} onClose={onClose} title="Choose a preset" wide>
      <div className="relative mb-3"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input pl-9" placeholder="Search presets" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="grid max-h-[65vh] gap-2 overflow-auto scrollbar-thin sm:grid-cols-3 lg:grid-cols-4">
        {list.map((p) => (
          <button key={p.id} type="button" className="panel glass-hover overflow-hidden text-left" onClick={() => onPick(p)}>
            <div className={`relative aspect-[4/3] ${p.cover_key ? "" : "cover-fallback"}`}>{p.cover_key && <img src={fileUrl(p.cover_key)} className="h-full w-full object-cover" alt="" />}<span className="pill absolute left-2 top-2 bg-black/50 text-white">{p.kind}</span></div>
            <div className="p-2.5"><div className="truncate text-sm font-semibold">{p.name}</div><div className="muted truncate text-[11px]">{p.category} · {p.model.split("/").pop()}</div></div>
          </button>
        ))}
        {!list.length && <div className="p-3 text-sm muted">No presets yet.</div>}
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
      const { count, ...params } = seed.params; void count;
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
        <div className="panel p-3 text-xs muted">Wrap the parts people should change in double braces, like <code className="text-sun">{"{{product}}"}</code>. {found.length ? <>Found: <b className="text-white">{found.join(", ")}</b>. </> : "No placeholders found, so this preset runs as-is. "}Refine inputs in the editor.</div>
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
