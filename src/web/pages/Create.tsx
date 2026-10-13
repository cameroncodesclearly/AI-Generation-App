import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Save, Sparkles, Wand2 } from "lucide-react";
import type { Generation, Kind, ModelInfo } from "../../shared/types";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { EstimateChip, GenerationCard, ModelPicker, ReferenceUploader, useEstimate } from "../components/generation";
import { Field, Spinner, useToast } from "../components/ui";
import { SavePresetModal } from "./Presets";

const titles: Record<Kind, { eyebrow: string; title: string; hint: string }> = {
  image: { eyebrow: "Image studio", title: "Make the frame", hint: "Describe subject, lighting, lens, mood. Add references to lock faces, products or style." },
  video: { eyebrow: "Video studio", title: "Make it move", hint: "Describe the shot like a director: subject, action, camera move, lighting, sound. Add a first-frame image for control." },
  text: { eyebrow: "Copy studio", title: "Write the words", hint: "Scripts, hooks, captions, concepts. Be specific about platform, audience and tone." },
};

export default function Create() {
  const { kind: kindParam } = useParams();
  const kind = (["image", "video", "text"].includes(kindParam ?? "") ? kindParam : "image") as Kind;
  const [sp, setSp] = useSearchParams();
  const { me, refresh } = useAuth();
  const [toast, say] = useToast();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState(sp.get("prompt") ?? "");
  const [negative, setNegative] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [refs, setRefs] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<string[]>([]);
  const [savePreset, setSavePreset] = useState(false);

  useEffect(() => {
    setModel(""); setParams({}); setRefs([]); setCount(1);
    api.get<{ models: ModelInfo[] }>(`/api/models?kind=${kind}`).then((r) => { setModels(r.models); setModel(sp.get("model") ?? r.models[0]?.id ?? ""); }).catch((e) => say(e.message, "error"));
    const p = sp.get("prompt"); if (p) { setPrompt(p); setSp({}, { replace: true }); }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => models.find((x) => x.id === model), [models, model]);
  useEffect(() => {
    if (!m) return;
    const next: Record<string, unknown> = {};
    if (m.options?.aspect_ratios?.length) next.aspect_ratio = m.options.aspect_ratios.includes(String(params.aspect_ratio)) ? params.aspect_ratio : m.options.aspect_ratios[0];
    if (m.options?.resolutions?.length) next.resolution = m.options.resolutions.includes(String(params.resolution)) ? params.resolution : m.options.resolutions[0];
    if (m.options?.durations?.length) next.duration = m.options.durations.includes(Number(params.duration)) ? params.duration : m.options.durations[0];
    if (kind === "video" && m.options?.supports_audio) next.generate_audio = params.generate_audio ?? true;
    if (kind === "text") { next.max_tokens = params.max_tokens ?? 1500; next.temperature = params.temperature ?? 0.8; }
    setParams(next);
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const est = useEstimate(model ? { kind, model, prompt, params, reference_keys: refs, count } : null);
  const feed = usePoll(() => api.get<{ generations: Generation[] }>(`/api/generations?kind=${kind}&limit=24`), 4000, true, [kind]);
  const hasPending = (feed.data?.generations ?? []).some((g) => g.status === "queued" || g.status === "running");
  useEffect(() => { if (!hasPending) void refresh(); }, [hasPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    if (!prompt.trim() || !model) return;
    setBusy(true);
    try {
      const r = await api.post<{ generation: Generation }>("/api/generate", { kind, model, prompt, negative: negative || undefined, params, reference_keys: refs, count });
      setMine((x) => [r.generation.id, ...x]);
      await feed.reload(); await refresh();
      say(`Queued · ${r.generation.estimate_credits} credits reserved`);
    } catch (e) {
      say(e instanceof ApiError ? e.message : String(e), "error");
    } finally { setBusy(false); }
  };

  const t = titles[kind];
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      {toast}
      <div className="space-y-4">
        <div>
          <div className="eyebrow">{t.eyebrow}</div>
          <h1 className="display text-4xl">{t.title}</h1>
        </div>
        <div className="glass glass-strong space-y-4 p-5">
          <Field label="Model"><ModelPicker models={models} value={model} onChange={setModel} /></Field>
          <Field label="Prompt" hint={t.hint}>
            <textarea className="textarea" rows={kind === "text" ? 8 : 5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={kind === "video" ? "Slow dolly-in on a chrome espresso machine at golden hour, steam catching the light, shallow depth of field, 35mm, ambient café sound…" : kind === "image" ? "Editorial product shot of a matte black water bottle on wet slate, dramatic rim light, fog, 85mm, shallow depth of field…" : "Write 10 scroll-stopping hooks for a 30s TikTok about…"} />
          </Field>
          {kind !== "text" && (
            <Field label="Avoid (optional)"><input className="input" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="text, watermark, extra fingers, blur" /></Field>
          )}
          {m?.options?.aspect_ratios && (
            <Field label="Aspect ratio"><div className="flex flex-wrap gap-2">{m.options.aspect_ratios.map((a) => <button key={a} type="button" className={`chip ${params.aspect_ratio === a ? "chip-on" : ""}`} onClick={() => set("aspect_ratio", a)}>{a}</button>)}</div></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            {m?.options?.resolutions && (
              <Field label="Resolution"><select className="select" value={String(params.resolution ?? "")} onChange={(e) => set("resolution", e.target.value)}>{m.options.resolutions.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
            )}
            {m?.options?.durations && (
              <Field label="Duration"><select className="select" value={String(params.duration ?? "")} onChange={(e) => set("duration", Number(e.target.value))}>{m.options.durations.map((d) => <option key={d} value={d}>{d}s</option>)}</select></Field>
            )}
            {kind === "text" && (<>
              <Field label="Max output tokens"><input className="input" type="number" min={64} max={16000} value={Number(params.max_tokens ?? 1500)} onChange={(e) => set("max_tokens", Number(e.target.value))} /></Field>
              <Field label="Creativity"><input className="input" type="number" step={0.1} min={0} max={1.5} value={Number(params.temperature ?? 0.8)} onChange={(e) => set("temperature", Number(e.target.value))} /></Field>
            </>)}
            <Field label={kind === "video" ? "Clips" : "Variations"}><select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>{(kind === "video" ? [1, 2] : [1, 2, 3, 4]).map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
            {kind === "video" && m?.options?.supports_audio && (
              <Field label="Audio"><select className="select" value={params.generate_audio ? "1" : "0"} onChange={(e) => set("generate_audio", e.target.value === "1")}><option value="1">Generate sound</option><option value="0">Silent</option></select></Field>
            )}
          </div>
          {kind === "text" && <Field label="System instruction (optional)"><input className="input" value={String(params.system ?? "")} onChange={(e) => set("system", e.target.value)} placeholder="You are the head writer for a cinematic YouTube channel…" /></Field>}
          {(m?.options?.supports_reference || (kind === "text" && m?.input_modalities.includes("image"))) && (
            <ReferenceUploader keys={refs} onChange={setRefs} max={kind === "video" ? 2 : 4} label={kind === "video" ? "First / last frame" : kind === "text" ? "Images to discuss" : "Reference images"} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <EstimateChip est={est} remaining={me?.remaining ?? 0} />
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setSavePreset(true)} disabled={!prompt.trim()} title="Save as a team preset"><Save size={14} /> Preset</button>
              <button type="button" className="btn btn-sun" onClick={run} disabled={busy || !prompt.trim() || !model || (est ? est.credits > (me?.remaining ?? 0) : false)}>{busy ? <Spinner /> : <Wand2 size={16} />} Generate</button>
            </div>
          </div>
          {est?.warning && <div className="text-[11px] muted">{est.warning}</div>}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2"><Sparkles size={16} className="text-sun" /><h2 className="font-semibold">Your {kind} runs</h2></div>
        <div className={`grid gap-3 ${kind === "text" ? "" : "sm:grid-cols-2 2xl:grid-cols-3"}`}>
          {(feed.data?.generations ?? []).map((g) => <GenerationCard key={g.id} g={g} onDelete={async (id) => { await api.del(`/api/generations/${id}`); void feed.reload(); }} />)}
        </div>
        {!feed.loading && !(feed.data?.generations ?? []).length && <div className="glass p-6 text-sm muted">Your {kind} generations will appear here. {mine.length ? "" : "Write a prompt and hit Generate."}</div>}
      </div>
      <SavePresetModal open={savePreset} onClose={() => setSavePreset(false)} seed={{ kind, model, template: prompt, negative, params, reference_keys: refs }} onSaved={() => { setSavePreset(false); say("Preset saved"); }} />
    </div>
  );
}
