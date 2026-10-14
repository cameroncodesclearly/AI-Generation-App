import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Clock, Film, Image as ImageIcon, Layers, Monitor, Proportions, Save, Sparkles, Type, Volume2 } from "lucide-react";
import type { Generation, Kind, ModelInfo, Preset, PresetVariable } from "../../shared/types";
import { api, ApiError, fmtCredits, parseJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { useEstimate } from "../components/generation";
import { ChipMenu, FeedItem, FrameTile, MetaCard, ModelRow, StyleCard, type Gen } from "../components/workspace";
import { Field, Spinner, useToast } from "../components/ui";
import { PresetPickerModal, SavePresetModal } from "./Presets";

const KIND_META: Record<Kind, { title: string; icon: typeof ImageIcon; placeholder: string }> = {
  image: { title: "Image", icon: ImageIcon, placeholder: "Describe the frame: subject, lighting, lens, mood…" },
  video: { title: "Video", icon: Film, placeholder: "Describe the shot like a director: subject, action, camera move, light, sound…" },
  text: { title: "Copy & Ideas", icon: Type, placeholder: "Hooks, scripts, captions, concepts. Say platform, audience and tone…" },
};

export default function Create() {
  const { kind: kindParam } = useParams();
  const kind = (["image", "video", "text"].includes(kindParam ?? "") ? kindParam : "image") as Kind;
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { me, refresh } = useAuth();
  const [toast, say] = useToast();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [frames, setFrames] = useState<(string | null)[]>([null, null, null, null]);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [pickPreset, setPickPreset] = useState(false);
  const [savePreset, setSavePreset] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "team">("mine");

  // Load models per kind, seed from query params
  useEffect(() => {
    setModel(""); setParams({}); setFrames([null, null, null, null]); setCount(1); setPreset(null); setVars({});
    api.get<{ models: ModelInfo[] }>(`/api/models?kind=${kind}`).then((r) => { setModels(r.models); setModel(sp.get("model") ?? r.models[0]?.id ?? ""); }).catch((e) => say(e.message, "error"));
    const p = sp.get("prompt"); if (p) setPrompt(p);
    const pid = sp.get("preset");
    if (pid) api.get<{ preset: Preset }>(`/api/presets/${pid}`).then((r) => applyPreset(r.preset)).catch(() => say("Preset not found", "error"));
    if (p || pid) setSp({}, { replace: true });
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => models.find((x) => x.id === model), [models, model]);
  useEffect(() => {
    if (!m) return;
    setParams((prev) => {
      const next: Record<string, unknown> = { ...prev };
      if (m.options?.aspect_ratios?.length && !m.options.aspect_ratios.includes(String(prev.aspect_ratio))) next.aspect_ratio = m.options.aspect_ratios[0];
      if (m.options?.resolutions?.length && !m.options.resolutions.includes(String(prev.resolution))) next.resolution = m.options.resolutions[0];
      if (m.options?.durations?.length && !m.options.durations.includes(Number(prev.duration))) next.duration = m.options.durations[0];
      if (kind === "video" && m.options?.supports_audio && prev.generate_audio === undefined) next.generate_audio = true;
      if (kind === "text") { next.max_tokens = prev.max_tokens ?? 1500; next.temperature = prev.temperature ?? 0.8; }
      return next;
    });
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(p: Preset) {
    if (p.kind !== kind) { nav(`/create/${p.kind}?preset=${p.id}`); return; }
    setPreset(p); setModel(p.model); setNegative(p.negative ?? "");
    const pp = parseJson<Record<string, unknown>>(p.params_json, {});
    setParams((prev) => ({ ...prev, ...pp }));
    const defs = parseJson<PresetVariable[]>(p.variables_json, []);
    setVars(Object.fromEntries(defs.map((d) => [d.key, d.default ?? ""])));
    setPrompt("");
  }

  const defs = preset ? parseJson<PresetVariable[]>(preset.variables_json, []) : [];
  const renderedPrompt = preset ? preset.template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => vars[k] ?? "") + (prompt.trim() ? `\n\n${prompt.trim()}` : "") : prompt;
  const refKeys = frames.filter((f): f is string => !!f);
  const presetRefs = preset ? parseJson<string[]>(preset.reference_keys_json, []) : [];
  const est = useEstimate(model ? { kind, model, prompt: renderedPrompt, params: { ...params, negative }, reference_keys: [...presetRefs, ...refKeys], count } : null);
  const missing = defs.filter((d) => d.required && !String(vars[d.key] ?? "").trim()).map((d) => d.label);

  const feed = usePoll(() => api.get<{ generations: Gen[] }>(`/api/generations?kind=${kind}&scope=${scope}&limit=30`), 4000, true, [kind, scope]);
  const items = feed.data?.generations ?? [];
  const hasPending = items.some((g) => g.status === "queued" || g.status === "running");
  useEffect(() => { if (!hasPending) void refresh(); }, [hasPending]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = items.find((g) => g.id === selected) ?? items[0] ?? null;

  const run = async () => {
    if (!renderedPrompt.trim() || !model) return;
    if (missing.length) { say(`Fill in: ${missing.join(", ")}`, "error"); return; }
    setBusy(true);
    try {
      const body = { kind, model, prompt: renderedPrompt, negative: negative || undefined, params, reference_keys: [...presetRefs, ...refKeys], count, preset_id: preset?.id };
      const r = await api.post<{ generation: Generation }>("/api/generate", body);
      setSelected(r.generation.id); await feed.reload(); await refresh();
    } catch (e) { say(e instanceof ApiError ? e.message : String(e), "error"); } finally { setBusy(false); }
  };

  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));
  const K = KIND_META[kind];
  const over = est ? est.credits > (me?.remaining ?? 0) : false;

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px] lg:grid-cols-[300px_minmax(0,1fr)]">
      {toast}
      {/* ---- Left: control panel ---- */}
      <aside className="panel flex flex-col gap-3 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto scrollbar-thin">
        <StyleCard preset={preset} onChange={() => setPickPreset(true)} onClear={() => { setPreset(null); setVars({}); setNegative(""); }} />

        {kind === "video" && (
          <div className="grid grid-cols-2 gap-2">
            <FrameTile label="Start frame" value={frames[0]} onChange={(k) => setFrames((f) => [k, f[1], f[2], f[3]])} />
            <FrameTile label="End frame" value={frames[1]} onChange={(k) => setFrames((f) => [f[0], k, f[2], f[3]])} />
          </div>
        )}
        {kind === "image" && m?.options?.supports_reference && (
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => <FrameTile key={i} label={i === 0 ? "Reference" : `Ref ${i + 1}`} value={frames[i]} onChange={(k) => setFrames((f) => f.map((x, j) => (j === i ? k : x)))} />)}
          </div>
        )}

        {defs.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[.2em] muted">Preset inputs</div>
            {defs.map((d) => (
              <Field key={d.key} label={`${d.label}${d.required ? " *" : ""}`} hint={d.help}>
                {d.type === "textarea" ? <textarea className="textarea !min-h-[70px]" rows={2} value={vars[d.key] ?? ""} onChange={(e) => setVars({ ...vars, [d.key]: e.target.value })} />
                  : d.type === "select" ? <select className="select" value={vars[d.key] ?? ""} onChange={(e) => setVars({ ...vars, [d.key]: e.target.value })}>{(d.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  : <input className="input" type={d.type === "number" ? "number" : "text"} value={vars[d.key] ?? ""} onChange={(e) => setVars({ ...vars, [d.key]: e.target.value })} />}
              </Field>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="mb-1 text-[11px] muted">{preset ? "Extra direction (optional)" : "Prompt"}</div>
          <textarea className="w-full resize-y bg-transparent text-sm leading-relaxed text-white outline-none placeholder:text-white/35" rows={kind === "text" ? 7 : 4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={preset ? "Anything to add on top of the preset…" : K.placeholder} />
        </div>
        {kind !== "text" && !preset && (
          <input className="input !py-2 text-xs" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="Avoid: text, watermark, blur…" />
        )}
        {kind === "text" && <input className="input !py-2 text-xs" value={String(params.system ?? "")} onChange={(e) => set("system", e.target.value)} placeholder="System instruction (optional)" />}

        <ModelRow models={models} value={model} onChange={setModel} />

        <div className="flex flex-wrap gap-1.5">
          {m?.options?.durations && <ChipMenu icon={<Clock size={13} />} label="Duration" value={Number(params.duration ?? m.options.durations[0])} options={m.options.durations} onChange={(v) => set("duration", v)} format={(v) => `${v}s`} />}
          {m?.options?.resolutions && <ChipMenu icon={<Monitor size={13} />} label="Resolution" value={String(params.resolution ?? m.options.resolutions[0])} options={m.options.resolutions} onChange={(v) => set("resolution", v)} />}
          {m?.options?.aspect_ratios && <ChipMenu icon={<Proportions size={13} />} label="Aspect ratio" value={String(params.aspect_ratio ?? m.options.aspect_ratios[0])} options={m.options.aspect_ratios} onChange={(v) => set("aspect_ratio", v)} />}
          {kind === "video" && m?.options?.supports_audio && <ChipMenu icon={<Volume2 size={13} />} label="Audio" value={params.generate_audio === false ? "Off" : "On"} options={["On", "Off"]} onChange={(v) => set("generate_audio", v === "On")} />}
          {kind === "text" && <ChipMenu label="Max tokens" value={Number(params.max_tokens ?? 1500)} options={[500, 1000, 1500, 3000, 6000]} onChange={(v) => set("max_tokens", v)} />}
          {kind === "text" && <ChipMenu label="Creativity" value={Number(params.temperature ?? 0.8)} options={[0.2, 0.5, 0.8, 1, 1.2]} onChange={(v) => set("temperature", v)} format={(v) => `temp ${v}`} />}
          <ChipMenu icon={<Layers size={13} />} label={kind === "video" ? "Clips" : "Variations"} value={count} options={kind === "video" ? [1, 2] : [1, 2, 3, 4]} onChange={setCount} format={(v) => `×${v}`} />
        </div>

        <button type="button" className="btn-generate" onClick={run} disabled={busy || !renderedPrompt.trim() || !model || over}>
          {busy ? <Spinner /> : <Sparkles size={16} />} Generate <span className="rounded-md bg-black/15 px-1.5 py-0.5 text-xs">✦ {est ? fmtCredits(est.credits) : "…"}</span>
        </button>
        <div className="flex items-center justify-between text-[11px] muted">
          <span>{over ? <span className="text-red-300">Over your remaining {fmtCredits(me?.remaining)} credits</span> : est ? `≈ $${est.usd.toFixed(3)} · ${est.breakdown[0]}` : ""}</span>
          <button type="button" className="hover:text-white" onClick={() => setSavePreset(true)} disabled={!renderedPrompt.trim()} title="Save as preset"><Save size={13} /></button>
        </div>
      </aside>

      {/* ---- Center: feed ---- */}
      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-semibold"><K.icon size={18} className="text-sun" /> {K.title}</h1>
          <div className="flex gap-1">{(["mine", "team"] as const).map((s) => <button key={s} className={`chip ${scope === s ? "chip-on" : ""}`} onClick={() => setScope(s)}>{s === "mine" ? "My generations" : "Team"}</button>)}</div>
        </div>
        <div className="space-y-3">
          {items.map((g) => <FeedItem key={g.id} g={g} active={current?.id === g.id} onSelect={() => setSelected(g.id)} />)}
          {!feed.loading && !items.length && <div className="panel grid min-h-[360px] place-items-center p-8 text-center"><div><div className="display text-3xl">Your canvas is empty</div><p className="muted mt-2 text-sm">Write a prompt on the left, pick a model, hit Generate.</p></div></div>}
        </div>
      </section>

      {/* ---- Right: metadata ---- */}
      <aside className="hidden xl:block lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        {current ? (
          <MetaCard g={current}
            onRerun={async () => { try { const r = await api.post<{ generation: Generation }>(`/api/generations/${current.id}/rerun`); setSelected(r.generation.id); void feed.reload(); void refresh(); } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } }}
            onDelete={async () => { if (!confirm("Delete this generation?")) return; await api.del(`/api/generations/${current.id}`); setSelected(null); void feed.reload(); }}
            onReuse={() => { setPrompt(current.prompt); setPreset(null); setModel(current.model); const p = parseJson<Record<string, unknown>>(current.params_json, {}); const { negative: n, count: c, ...rest } = p; setNegative(typeof n === "string" ? n : ""); setCount(typeof c === "number" ? c : 1); setParams(rest); }} />
        ) : <div className="panel p-4 text-sm muted">Select a generation to see its prompt, settings and actions.</div>}
      </aside>

      <PresetPickerModal open={pickPreset} kind={kind} onClose={() => setPickPreset(false)} onPick={(p) => { setPickPreset(false); applyPreset(p); }} />
      <SavePresetModal open={savePreset} onClose={() => setSavePreset(false)} seed={{ kind, model, template: renderedPrompt, negative, params, reference_keys: refKeys }} onSaved={() => { setSavePreset(false); say("Preset saved"); }} />
    </div>
  );
}
