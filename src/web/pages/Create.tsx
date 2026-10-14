import { useState } from "react";
import { useParams } from "react-router-dom";
import { AtSign, BookOpen, Clock, History as HistoryIcon, LayoutGrid, List, Monitor, Plus, Proportions, Sparkles, Volume2, X } from "lucide-react";
import type { Kind } from "../../shared/types";
import { fileUrl, fmtCredits } from "../lib/api";
import { useStudio } from "../components/useStudio";
import { AssetsPicker, ChipMenu, FeedItem, FrameTile, Lightbox, MetaCard, ModelBadge, ModelRow, Stepper, StyleCard, VarChips, priceLabel, type Gen } from "../components/workspace";
import { Modal, Spinner, StatusPill, useToast } from "../components/ui";
import { PresetPickerModal, SavePresetModal } from "./Presets";

export default function Create() {
  const { kind: kindParam } = useParams();
  const kind = (["image", "video", "text"].includes(kindParam ?? "") ? kindParam : "image") as Kind;
  return kind === "image" ? <ImageStudio key="image" /> : <PanelStudio key={kind} kind={kind} />;
}

/** Searchable model chip for the bottom bar (popover list with Featured section). */
function ModelChip({ s }: { s: ReturnType<typeof useStudio> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = s.models.filter((x) => !q || `${x.name} ${x.id} ${x.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const featured = list.filter((x) => x.featured); const rest = list.filter((x) => !x.featured);
  return (
    <div className="relative">
      <button type="button" className="cchip" onClick={() => setOpen((o) => !o)}>{s.m && <ModelBadge id={s.m.id} />}{s.m?.name ?? "Model"} <span className="opacity-60">›</span></button>
      {open && (<>
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
        <div className="menu bottom-[calc(100%+8px)] left-0 w-[380px] p-2">
          <input className="input mb-2 !py-2 text-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-[50vh] overflow-auto scrollbar-thin">
            {featured.length > 0 && <div className="px-2 py-1 text-[11px] muted">✦ Featured models</div>}
            {[...featured, ...rest].map((x, i) => (<>
              {i === featured.length && featured.length > 0 && rest.length > 0 && <div key="h" className="px-2 py-1 text-[11px] muted">All models</div>}
              <button key={x.id} type="button" className={`menu-item ${x.id === s.model ? "on" : ""}`} onClick={() => { s.setModel(x.id); setOpen(false); }}>
                <span className="flex min-w-0 items-center gap-3"><ModelBadge id={x.id} /><span className="min-w-0"><span className="flex items-center gap-2 font-semibold text-white">{x.name}{x.featured && <span className="badge">Top</span>}</span><span className="block truncate text-xs muted">{x.description || priceLabel(x)}</span></span></span>
                <span className="shrink-0 text-[11px] muted">{priceLabel(x).split(" /")[0]}</span>
              </button>
            </>))}
          </div>
        </div>
      </>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image: full-bleed results grid + bottom prompt bar
// ---------------------------------------------------------------------------
function ImageStudio() {
  const [toast, say] = useToast();
  const s = useStudio("image", say);
  const [pick, setPick] = useState(false);
  const [pickPreset, setPickPreset] = useState(false);
  const [savePreset, setSavePreset] = useState(false);
  const [tile, setTile] = useState(260);
  const done = s.items;
  const idx = s.current ? done.findIndex((g) => g.id === s.current!.id) : -1;
  return (
    <div className="-mx-3 -mt-3 md:-mx-4 md:-mt-4">
      {toast}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="seg"><button className={s.scope === "mine" ? "on" : ""} onClick={() => s.setScope("mine")}>My generations</button><button className={s.scope === "team" ? "on" : ""} onClick={() => s.setScope("team")}>Team</button></div>
        <div className="flex items-center gap-3 text-xs muted"><span>Tile size</span><input type="range" min={140} max={420} value={tile} onChange={(e) => setTile(Number(e.target.value))} className="accent-sun" /></div>
      </div>
      <div className="grid-tiles min-h-[55vh]" style={{ ["--tile" as string]: `${tile}px` }}>
        {done.map((g) => {
          const out = (JSON.parse(g.outputs_json || "[]") as { key: string; mime: string }[])[0];
          const pending = g.status === "queued" || g.status === "running";
          return (
            <div key={g.id} onClick={() => s.setSelected(g.id)} className={pending ? "shimmer" : ""}>
              {out ? <img src={fileUrl(out.key)} alt="" loading="lazy" /> : <div className="grid h-full place-items-center p-3 text-center text-xs muted">{g.status === "failed" ? <span className="text-red-200">{g.error}</span> : "Generating…"}</div>}
              {g.user_email && s.scope === "team" && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{g.user_name || g.user_email.split("@")[0]}</span>}
              {!!g.favorite && <span className="absolute right-1.5 top-1.5 text-blush">♥</span>}
            </div>
          );
        })}
        {!s.feed.loading && !done.length && <div className="col-span-full grid min-h-[55vh] place-items-center text-center"><div><div className="display text-2xl">Describe the scene you imagine</div><p className="muted mt-2 text-sm">Your images will fill this wall.</p></div></div>}
      </div>

      <div className="bar">
        {(s.preset || s.defs.length > 0) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <button type="button" className="varchip !border-sun/40" onClick={() => setPickPreset(true)}><small>Preset</small><b>{s.preset?.name ?? "None"}</b></button>
            <VarChips defs={s.defs} vars={s.vars} onChange={(k, v) => s.setVars({ ...s.vars, [k]: v })} />
            <button type="button" className="icon-btn" title="Clear preset" onClick={s.clearPreset}><X size={13} /></button>
          </div>
        )}
        {s.refs.length > 0 && (
          <div className="mb-2 flex gap-1.5">{s.refs.map((k) => <span key={k} className="relative h-12 w-12 overflow-hidden rounded-lg border border-white/10"><img src={fileUrl(k)} className="h-full w-full object-cover" alt="" /><button type="button" className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-[10px]" onClick={() => s.setRefs(s.refs.filter((x) => x !== k))}>×</button></span>)}</div>
        )}
        <textarea className="bar-input" rows={2} placeholder={s.preset ? "Anything to add on top of the preset…" : "Describe the scene you imagine"} value={s.prompt} onChange={(e) => s.setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void s.run(); }} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="stepper"><button type="button" title="Add references" onClick={() => setPick(true)}><Plus size={15} /></button><button type="button" title="Pick a preset" onClick={() => setPickPreset(true)}><AtSign size={14} /></button></span>
          <ModelChip s={s} />
          {s.m?.options?.aspect_ratios && <ChipMenu icon={<Proportions size={13} />} label="Aspect ratio" value={String(s.params.aspect_ratio ?? s.m.options.aspect_ratios[0])} options={s.m.options.aspect_ratios} onChange={(v) => s.set("aspect_ratio", v)} />}
          {s.m?.options?.resolutions && <ChipMenu icon={<Monitor size={13} />} label="Resolution" value={String(s.params.resolution ?? s.m.options.resolutions[0])} options={s.m.options.resolutions} onChange={(v) => s.set("resolution", v)} />}
          <Stepper value={s.count} max={4} onChange={s.setCount} />
          <input className="input !w-44 !py-1.5 text-xs" value={s.negative} onChange={(e) => s.setNegative(e.target.value)} placeholder="Avoid…" />
          <span className="ml-auto flex items-center gap-2">
            <button type="button" className="cchip" onClick={() => setSavePreset(true)} disabled={!s.renderedPrompt.trim()}>Save preset</button>
            <button type="button" className="btn-generate !w-auto px-5" onClick={s.run} disabled={s.busy || !s.renderedPrompt.trim() || !s.model || s.over}>{s.busy ? <Spinner /> : <Sparkles size={15} />} Generate <span className="text-xs opacity-80">✦ {s.est ? fmtCredits(s.est.credits) : "…"}</span></button>
          </span>
        </div>
        {s.over && <div className="mt-1 text-[11px] text-red-300">Over your remaining {fmtCredits(s.me?.remaining)} credits.</div>}
      </div>

      <AssetsPicker open={pick} onClose={() => setPick(false)} max={4} selected={s.refs} onPick={(k) => s.setRefs(s.refs.includes(k) ? s.refs.filter((x) => x !== k) : [...s.refs, k].slice(0, 4))} />
      <PresetPickerModal open={pickPreset} kind="image" onClose={() => setPickPreset(false)} onPick={(p) => { setPickPreset(false); s.applyPreset(p); }} />
      <SavePresetModal open={savePreset} onClose={() => setSavePreset(false)} seed={{ kind: "image", model: s.model, template: s.renderedPrompt, negative: s.negative, params: s.params, reference_keys: s.refs }} onSaved={() => { setSavePreset(false); say("Preset saved"); }} />
      {s.current && <Lightbox g={s.current} onClose={() => s.setSelected(null)} onRerun={() => void s.rerun(s.current!)} onDelete={() => void s.remove(s.current!)} onReuse={() => { s.reuse(s.current!); s.setSelected(null); }} onFavorite={() => void s.favorite(s.current!)} onPrev={idx > 0 ? () => s.setSelected(done[idx - 1].id) : undefined} onNext={idx >= 0 && idx < done.length - 1 ? () => s.setSelected(done[idx + 1].id) : undefined} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video & Copy: left panel + History (list / grid) | How it works
// ---------------------------------------------------------------------------
const HOW: Record<string, { title: string; tips: string[] }> = {
  video: { title: "Direct the shot", tips: ["Lead with the subject and the action, then the camera move (dolly, orbit, handheld), then light and lens.", "Add a start frame to lock the look; add an end frame for a controlled move between two states.", "Keep clips short: 5–8 seconds at 720p is the sweet spot for cost and iteration.", "Turn on audio for ambience; say what we hear (rain, café chatter, no music).", "Credits are estimated up front and reconciled to the real cost after the render."] },
  text: { title: "Brief it like a writer", tips: ["Say the platform, the audience and the tone in the first line.", "Give one concrete example of a line you like.", "Ask for a count and a format (10 hooks, numbered, under 15 words).", "Use a system instruction to set a persistent voice for the whole session.", "Copy costs fractions of a credit; iterate freely."] },
};

function PanelStudio({ kind }: { kind: Kind }) {
  const [toast, say] = useToast();
  const s = useStudio(kind, say);
  const [tab, setTab] = useState<"history" | "how">("history");
  const [view, setView] = useState<"list" | "grid">("list");
  const [pickPreset, setPickPreset] = useState(false);
  const [savePreset, setSavePreset] = useState(false);
  const frames: (string | null)[] = [s.refs[0] ?? null, s.refs[1] ?? null];
  const setFrame = (i: number, k: string | null) => { const f = [...frames]; f[i] = k; s.setRefs(f.filter((x): x is string => !!x)); };
  const how = HOW[kind];
  return (
    <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      {toast}
      <aside className="panel flex flex-col gap-3 p-3 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-auto scrollbar-thin">
        <div className="flex gap-4 border-b border-white/10 px-1 text-sm font-semibold"><span className="border-b-2 border-white pb-2">Create {kind === "video" ? "Video" : "Copy"}</span>{kind === "video" && <><span className="pb-2 muted">Edit Video</span><span className="pb-2 muted">Motion Control</span></>}</div>
        <StyleCard preset={s.preset} onChange={() => setPickPreset(true)} onClear={s.clearPreset} />
        {kind === "video" && (
          <div className="grid grid-cols-2 gap-2">
            <FrameTile label="Start frame" value={frames[0]} onChange={(k) => setFrame(0, k)} />
            <FrameTile label="End frame" value={frames[1]} onChange={(k) => setFrame(1, k)} />
          </div>
        )}
        {s.defs.length > 0 && <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] muted">Preset inputs</div><VarChips defs={s.defs} vars={s.vars} onChange={(k, v) => s.setVars({ ...s.vars, [k]: v })} /></div>}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="mb-1 text-[11px] muted">{s.preset ? "Extra direction (optional)" : "Prompt"}</div>
          <textarea className="w-full resize-y bg-transparent text-sm leading-relaxed text-white outline-none placeholder:text-white/35" rows={kind === "text" ? 7 : 4} value={s.prompt} onChange={(e) => s.setPrompt(e.target.value)} placeholder={kind === "video" ? "Describe the scene you imagine, with details." : "Hooks, scripts, captions, concepts…"} />
        </div>
        {kind === "video" && !s.preset && <input className="input !py-2 text-xs" value={s.negative} onChange={(e) => s.setNegative(e.target.value)} placeholder="Avoid: text, watermark, blur…" />}
        {kind === "text" && <input className="input !py-2 text-xs" value={String(s.params.system ?? "")} onChange={(e) => s.set("system", e.target.value)} placeholder="System instruction (optional)" />}
        <ModelRow models={s.models} value={s.model} onChange={s.setModel} />
        <div className="flex flex-wrap gap-1.5">
          {s.m?.options?.durations && <ChipMenu icon={<Clock size={13} />} label="Duration" value={Number(s.params.duration ?? s.m.options.durations[0])} options={s.m.options.durations} onChange={(v) => s.set("duration", v)} format={(v) => `${v}s`} />}
          {s.m?.options?.resolutions && <ChipMenu icon={<Monitor size={13} />} label="Quality" value={String(s.params.resolution ?? s.m.options.resolutions[0])} options={s.m.options.resolutions} onChange={(v) => s.set("resolution", v)} />}
          {s.m?.options?.aspect_ratios && <ChipMenu icon={<Proportions size={13} />} label="Aspect ratio" value={String(s.params.aspect_ratio ?? s.m.options.aspect_ratios[0])} options={s.m.options.aspect_ratios} onChange={(v) => s.set("aspect_ratio", v)} />}
          {kind === "video" && s.m?.options?.supports_audio && <ChipMenu icon={<Volume2 size={13} />} label="Audio" value={s.params.generate_audio === false ? "Off" : "On"} options={["On", "Off"]} onChange={(v) => s.set("generate_audio", v === "On")} />}
          {kind === "text" && <ChipMenu label="Max tokens" value={Number(s.params.max_tokens ?? 1500)} options={[500, 1000, 1500, 3000, 6000]} onChange={(v) => s.set("max_tokens", v)} />}
          {kind === "text" && <ChipMenu label="Creativity" value={Number(s.params.temperature ?? 0.8)} options={[0.2, 0.5, 0.8, 1, 1.2]} onChange={(v) => s.set("temperature", v)} format={(v) => `temp ${v}`} />}
          <Stepper value={s.count} max={kind === "video" ? 2 : 4} onChange={s.setCount} />
        </div>
        <button type="button" className="btn-generate" onClick={s.run} disabled={s.busy || !s.renderedPrompt.trim() || !s.model || s.over}>{s.busy ? <Spinner /> : <Sparkles size={16} />} Generate <span className="rounded-md bg-black/15 px-1.5 py-0.5 text-xs">✦ {s.est ? fmtCredits(s.est.credits) : "…"}</span></button>
        <div className="flex items-center justify-between text-[11px] muted"><span>{s.over ? <span className="text-red-300">Over your remaining {fmtCredits(s.me?.remaining)} credits</span> : s.est ? `≈ $${s.est.usd.toFixed(3)} · ${s.est.breakdown[0]}` : ""}</span><button type="button" className="hover:text-white" onClick={() => setSavePreset(true)} disabled={!s.renderedPrompt.trim()}>Save preset</button></div>
      </aside>

      <section className="panel min-w-0 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="seg"><button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}><HistoryIcon size={14} /> History</button><button className={tab === "how" ? "on" : ""} onClick={() => setTab("how")}><BookOpen size={14} /> How it works</button></div>
          <div className="flex items-center gap-2">
            <div className="seg"><button className={s.scope === "mine" ? "on" : ""} onClick={() => s.setScope("mine")}>Mine</button><button className={s.scope === "team" ? "on" : ""} onClick={() => s.setScope("team")}>Team</button></div>
            <div className="seg"><button className={view === "list" ? "on" : ""} onClick={() => setView("list")}><List size={14} /> List</button><button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}><LayoutGrid size={14} /> Grid</button></div>
          </div>
        </div>
        {tab === "how" ? (
          <div className="mx-auto max-w-2xl py-10 text-center"><div className="display text-2xl">{how.title}</div><ul className="mt-6 space-y-3 text-left text-sm">{how.tips.map((t) => <li key={t} className="panel p-3">{t}</li>)}</ul></div>
        ) : view === "grid" ? (
          <div className="masonry">{s.items.map((g) => <div key={g.id} onClick={() => s.setSelected(g.id)}><FeedItem g={g} active={false} onSelect={() => s.setSelected(g.id)} /></div>)}</div>
        ) : (
          <div className="space-y-3">
            {s.items.map((g) => (
              <div key={g.id} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
                <FeedItem g={g} active={s.current?.id === g.id} onSelect={() => s.setSelected(g.id)} />
                <div className="hidden xl:block"><MetaCard g={g} onRerun={() => void s.rerun(g)} onDelete={() => void s.remove(g)} onReuse={() => s.reuse(g)} /></div>
              </div>
            ))}
          </div>
        )}
        {tab === "history" && !s.feed.loading && !s.items.length && <div className="grid min-h-[320px] place-items-center text-center"><div><div className="display text-2xl">Nothing here yet</div><p className="muted mt-2 text-sm">Fill in the panel on the left and hit Generate.</p></div></div>}
      </section>

      <PresetPickerModal open={pickPreset} kind={kind} onClose={() => setPickPreset(false)} onPick={(p) => { setPickPreset(false); s.applyPreset(p); }} />
      <SavePresetModal open={savePreset} onClose={() => setSavePreset(false)} seed={{ kind, model: s.model, template: s.renderedPrompt, negative: s.negative, params: s.params, reference_keys: s.refs }} onSaved={() => { setSavePreset(false); say("Preset saved"); }} />
      {s.current && view === "grid" && <Lightbox g={s.current} onClose={() => s.setSelected(null)} onRerun={() => void s.rerun(s.current!)} onDelete={() => void s.remove(s.current!)} onReuse={() => { s.reuse(s.current!); s.setSelected(null); }} onFavorite={() => void s.favorite(s.current!)} />}
      {s.current && view === "list" && <Modal open onClose={() => s.setSelected(null)} title="Details"><div className="xl:hidden"><MetaCard g={s.current} onRerun={() => void s.rerun(s.current!)} onDelete={() => void s.remove(s.current!)} onReuse={() => { s.reuse(s.current!); s.setSelected(null); }} /></div><div className="hidden xl:block"><StatusPill status={s.current.status} /> <span className="muted text-xs">Selected. Use the card on the right.</span></div></Modal>}
    </div>
  );
}
