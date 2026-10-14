import { useEffect, useMemo, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { Film, FolderOpen, Heart, Image as ImageIcon, Search, Type, Users } from "lucide-react";
import { api, fileUrl, parseJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDebounced, usePoll } from "../lib/hooks";
import { Lightbox, type Gen } from "../components/workspace";
import { useToast } from "../components/ui";

export default function Library() {
  const { refresh } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [toast, say] = useToast();
  const scope = sp.get("scope") === "team" ? "team" : "mine";
  const kind = sp.get("kind") ?? "";
  const fav = sp.get("favorite") === "1";
  const [q, setQ] = useState(sp.get("q") ?? "");
  const dq = useDebounced(q, 300);
  const [tile, setTile] = useState(220);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { setQ(sp.get("q") ?? ""); }, [sp]);
  const url = `/api/generations?scope=${scope}&status=done&limit=100${kind ? `&kind=${kind}` : ""}${fav ? "&favorite=1" : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`;
  const feed = usePoll(() => api.get<{ generations: Gen[] }>(url), 15000, true, [url]);
  const items = feed.data?.generations ?? [];
  const groups = useMemo(() => {
    const m = new Map<string, Gen[]>();
    for (const g of items) { const d = g.created_at.slice(0, 10); m.set(d, [...(m.get(d) ?? []), g]); }
    return [...m.entries()];
  }, [items]);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n); };
  const current = items.find((g) => g.id === sel) ?? null;
  const idx = current ? items.indexOf(current) : -1;
  const nice = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const sub = ({ isActive }: { isActive: boolean }) => `subnav ${isActive ? "active" : ""}`;
  return (
    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
      {toast}
      <aside className="panel h-fit p-2 md:sticky md:top-16">
        <NavLink to="/library" end className={({ isActive }) => sub({ isActive: isActive && !fav && scope === "mine" && !kind })}><span className="flex items-center gap-2"><FolderOpen size={15} /> Assets</span></NavLink>
        <NavLink to="/library?favorite=1" className={() => sub({ isActive: fav })}><span className="flex items-center gap-2"><Heart size={15} /> Favourites</span></NavLink>
        <NavLink to="/library?scope=team" className={() => sub({ isActive: scope === "team" })}><span className="flex items-center gap-2"><Users size={15} /> Community</span></NavLink>
        <div className="mt-3 px-2 text-[11px] muted">Tools</div>
        <NavLink to="/library?kind=image" className={() => sub({ isActive: kind === "image" })}><span className="flex items-center gap-2"><ImageIcon size={15} /> Images</span></NavLink>
        <NavLink to="/library?kind=video" className={() => sub({ isActive: kind === "video" })}><span className="flex items-center gap-2"><Film size={15} /> Video</span></NavLink>
        <NavLink to="/library?kind=text" className={() => sub({ isActive: kind === "text" })}><span className="flex items-center gap-2"><Type size={15} /> Copy</span></NavLink>
      </aside>
      <section className="panel min-w-0 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{fav ? "Favourites" : scope === "team" ? "Community" : "Assets"} <span className="text-xs muted">{items.length}</span></h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input !w-56 !py-2 pl-9 text-sm" placeholder="Search by prompt" value={q} onChange={(e) => { setQ(e.target.value); set("q", e.target.value || null); }} /></div>
            <div className="seg"><button className={scope === "mine" ? "on" : ""} onClick={() => set("scope", null)}>Mine</button><button className={scope === "team" ? "on" : ""} onClick={() => set("scope", "team")}>Team</button></div>
            <input type="range" min={120} max={360} value={tile} onChange={(e) => setTile(Number(e.target.value))} className="accent-sun" title="View size" />
          </div>
        </div>
        {groups.map(([d, gs]) => (
          <div key={d} className="mb-4">
            <div className="mb-1.5 text-sm font-semibold">{nice(d)}</div>
            <div className="grid-tiles" style={{ ["--tile" as string]: `${tile}px` }}>
              {gs.map((g) => { const o = parseJson<{ key: string; mime: string }[]>(g.outputs_json, [])[0]; return (
                <div key={g.id} onClick={() => setSel(g.id)} title={g.prompt}>
                  {o ? (o.mime.startsWith("video/") ? <video src={fileUrl(o.key)} muted playsInline onMouseOver={(e) => void e.currentTarget.play()} onMouseOut={(e) => e.currentTarget.pause()} /> : <img src={fileUrl(o.key)} alt="" loading="lazy" />) : <div className="line-clamp-[8] p-3 text-[11px] muted">{g.text_output}</div>}
                  {!!g.favorite && <span className="absolute right-1.5 top-1.5 text-blush">♥</span>}
                  {scope === "team" && g.user_email && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{g.user_name || g.user_email.split("@")[0]}</span>}
                </div>); })}
            </div>
          </div>
        ))}
        {!feed.loading && !items.length && <div className="grid min-h-[320px] place-items-center text-center"><div><div className="display text-2xl">Nothing here yet</div><p className="muted mt-2 text-sm">Finished generations are kept here with their prompts.</p></div></div>}
      </section>
      {current && <Lightbox g={current} onClose={() => setSel(null)}
        onRerun={async () => { try { await api.post(`/api/generations/${current.id}/rerun`); say("Queued a rerun"); void refresh(); } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } }}
        onDelete={async () => { if (confirm("Delete this generation?")) { await api.del(`/api/generations/${current.id}`); setSel(null); void feed.reload(); } }}
        onReuse={() => { window.location.href = `/create/${current.kind}?prompt=${encodeURIComponent(current.prompt)}&model=${encodeURIComponent(current.model)}`; }}
        onFavorite={async () => { await api.post(`/api/generations/${current.id}/favorite`); void feed.reload(); }}
        onPrev={idx > 0 ? () => setSel(items[idx - 1].id) : undefined} onNext={idx >= 0 && idx < items.length - 1 ? () => setSel(items[idx + 1].id) : undefined} />}
    </div>
  );
}
