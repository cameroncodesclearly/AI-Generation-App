import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Clapperboard, Film, Image as ImageIcon, LayoutGrid, LibraryBig, LogOut, Settings2, Sparkles, Type, UserRound, Video } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fmtCredits } from "../lib/api";

const nav = [
  { to: "/", label: "Home", icon: Sparkles, end: true },
  { to: "/create/image", label: "Image", icon: ImageIcon },
  { to: "/create/video", label: "Video", icon: Video },
  { to: "/create/text", label: "Copy & Ideas", icon: Type },
  { to: "/presets", label: "Presets", icon: LayoutGrid },
  { to: "/analyze", label: "Analyze Video", icon: Film },
  { to: "/library", label: "Library", icon: LibraryBig },
];

export default function Shell() {
  const { me, logout } = useAuth();
  const nav_ = useNavigate();
  if (!me) return null;
  const used = me.user.credits_used;
  const pct = me.user.credit_limit ? Math.min(100, (used / me.user.credit_limit) * 100) : 0;
  return (
    <div className="flex min-h-screen">
      <div className="sky" />
      <aside className="sidebar sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-2 p-4">
        <div className="glass glass-strong flex h-full flex-col p-4">
          <NavLink to="/" className="mb-6 flex items-center gap-3 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky to-blush"><Clapperboard size={18} className="text-ink" /></span>
            <span className="leading-tight">
              <span className="display block text-[15px]">Creative</span>
              <span className="display block text-[15px]">Creators</span>
            </span>
          </NavLink>
          <nav className="flex flex-col gap-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <n.icon size={17} /> {n.label}
              </NavLink>
            ))}
            {me.user.role === "admin" && (
              <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Settings2 size={17} /> Admin</NavLink>
            )}
          </nav>
          <div className="mt-auto">
            <NavLink to="/account" className="glass block p-3 glass-hover">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="muted">Credits this period</span>
                <span className="font-semibold">{fmtCredits(me.remaining)} left</span>
              </div>
              <div className="meter"><div style={{ width: `${pct}%` }} /></div>
              <div className="mt-2 flex items-center justify-between text-[11px] muted">
                <span>{fmtCredits(used)} / {fmtCredits(me.user.credit_limit)}</span>
                <span>≈ ${(me.remaining * me.config.credit_usd).toFixed(2)}</span>
              </div>
            </NavLink>
            <div className="mt-2 flex items-center justify-between px-2 text-xs">
              <NavLink to="/account" className="flex items-center gap-2 muted hover:text-white"><UserRound size={14} /> {me.user.name || me.user.email.split("@")[0]}</NavLink>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await logout(); nav_("/login"); }} title="Sign out"><LogOut size={14} /></button>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <NavLink to="/" className="display text-xl">Creative Creators</NavLink>
          <NavLink to="/account" className="chip">{fmtCredits(me.remaining)} cr</NavLink>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `chip ${isActive ? "chip-on" : ""}`}>{n.label}</NavLink>)}
          {me.user.role === "admin" && <NavLink to="/admin" className={({ isActive }) => `chip ${isActive ? "chip-on" : ""}`}>Admin</NavLink>}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
