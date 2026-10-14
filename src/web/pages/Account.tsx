import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { LedgerEntry } from "../../shared/types";
import { api, fmtCredits, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { Field, useToast } from "../components/ui";

export default function Account() {
  const { me, refresh } = useAuth();
  const [toast, say] = useToast();
  const [name, setName] = useState(me?.user.name ?? "");
  const [sp, setSp] = useSearchParams();
  const [current, setCurrent] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [pwBusy, setPwBusy] = useState(false);
  const needsPassword = !me?.user.has_password || !!me?.user.must_set_password || sp.get("setpw") === "1";
  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { say("Passwords don't match", "error"); return; }
    setPwBusy(true);
    try { await api.post("/api/auth/password", { password: pw, current: current || undefined }); await refresh(); setPw(""); setPw2(""); setCurrent(""); setSp({}); say("Password saved"); }
    catch (e2) { say(e2 instanceof Error ? e2.message : String(e2), "error"); } finally { setPwBusy(false); }
  };
  const ledger = usePoll(() => api.get<{ entries: LedgerEntry[] }>("/api/auth/ledger"), 15000, false);
  if (!me) return null;
  const u = me.user;
  return (
    <div className="max-w-3xl space-y-5">
      {toast}
      <div><div className="eyebrow">Account</div><h1 className="display text-2xl">{u.name || u.email.split("@")[0]}</h1></div>
      {needsPassword && <div className="glass border-sun/40 p-4 text-sm"><b className="text-sun">{u.must_set_password ? "Replace your temporary password." : "Set a password."}</b> You can then sign in with email and password instead of waiting for a link.</div>}
      <form onSubmit={savePassword} className="glass glass-strong space-y-3 p-5">
        <div className="eyebrow">Password</div>
        {u.has_password && !u.must_set_password && <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password" hint="At least 10 characters with a letter and a number"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Repeat"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end"><button className="btn btn-sun" disabled={pwBusy || pw.length < 10}>{u.has_password ? "Change password" : "Set password"}</button></div>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass p-4"><div className="muted text-xs">Credits left</div><div className="display text-2xl">{fmtCredits(me.remaining)}</div><div className="muted text-[11px]">≈ ${(me.remaining * me.config.credit_usd).toFixed(2)} of spend</div></div>
        <div className="glass p-4"><div className="muted text-xs">Used this period</div><div className="display text-2xl">{fmtCredits(u.credits_used)}</div><div className="muted text-[11px]">of {fmtCredits(u.credit_limit)} · resets {u.period_reset === "monthly" ? "monthly" : "never"}</div></div>
        <div className="glass p-4"><div className="muted text-xs">1 credit =</div><div className="display text-2xl">${me.config.credit_usd.toFixed(2)}</div><div className="muted text-[11px]">{u.role} · since {u.created_at.slice(0, 10)}</div></div>
      </div>
      <div className="glass glass-strong p-5">
        <Field label="Display name"><div className="flex gap-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={async () => { await api.patch("/api/auth/me", { name }); await refresh(); say("Saved"); }}>Save</button></div></Field>
        <div className="muted mt-3 text-xs">Signed in as {u.email}. Credits are estimated before each run and reconciled to the real cost afterwards, so the number you see first is the most you will pay.</div>
      </div>
      <div className="glass glass-strong p-5">
        <div className="eyebrow mb-3">Credit history</div>
        <div className="divide-y divide-white/5 text-sm">
          {(ledger.data?.entries ?? []).map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2">
              <div><span className="capitalize">{e.reason}</span> <span className="muted text-xs">{e.ref_type} {e.ref_id?.slice(0, 12)}</span></div>
              <div className="flex items-center gap-3"><span className={e.delta > 0 ? "text-red-200" : "text-green-200"}>{e.delta > 0 ? "−" : "+"}{fmtCredits(Math.abs(e.delta))}</span><span className="muted w-16 text-right text-xs">{timeAgo(e.created_at)}</span></div>
            </div>
          ))}
          {!(ledger.data?.entries ?? []).length && <div className="muted py-2">No activity yet.</div>}
        </div>
      </div>
    </div>
  );
}
