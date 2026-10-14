import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Film, Image as ImageIcon, LayoutGrid, Plus, Sparkles, Type, Video } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, fileUrl, parseJson } from "../lib/api";
import { money } from "../lib/money";
import { usePoll } from "../lib/hooks";
import type { Kind, Preset } from "../../shared/types";
import type { Gen } from "../components/workspace";
import { ModelBadge } from "../components/workspace";

const tiles = [
  { to: "/create/image", icon: ImageIcon, title: "Image", desc: "Nano Banana, GPT Image, FLUX", badge: "Top" },
  { to: "/create/video", icon: Video, title: "Video", desc: "Veo, Sora, Seedance, Kling", badge: "New" },
  { to: "/create/text", icon: Type, title: "Copy & Ideas", desc: "Grounded in our Social Research" },
  { to: "/presets", icon: LayoutGrid, title: "Presets", desc: "Team looks, one click" },
  { to: "/analyze", icon: Film, title: "Analyze Video", desc: "Transcript, summary, visuals", badge: "New" },
];

export default function Home() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind>("image");
  const [q, setQ] = useState("");
  const presets = usePoll(() => api.get<{ presets: (Preset & { author_name?: string })[] }>("/api/presets"), 60000, false);
  const recent = usePoll(() => api.get<{ generations: Gen[] }>("/api/generations?scope=team&limit=18&status=done"), 10000, true);
  const go = (e: FormEvent) => { e.preventDefault(); nav(`/create/${kind}${q.trim() ? `?prompt=${encodeURIComponent(q.trim())}` : ""}`); };
  const ps = presets.data?.presets ?? [];
  const covers = ps.filter((p) => p.cover_key).slice(0, 3);
  const heroes = (covers.length ? covers : ps.slice(0, 3)).map((p) => ({ to: `/create/${p.kind}?preset=${p.id}`, title: p.name, desc: p.description ?? "", cover: p.cover_key, kind: p.kind }));
  while (heroes.length < 3) heroes.push([{ to: "/create/video", title: "Make it move", desc: "Veo 3.1, Sora 2 and Seedance from a prompt or a first frame.", cover: null, kind: "video" as Kind }, { to: "/analyze", title: "Analyze any social video", desc: "Transcript, hook, visual breakdown and captions in a minute.", cover: null, kind: "text" as Kind }, { to: "/presets/new", title: "Build a preset", desc: "Lock a look so the whole team gets the same result.", cover: null, kind: "image" as Kind }][heroes.length]);

  return (
    <div className="space-y-7">
      <section className="grid gap-3 md:grid-cols-3">
        {heroes.map((h, i) => (
          <Link key={i} to={h.to} className={`hero-card glass-hover ${h.cover ? "" : "cover-fallback"}`}>
            {h.cover && <img src={fileUrl(h.cover)} className="absolute inset-0 h-full w-full object-cover" alt="" />}
            <div className="display text-xl leading-none">{h.title}</div>
            <div className="mt-1 line-clamp-2 text-xs text-white/75">{h.desc}</div>
          </Link>
        ))}
      </section>

      <section className="rays relative">
        <div className="mb-3 text-center">
          <div className="eyebrow">{me?.user.name || me?.user.email.split("@")[0]} · {money(me?.remaining)} of {money(me?.user.credit_limit)} left this month</div>
          <h1 className="display display-sun text-5xl sm:text-6xl">Creative Creators</h1>
        </div>
        <form onSubmit={go} className="promptbar mx-auto max-w-3xl">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Link to={`/create/${kind}`} className="icon-btn shrink-0" title="Open studio"><Plus size={16} /></Link>
              <input className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40" placeholder={`Describe any visual idea. We will generate ${kind === "image" ? "an image" : kind === "video" ? "a video" : "the copy"}.`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["image", "video", "text"] as Kind[]).map((k) => <button key={k} type="button" className={`cchip ${kind === k ? "!border-sun/60 !bg-sun/15 !text-sun" : ""}`} onClick={() => setKind(k)}>{k === "image" ? <ImageIcon size={13} /> : k === "video" ? <Video size={13} /> : <Type size={13} />}{k === "text" ? "Copy" : k[0].toUpperCase() + k.slice(1)}</button>)}
            </div>
          </div>
          <button type="submit" className="btn-generate !w-auto px-6 uppercase tracking-wider"><Sparkles size={16} /> Generate</button>
        </form>
      </section>

      <section className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="panel glass-hover flex items-start gap-3 p-4">
            <span className="nav-ico h-8 w-8"><t.icon size={16} /></span>
            <span className="min-w-0"><span className="flex items-center gap-2 font-semibold">{t.title}{t.badge && <span className={`badge ${t.badge === "New" ? "badge-new" : ""}`}>{t.badge}</span>}</span><span className="block truncate text-xs muted">{t.desc}</span></span>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div><h2 className="display text-xl">Team presets</h2><div className="muted text-xs">One-click looks the team has built</div></div>
          <Link to="/presets" className="btn btn-sm btn-ghost">See all <ArrowRight size={14} /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {ps.slice(0, 5).map((p) => (
            <div key={p.id} className="panel glass-hover overflow-hidden">
              <Link to={`/create/${p.kind}?preset=${p.id}`} className={`block aspect-square ${p.cover_key ? "" : "cover-fallback"} relative`}>
                {p.cover_key && <img src={fileUrl(p.cover_key)} className="h-full w-full object-cover" alt="" loading="lazy" />}
                <span className="pill absolute left-2 top-2 bg-black/50 text-white">{p.kind}</span>
              </Link>
              <div className="p-3"><div className="truncate font-semibold">{p.name}</div><div className="muted line-clamp-2 text-xs">{p.description}</div><Link to={`/create/${p.kind}?preset=${p.id}`} className="btn mt-3 w-full !bg-white !text-ink">▶ Try now</Link></div>
            </div>
          ))}
          {!presets.loading && !ps.length && <div className="panel p-5 text-sm muted sm:col-span-2">No presets yet. <Link to="/presets/new" className="text-sun underline">Build the first one</Link>.</div>}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div><h2 className="display text-xl">Studio feed</h2><div className="muted text-xs">What the team is making</div></div>
          <Link to="/library" className="btn btn-sm btn-ghost">My generations <ArrowRight size={14} /></Link>
        </div>
        <div className="masonry">
          {(recent.data?.generations ?? []).map((g) => {
            const out = parseJson<{ key: string; mime: string }[]>(g.outputs_json, [])[0];
            return (
              <Link key={g.id} to={`/create/${g.kind}`} className="feed-card glass-hover block">
                {out ? (out.mime.startsWith("video/") ? <video src={fileUrl(out.key)} muted playsInline className="w-full" /> : <img src={fileUrl(out.key)} className="w-full" alt="" loading="lazy" />) : <div className="prose-out line-clamp-6 p-3 text-xs">{g.text_output}</div>}
                <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] muted"><span className="flex items-center gap-1.5"><ModelBadge id={g.model} />{g.user_name || g.user_email?.split("@")[0]}</span><span>{g.kind}</span></div>
              </Link>
            );
          })}
        </div>
        {!recent.loading && !(recent.data?.generations ?? []).length && <div className="panel p-5 text-sm muted">Nothing finished yet. The first generation lands here.</div>}
      </section>
    </div>
  );
}
