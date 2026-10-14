import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ChevronsUpDown, Clapperboard, Film, Home, Image as ImageIcon, LayoutGrid, LibraryBig, LogOut, Plus, Settings2, Type, Users, Video } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fmtCredits } from "../lib/api";

const create = [
  { to: "/create/image", label: "Image", icon: ImageIcon },
  { to: "/create/video", label: "Video", icon: Video },
  { to: "/create/text", label: "Copy & Ideas", icon: Type },
  { to: "/analyze", label: "Analyze Video", icon: Film },
];
const library = [
  { to: "/library", label: "My generations", icon: LibraryBig },
  { to: "/library?scope=team", label: "Community", icon: Users },
  { to: "/presets", label: "Presets", icon: LayoutGrid },
];

export default function Shell() {
  const { me, logout } = useAuth();
  const nav_ = useNavigate();
  if (!me) return null;
  const used = me.user.credits_used;
  const pct = me.user.credit_limit ? Math.min(100, (used / me.user.credit_limit) * 100) : 0;
  const item = ({ isActive }: { isActive: boolean }) => `nav-tile ${isActive ? "active" : ""}`;
  return (
    <div className="flex min-h-screen">
      <div className="sky" />
      <aside className="sidebar sticky top-0 h-screen w-60 shrink-0 p-3">
        <div className="panel flex h-full flex-col p-3">
          <div className="mb-4 flex items-center gap-2">
            <NavLink to="/" className="panel-row flex-1 !py-2">
              <span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-sky to-blush"><Clapperboard size={15} className="text-ink" /></span><span className="display text-[13px] leading-none">Creative<br />Creators</span></span>
              <ChevronsUpDown size={14} className="opacity-50" />
            </NavLink>
          </div>
          <nav className="flex flex-col gap-0.5">
            <NavLink to="/" end className={item}><span className="nav-ico"><Home size={14} /></span> Home</NavLink>
            {create.map((n) => <NavLink key={n.to} to={n.to} className={item}><span className="nav-ico"><n.icon size={14} /></span> {n.label}</NavLink>)}
          </nav>
          <div className="mt-4 mb-1 flex items-center justify-between px-2 text-[11px] muted"><span>Library</span></div>
          <nav className="flex flex-col gap-0.5">
            {library.map((n) => <NavLink key={n.to} to={n.to} className={item}><span className="nav-ico"><n.icon size={14} /></span> {n.label}</NavLink>)}
            <NavLink to="/presets/new" className={item}><span className="nav-ico !bg-white/10"><Plus size={14} /></span> New preset</NavLink>
            {me.user.role === "admin" && <NavLink to="/admin" className={item}><span className="nav-ico !bg-white/10"><Settings2 size={14} /></span> Admin</NavLink>}
          </nav>
          <div className="mt-auto">
            <NavLink to="/account" className="panel-row block !flex-col !items-stretch gap-2">
              <div className="flex items-center justify-between text-xs"><span className="muted">Credits</span><span className="font-semibold">{fmtCredits(me.remaining)} left</span></div>
              <div className="meter"><div style={{ width: `${pct}%` }} /></div>
              <div className="flex items-center justify-between text-[11px] muted"><span>{fmtCredits(used)} / {fmtCredits(me.user.credit_limit)}</span><span>≈ ${(me.remaining * me.config.credit_usd).toFixed(2)}</span></div>
            </NavLink>
            <div className="mt-2 flex items-center justify-between px-2 text-xs">
              <NavLink to="/account" className="truncate muted hover:text-white">{me.user.name || me.user.email.split("@")[0]}</NavLink>
              <button className="icon-btn" onClick={async () => { await logout(); nav_("/login"); }} title="Sign out"><LogOut size={13} /></button>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-3 md:p-4">
        <div className="mb-3 flex items-center justify-between md:hidden">
          <NavLink to="/" className="display text-xl">Creative Creators</NavLink>
          <NavLink to="/account" className="chip">{fmtCredits(me.remaining)} cr</NavLink>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto md:hidden">
          {[{ to: "/", label: "Home" }, ...create, ...library].map((n) => <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => `chip ${isActive ? "chip-on" : ""}`}>{n.label}</NavLink>)}
          {me.user.role === "admin" && <NavLink to="/admin" className={({ isActive }) => `chip ${isActive ? "chip-on" : ""}`}>Admin</NavLink>}
        </div>
        {!!me.user.must_set_password && <NavLink to="/account?setpw=1" className="panel mb-3 block border-sun/40 px-4 py-2 text-sm">You're using a temporary password. <b className="text-sun">Set your own →</b></NavLink>}
        <Outlet />
      </main>
    </div>
  );
}
