import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Clapperboard, FolderOpen, Search } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fmtCredits } from "../lib/api";
import SearchOverlay from "./SearchOverlay";

const links = [
  { to: "/", label: "Explore", end: true },
  { to: "/create/image", label: "Image" },
  { to: "/create/video", label: "Video" },
  { to: "/create/text", label: "Copy" },
  { to: "/analyze", label: "Analyze", badge: "New" },
  { to: "/presets", label: "Presets" },
];

export default function Shell() {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  if (!me) return null;
  const pct = me.user.credit_limit ? Math.min(100, (me.user.credits_used / me.user.credit_limit) * 100) : 0;
  const initials = (me.user.name || me.user.email)[0]?.toUpperCase();
  return (
    <div className="min-h-screen">
      <div className="sky" />
      <header className="topnav">
        <NavLink to="/" className="mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky to-blush" title="Creative Creators"><Clapperboard size={16} className="text-ink" /></NavLink>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-thin">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `topnav-link flex items-center gap-1.5 ${isActive ? "active" : ""}`}>{l.label}{l.badge && <span className="badge badge-new">{l.badge}</span>}</NavLink>)}
        </nav>
        <button className="icon-btn" title="Search (⌘K)" onClick={() => setSearch(true)}><Search size={15} /></button>
        <NavLink to="/account" className="cchip !py-1.5" title={`${fmtCredits(me.user.credits_used)} of ${fmtCredits(me.user.credit_limit)} used`}>
          <span className="meter !h-1.5 w-12"><div style={{ width: `${pct}%` }} /></span>
          <span className="text-sun">✦ {fmtCredits(me.remaining)}</span>
        </NavLink>
        <NavLink to="/library" className={({ isActive }) => `cchip !py-1.5 ${isActive ? "!text-sun" : ""}`}><FolderOpen size={14} /> Assets</NavLink>
        <div className="relative">
          <button className="ml-1 grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/10 text-xs font-bold" onClick={() => setMenu((m) => !m)}>{me.user.avatar_url ? <img src={me.user.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initials}</button>
          {menu && (<>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="menu right-0 top-[calc(100%+8px)] w-56">
              <div className="px-3 py-2"><div className="truncate text-sm font-semibold">{me.user.name || me.user.email.split("@")[0]}</div><div className="truncate text-xs muted">{me.user.email}</div></div>
              <NavLink to="/account" className="menu-item" onClick={() => setMenu(false)}>Account & credits</NavLink>
              <NavLink to="/library?favorite=1" className="menu-item" onClick={() => setMenu(false)}>Favourites</NavLink>
              <NavLink to="/presets/new" className="menu-item" onClick={() => setMenu(false)}>New preset</NavLink>
              {me.user.role === "admin" && <NavLink to="/admin" className="menu-item" onClick={() => setMenu(false)}>Admin</NavLink>}
              <button className="menu-item btn-danger" onClick={async () => { await logout(); nav("/login"); }}>Sign out</button>
            </div>
          </>)}
        </div>
      </header>
      <main className="p-3 md:p-4">
        {!!me.user.must_set_password && <NavLink to="/account?setpw=1" className="panel mb-3 block border-sun/40 px-4 py-2 text-sm">You're using a temporary password. <b className="text-sun">Set your own →</b></NavLink>}
        <Outlet />
      </main>
      <SearchOverlay open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
