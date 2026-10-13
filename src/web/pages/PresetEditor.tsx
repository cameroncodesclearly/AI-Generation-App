import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import type { Generation, Kind, Preset, PresetVariable } from "../../shared/types";
import { api, fileUrl, parseJson } from "../lib/api";
import { Field, Spinner, useToast } from "../components/ui";
import { ModelPicker, ReferenceUploader } from "../components/generation";
import { useModels } from "./Presets";

const blank: PresetVariable = { key: "", label: "", type: "text", default: "", required: true };

export default function PresetEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [toast, say] = useToast();
  const [kind, setKind] = useState<Kind>("image");
  const models = useModels(kind);
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [template, setTemplate] = useState("");
  const [negative, setNegative] = useState("");
  const [variables, setVariables] = useState<PresetVariable[]>([]);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [refs, setRefs] = useState<string[]>([]);
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<{ preset: Preset }>(`/api/presets/${id}`).then(({ preset: p }) => {
      setKind(p.kind); setModel(p.model); setName(p.name); setDescription(p.description ?? ""); setCategory(p.category); setVisibility(p.visibility);
      setTemplate(p.template); setNegative(p.negative ?? ""); setVariables(parseJson(p.variables_json, [])); setParams(parseJson(p.params_json, {})); setRefs(parseJson(p.reference_keys_json, [])); setCoverKey(p.cover_key);
    }).catch((e) => say(e.message, "error"));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!model && models[0]) setModel(models[0].id); if (model && models.length && !models.some((m) => m.id === model)) setModel(models[0].id); }, [models]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => models.find((x) => x.id === model), [models, model]);
  const placeholders = useMemo(() => [...new Set([...template.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map((x) => x[1]))], [template]);
  const unmapped = placeholders.filter((p) => !variables.some((v) => v.key === p));
  const preview = template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => { const v = variables.find((x) => x.key === k); return v?.default || `[${v?.label || k}]`; });

  const save = async () => {
    setBusy(true);
    try {
      const body = { name, description, category, visibility, kind, model, template, negative: negative || null, variables, params, reference_keys: refs, cover_key: coverKey };
      const r = id ? await api.put<{ preset: Preset }>(`/api/presets/${id}`, body) : await api.post<{ preset: Preset }>("/api/presets", body);
      say("Saved");
      if (!id) nav(`/presets/${r.preset.id}/edit`, { replace: true });
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setBusy(false); }
  };

  const generateCover = async () => {
    if (!id) { say("Save the preset first, then generate a cover.", "error"); return; }
    setCoverBusy(true);
    try {
      const r = await api.post<{ generation: Generation }>(`/api/presets/${id}/cover`, {});
      const poll = async (): Promise<void> => {
        const g = (await api.get<{ generation: Generation }>(`/api/generations/${r.generation.id}`)).generation;
        if (g.status === "done") {
          const out = parseJson<{ key: string }[]>(g.outputs_json, [])[0];
          if (out) { setCoverKey(out.key); await api.put(`/api/presets/${id}`, { cover_key: out.key }); say("Cover updated"); }
        } else if (g.status === "failed") say(g.error ?? "Cover failed", "error");
        else { await new Promise((res) => setTimeout(res, 3000)); return poll(); }
      };
      await poll();
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setCoverBusy(false); }
  };

  const setVar = (i: number, patch: Partial<PresetVariable>) => setVariables((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      {toast}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/presets" className="muted mb-2 inline-flex items-center gap-1 text-xs hover:text-white"><ArrowLeft size={12} /> Presets</Link>
          <h1 className="display text-4xl">{id ? "Edit preset" : "New preset"}</h1>
        </div>
        <button className="btn btn-sun" onClick={save} disabled={busy || !name.trim() || !template.trim() || !model}>{busy ? <Spinner /> : "Save preset"}</button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="glass glass-strong space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cinematic product hero" /></Field>
              <Field label="Category"><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Products, Social, Thumbnails…" /></Field>
            </div>
            <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it's for and when to reach for it" /></Field>
            <Field label="Type"><div className="flex gap-2">{(["image", "video", "text"] as Kind[]).map((k) => <button key={k} type="button" className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => { setKind(k); setParams({}); }}>{k}</button>)}</div></Field>
            <Field label="Model"><ModelPicker models={models} value={model} onChange={setModel} /></Field>
            <Field label="Prompt template" hint="Use {{placeholders}} for the parts each person fills in. Everything else is locked, which is what keeps results consistent across the team.">
              <textarea className="textarea font-mono text-[13px]" rows={8} value={template} onChange={(e) => setTemplate(e.target.value)} placeholder={"Editorial product shot of {{product}} on {{surface}}, {{lighting}} lighting, 85mm, shallow depth of field, subtle film grain, no text."} />
            </Field>
            {kind !== "text" && <Field label="Avoid"><input className="input" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="text, watermark, logos, extra limbs" /></Field>}
            {m?.options?.aspect_ratios && <Field label="Aspect ratio"><div className="flex flex-wrap gap-2">{m.options.aspect_ratios.map((a) => <button key={a} type="button" className={`chip ${params.aspect_ratio === a ? "chip-on" : ""}`} onClick={() => set("aspect_ratio", a)}>{a}</button>)}</div></Field>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {m?.options?.resolutions && <Field label="Resolution"><select className="select" value={String(params.resolution ?? "")} onChange={(e) => set("resolution", e.target.value)}><option value="">Default</option>{m.options.resolutions.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>}
              {m?.options?.durations && <Field label="Duration"><select className="select" value={String(params.duration ?? "")} onChange={(e) => set("duration", Number(e.target.value))}><option value="">Default</option>{m.options.durations.map((d) => <option key={d} value={d}>{d}s</option>)}</select></Field>}
              {kind === "text" && <Field label="Max tokens"><input className="input" type="number" value={Number(params.max_tokens ?? 1500)} onChange={(e) => set("max_tokens", Number(e.target.value))} /></Field>}
            </div>
            {kind === "text" && <Field label="System instruction"><textarea className="textarea" rows={3} value={String(params.system ?? "")} onChange={(e) => set("system", e.target.value)} placeholder="You are the lead copywriter for…" /></Field>}
            {kind !== "text" && <ReferenceUploader keys={refs} onChange={setRefs} max={4} label="Baked-in reference images (style, product, character)" />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Visibility"><select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value as "team" | "private")}><option value="team">Whole team</option><option value="private">Only me</option></select></Field>
            </div>
          </div>

          <div className="glass glass-strong p-5">
            <div className="mb-3 flex items-center justify-between">
              <div><div className="eyebrow">Inputs</div><div className="muted text-xs">Each input becomes a field in the run form.</div></div>
              <div className="flex gap-2">
                {unmapped.length > 0 && <button className="btn btn-sm" onClick={() => setVariables((v) => [...v, ...unmapped.map((k) => ({ ...blank, key: k, label: k.replace(/[_-]+/g, " ") }))])}>Add {unmapped.map((u) => `{{${u}}}`).join(", ")}</button>}
                <button className="btn btn-sm" onClick={() => setVariables((v) => [...v, { ...blank }])}><Plus size={14} /> Input</button>
              </div>
            </div>
            <div className="space-y-3">
              {variables.map((v, i) => (
                <div key={i} className="glass grid gap-2 p-3 sm:grid-cols-[1fr_1fr_120px_1fr_auto]">
                  <Field label="Key"><input className="input" value={v.key} onChange={(e) => setVar(i, { key: e.target.value.replace(/[^\w-]/g, "") })} placeholder="product" /></Field>
                  <Field label="Label"><input className="input" value={v.label} onChange={(e) => setVar(i, { label: e.target.value })} placeholder="Product" /></Field>
                  <Field label="Type"><select className="select" value={v.type} onChange={(e) => setVar(i, { type: e.target.value as PresetVariable["type"] })}><option value="text">Text</option><option value="textarea">Long text</option><option value="select">Choice</option><option value="number">Number</option></select></Field>
                  <Field label={v.type === "select" ? "Options (comma-separated)" : "Default"}>
                    {v.type === "select" ? <input className="input" value={(v.options ?? []).join(", ")} onChange={(e) => setVar(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="golden hour, studio, neon" />
                      : <input className="input" value={v.default ?? ""} onChange={(e) => setVar(i, { default: e.target.value })} />}
                  </Field>
                  <div className="flex items-end gap-2 pb-0.5">
                    <label className="flex items-center gap-1 text-xs muted"><input type="checkbox" checked={!!v.required} onChange={(e) => setVar(i, { required: e.target.checked })} /> Req.</label>
                    <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setVariables((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                  <div className="sm:col-span-5"><input className="input" value={v.help ?? ""} onChange={(e) => setVar(i, { help: e.target.value })} placeholder="Help text shown under the field (optional)" /></div>
                </div>
              ))}
              {!variables.length && <div className="muted text-sm">No inputs yet. Add placeholders to the template, then click the button above to map them.</div>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass glass-strong p-4">
            <div className="eyebrow mb-2">Cover art</div>
            <div className={`aspect-square overflow-hidden rounded-2xl ${coverKey ? "" : "cover-fallback"}`}>{coverKey && <img src={fileUrl(coverKey)} className="h-full w-full object-cover" alt="" />}</div>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-sm" onClick={generateCover} disabled={coverBusy || !id}>{coverBusy ? <Spinner /> : <ImageIcon size={14} />} Generate with AI</button>
              <label className="btn btn-sm cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append("file", f); fd.append("kind", "image"); const r = await api.form<{ key: string }>("/api/upload", fd); setCoverKey(r.key); }} /></label>
            </div>
            <div className="muted mt-2 text-[11px]">AI covers cost a few credits from your balance and use the preset's description.</div>
          </div>
          <div className="glass glass-strong p-4">
            <div className="eyebrow mb-2">Preview with defaults</div>
            <div className="prose-out max-h-72 overflow-auto text-xs scrollbar-thin">{preview || <span className="muted">Write a template to see it here.</span>}</div>
          </div>
          <div className="glass p-4 text-xs muted">
            <b className="text-white">How presets work.</b> The template plus locked parameters and references are the "look". Inputs are the only thing that changes per run. Anyone on the team can run it, only the author or an admin can change it, and the run always goes through the same credit estimate as a normal generation.
          </div>
        </div>
      </div>
    </div>
  );
}
