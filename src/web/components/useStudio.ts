import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Generation, Kind, ModelInfo, Preset, PresetVariable } from "../../shared/types";
import { api, ApiError, parseJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { useEstimate } from "./generation";
import type { Gen } from "./workspace";
import { needsConfirm, useChargeNotices } from "./Cost";

/** All state and actions for a creation studio, shared by the image bar layout and the video/text panel layout. */
export function useStudio(kind: Kind, say: (m: string, k?: "info" | "error") => void) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { me, refresh } = useAuth();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [refs, setRefs] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "team">("mine");

  const applyPreset = useCallback((p: Preset) => {
    if (p.kind !== kind) { nav(`/create/${p.kind}?preset=${p.id}`); return; }
    setPreset(p); setModel(p.model); setNegative(p.negative ?? "");
    setParams((prev) => ({ ...prev, ...parseJson<Record<string, unknown>>(p.params_json, {}) }));
    const defs = parseJson<PresetVariable[]>(p.variables_json, []);
    setVars(Object.fromEntries(defs.map((d) => [d.key, d.default ?? ""])));
    setPrompt("");
  }, [kind, nav]);

  useEffect(() => {
    setModel(""); setParams({}); setRefs([]); setCount(1); setPreset(null); setVars({}); setSelected(null);
    api.get<{ models: ModelInfo[] }>(`/api/models?kind=${kind}`).then((r) => { setModels(r.models); setModel(sp.get("model") ?? r.models[0]?.id ?? ""); }).catch((e) => say(e.message, "error"));
    const p = sp.get("prompt"); if (p) setPrompt(p);
    const rids = sp.get("research");
    if (rids && kind === "text") setParams((p) => ({ ...p, research: { mode: "pick", ids: rids.split(",").filter(Boolean).slice(0, 12) } }));
    const pid = sp.get("preset");
    if (pid) api.get<{ preset: Preset }>(`/api/presets/${pid}`).then((r) => applyPreset(r.preset)).catch(() => say("Preset not found", "error"));
    if (p || pid || rids) setSp({}, { replace: true });
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
      if (kind === "text") { next.max_tokens = prev.max_tokens ?? 1500; next.temperature = prev.temperature ?? 0.8; if (!prev.research && me?.config.research) next.research = { mode: "auto", count: 6 }; }
      return next;
    });
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const defs = useMemo(() => (preset ? parseJson<PresetVariable[]>(preset.variables_json, []) : []), [preset]);
  const renderedPrompt = preset ? preset.template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => vars[k] ?? "") + (prompt.trim() ? `\n\n${prompt.trim()}` : "") : prompt;
  const presetRefs = useMemo(() => (preset ? parseJson<string[]>(preset.reference_keys_json, []) : []), [preset]);
  const est = useEstimate(model ? { kind, model, prompt: renderedPrompt, params: { ...params, negative }, reference_keys: [...presetRefs, ...refs], count } : null);
  const missing = defs.filter((d) => d.required && !String(vars[d.key] ?? "").trim()).map((d) => d.label);
  const over = est ? est.credits > (me?.remaining ?? 0) : false;

  const feed = usePoll(() => api.get<{ generations: Gen[] }>(`/api/generations?kind=${kind}&scope=${scope}&limit=60`), 4000, true, [kind, scope]);
  const items = feed.data?.generations ?? [];
  const hasPending = items.some((g) => g.status === "queued" || g.status === "running");
  useEffect(() => { if (!hasPending) void refresh(); }, [hasPending]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = items.find((g) => g.id === selected) ?? null;
  useChargeNotices(items, say);
  const [confirming, setConfirming] = useState(false);

  const run = async (confirmed = false) => {
    if (!renderedPrompt.trim() || !model) return;
    if (missing.length) { say(`Fill in: ${missing.join(", ")}`, "error"); return; }
    if (!confirmed && needsConfirm(est, me?.remaining ?? 0, me?.config.confirm_over_usd ?? 0.5)) { setConfirming(true); return; }
    setConfirming(false);
    setBusy(true);
    try {
      const r = await api.post<{ generation: Generation }>("/api/generate", { kind, model, prompt: renderedPrompt, negative: negative || undefined, params, reference_keys: [...presetRefs, ...refs], count, preset_id: preset?.id });
      setSelected(r.generation.id); await feed.reload(); await refresh();
    } catch (e) { say(e instanceof ApiError ? e.message : String(e), "error"); } finally { setBusy(false); }
  };
  const rerun = async (g: Gen) => { try { const r = await api.post<{ generation: Generation }>(`/api/generations/${g.id}/rerun`); setSelected(r.generation.id); void feed.reload(); void refresh(); } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } };
  const remove = async (g: Gen) => { if (!confirm("Delete this generation?")) return; await api.del(`/api/generations/${g.id}`); setSelected(null); void feed.reload(); };
  const favorite = async (g: Gen) => { await api.post(`/api/generations/${g.id}/favorite`); void feed.reload(); };
  const reuse = (g: Gen) => {
    setPrompt(g.prompt); setPreset(null); setModel(g.model);
    const { negative: n, count: c, ...rest } = parseJson<Record<string, unknown>>(g.params_json, {});
    setNegative(typeof n === "string" ? n : ""); setCount(typeof c === "number" ? c : 1); setParams(rest);
    setRefs(parseJson<string[]>(g.input_keys_json, []).filter((k) => k.startsWith(`uploads/${me?.user.id}/`)));
  };
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));
  const clearPreset = () => { setPreset(null); setVars({}); setNegative(""); };

  return { confirming, setConfirming, me, models, model, setModel, m, prompt, setPrompt, negative, setNegative, params, set, refs, setRefs, count, setCount, busy, preset, applyPreset, clearPreset, defs, vars, setVars, renderedPrompt, est, over, missing, feed, items, selected, setSelected, current, scope, setScope, run, rerun, remove, favorite, reuse };
}
