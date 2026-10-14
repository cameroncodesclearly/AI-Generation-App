import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Film, Image as ImageIcon, Type, Video } from "lucide-react";
import type { SpendRow } from "../../shared/types";
import { api, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { money, usd } from "../lib/money";
import { Field, useToast } from "../components/ui";

type Spending = { budget: number; spent: number; remaining: number; period_start: string; reset: string; today: number; week: number; pending: number; by_kind: Record<string, number>; rows: SpendRow[] };
const KIND: Record<string, { label: string; icon: typeof ImageIcon }> = { image: { label: "Images", icon: ImageIcon }, video: { label: "Video", icon: Video }, text: { label: "Copy", icon: Type }, analysis: { label: "Video analysis", icon: Film } };

export default function Account() {
  const { me, refresh } = useAuth();
  const [toast, say] = useToast();
  const [name, setName] = useState(me?.user.name ?? "");
  const [sp, setSp] = useSearchParams();
  const [current, setCurrent] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [pwBusy, setPwBusy] = useState(false);
  const spend = usePoll(() => api.get<Spending>("/api/auth/spending"), 10000, true);
  if (!me) return null;
  const u = me.user;
  const s = spend.data;
  const pct = s && s.budget ? Math.min(100, (s.spent / s.budget) * 100) : 0;
  const resetDate = (() => { const d = new Date(u.period_start + "T00:00:00"); d.setMonth(d.getMonth() + 1); return d.toLocaleDateString(undefined, { month: "long", day: "numeric" }); })();
  const needsPassword = !u.has_password || !!u.must_set_password || sp.get("setpw") === "1";
  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { say("Passwords don't match", "error"); return; }
    setPwBusy(true);
    try { await api.post("/api/auth/password", { password: pw, current: current || undefined }); await refresh(); setPw(""); setPw2(""); setCurrent(""); setSp({}); say("Password saved"); }
    catch (e2) { say(e2 instanceof Error ? e2.message : String(e2), "error"); } finally { setPwBusy(false); }
  };
  const kinds = Object.entries(s?.by_kind ?? {}).sort((a, b) => b[1] - a[1]);
  const maxKind = Math.max(0.0001, ...kinds.map(([, v]) => v));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {toast}
      <div><div className="eyebrow">Spending</div><h1 className="display text-3xl">{u.name || u.email.split("@")[0]}</h1></div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs muted">Left this month</div>
            <div className="display text-5xl tabular-nums">{s ? usd(s.remaining) : money(me.remaining)}</div>
            <div className="mt-1 text-xs muted">{s ? `${usd(s.spent)} spent of ${usd(s.budget)}` : ""}{u.period_reset === "monthly" ? ` · resets ${resetDate}` : " · one-off budget, no reset"}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="panel-row !block !cursor-default"><div className="text-[11px] muted">Today</div><div className="font-semibold tabular-nums">{usd(s?.today)}</div></div>
            <div className="panel-row !block !cursor-default"><div className="text-[11px] muted">Last 7 days</div><div className="font-semibold tabular-nums">{usd(s?.week)}</div></div>
            <div className="panel-row !block !cursor-default" title="Held for runs that are still going; adjusted to the exact cost when they finish"><div className="text-[11px] muted">Running now</div><div className="font-semibold tabular-nums">{usd(s?.pending)}</div></div>
          </div>
        </div>
        <div className="meter mt-4 !h-2"><div style={{ width: `${pct}%` }} /></div>
        {kinds.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {kinds.map(([k, v]) => { const K = KIND[k] ?? { label: k, icon: Type }; return (
              <div key={k} className="panel-row !block !cursor-default">
                <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 muted"><K.icon size={13} /> {K.label}</span><span className="font-semibold tabular-nums text-white">{usd(v)}</span></div>
                <div className="meter mt-2 !h-1"><div style={{ width: `${(v / maxKind) * 100}%` }} /></div>
              </div>); })}
          </div>
        )}
        <p className="mt-4 text-xs muted">Every run shows its price before it starts. The price is held while the run is going, then replaced with the exact cost the provider reports. Failed runs are refunded in full. Runs over {usd(me.config.confirm_over_usd ?? 0.5)} ask you to confirm first.</p>
      </section>

      <section className="panel p-0">
        <div className="flex items-center justify-between px-5 pb-2 pt-4"><h2 className="font-semibold">Every charge this month</h2><span className="text-xs muted">{s?.rows.length ?? 0} runs</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs muted"><tr><th className="px-5 py-2 font-medium">What</th><th className="px-3 py-2 font-medium">Model</th><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Status</th><th className="px-5 py-2 text-right font-medium">Charged</th></tr></thead>
            <tbody>
              {(s?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="max-w-[340px] px-5 py-2"><div className="flex items-center gap-2"><span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider muted">{KIND[r.kind]?.label ?? r.kind}</span><span className="truncate">{r.label}</span></div></td>
                  <td className="px-3 py-2 text-xs muted">{r.model.split("/").pop()}</td>
                  <td className="px-3 py-2 text-xs muted whitespace-nowrap">{timeAgo(r.created_at)}</td>
                  <td className="px-3 py-2 text-xs">{r.status === "done" ? (r.final ? "Exact cost" : "Estimate charged") : r.status === "failed" ? <span className="text-green-300/90">Refunded</span> : <span className="muted">Running · held</span>}</td>
                  <td className="px-5 py-2 text-right font-semibold tabular-nums">{r.status === "failed" ? <span className="muted line-through">{usd(r.estimate)}</span> : usd(r.charged, { precise: true })}</td>
                </tr>
              ))}
              {!spend.loading && !(s?.rows ?? []).length && <tr><td colSpan={5} className="px-5 py-6 text-center muted">Nothing spent yet this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <Field label="Display name"><div className="flex gap-2"><input id="display-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={async () => { await api.patch("/api/auth/me", { name }); await refresh(); say("Saved"); }}>Save</button></div></Field>
          <div className="mt-3 text-xs muted">Signed in as {u.email} · {u.role}</div>
        </div>
        <form onSubmit={savePassword} className="panel space-y-3 p-5">
          <div className="eyebrow">Password</div>
          {needsPassword && <div className="text-xs text-sun">{u.must_set_password ? "Replace your temporary password." : "Optional: set a password to sign in without Google or an email link."}</div>}
          {u.has_password && !u.must_set_password && <Field label="Current password"><input id="pw-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New password"><input id="pw-new" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Repeat"><input id="pw-repeat" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end"><button className="btn btn-sun" disabled={pwBusy || pw.length < 10}>{u.has_password ? "Change password" : "Set password"}</button></div>
        </form>
      </div>
    </div>
  );
}
