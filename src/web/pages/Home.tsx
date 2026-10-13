import { Link } from "react-router-dom";
import { ArrowRight, Film, Image as ImageIcon, LayoutGrid, Type, Video } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, fileUrl, fmtCredits } from "../lib/api";
import { usePoll } from "../lib/hooks";
import type { Generation, Preset } from "../../shared/types";
import { GenerationCard } from "../components/generation";
import { Glass } from "../components/ui";

const tools = [
  { to: "/create/image", icon: ImageIcon, title: "Image", desc: "Key art, thumbnails, product shots, edits with references." },
  { to: "/create/video", icon: Video, title: "Video", desc: "Veo, Sora, Seedance and Kling from text or a first frame." },
  { to: "/create/text", icon: Type, title: "Copy & Ideas", desc: "Hooks, scripts, captions and concepts from the best writers." },
  { to: "/analyze", icon: Film, title: "Analyze Video", desc: "Drop a social video. Get transcript, summary and visual breakdown." },
];

export default function Home() {
  const { me } = useAuth();
  const presets = usePoll(() => api.get<{ presets: (Preset & { author_name?: string })[] }>("/api/presets"), 60000, false);
  const recent = usePoll(() => api.get<{ generations: Generation[] }>("/api/generations?scope=team&limit=12"), 8000, true);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="space-y-8">
      <section className="rays relative overflow-hidden rounded-3xl glass glass-strong px-6 py-10 md:px-10 md:py-14">
        <div className="eyebrow mb-3">{greet}, {me?.user.name || me?.user.email.split("@")[0]}</div>
        <h1 className="display text-5xl leading-[0.9] sm:text-6xl md:text-7xl">Creative<br />Creators</h1>
        <p className="muted mt-4 max-w-xl text-sm md:text-base">Every frontier model through one door. Your request is estimated before it runs, and you have <b className="text-white">{fmtCredits(me?.remaining)} credits</b> left this period.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/create/image" className="btn btn-sun">Start creating <ArrowRight size={16} /></Link>
          <Link to="/presets" className="btn"><LayoutGrid size={16} /> Browse presets</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tools.map((t) => (
          <Link key={t.to} to={t.to} className="glass glass-hover block p-5">
            <t.icon size={22} className="text-sun" />
            <div className="mt-3 font-semibold">{t.title}</div>
            <div className="muted mt-1 text-sm">{t.desc}</div>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div><div className="eyebrow">Team presets</div><h2 className="text-xl font-semibold">Popular looks</h2></div>
          <Link to="/presets" className="btn btn-sm btn-ghost">All presets <ArrowRight size={14} /></Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {(presets.data?.presets ?? []).slice(0, 8).map((p) => (
            <Link key={p.id} to={`/presets?run=${p.id}`} className="glass glass-hover w-44 shrink-0 overflow-hidden">
              <div className={`aspect-square ${p.cover_key ? "" : "cover-fallback"}`}>{p.cover_key && <img src={fileUrl(p.cover_key)} className="h-full w-full object-cover" alt="" loading="lazy" />}</div>
              <div className="p-3"><div className="truncate text-sm font-semibold">{p.name}</div><div className="muted text-[11px]">{p.kind} · {p.runs} runs</div></div>
            </Link>
          ))}
          {!presets.loading && !(presets.data?.presets ?? []).length && (
            <Glass className="p-5 text-sm muted">No presets yet. <Link to="/presets/new" className="text-sun underline">Build the first one</Link>.</Glass>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div><div className="eyebrow">Studio feed</div><h2 className="text-xl font-semibold">What the team is making</h2></div>
          <Link to="/library" className="btn btn-sm btn-ghost">Your library <ArrowRight size={14} /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(recent.data?.generations ?? []).map((g) => <GenerationCard key={g.id} g={g} compact />)}
        </div>
        {!recent.loading && !(recent.data?.generations ?? []).length && <Glass className="p-5 text-sm muted">Nothing yet. The first generation lands here.</Glass>}
      </section>
    </div>
  );
}
