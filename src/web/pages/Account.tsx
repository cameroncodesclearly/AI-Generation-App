import { useState } from "react";
import type { LedgerEntry } from "../../shared/types";
import { api, fmtCredits, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { Field, useToast } from "../components/ui";

export default function Account() {
  const { me, refresh } = useAuth();
  const [toast, say] = useToast();
  const [name, setName] = useState(me?.user.name ?? "");
  const ledger = usePoll(() => api.get<{ entries: LedgerEntry[] }>("/api/auth/ledger"), 15000, false);
  if (!me) return null;
  const u = me.user;
  return (
    <div className="max-w-3xl space-y-5">
      {toast}
      <div><div className="eyebrow">Account</div><h1 className="display text-4xl">{u.name || u.email.split("@")[0]}</h1></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass p-4"><div className="muted text-xs">Credits left</div><div className="display text-3xl">{fmtCredits(me.remaining)}</div><div className="muted text-[11px]">≈ ${(me.remaining * me.config.credit_usd).toFixed(2)} of spend</div></div>
        <div className="glass p-4"><div className="muted text-xs">Used this period</div><div className="display text-3xl">{fmtCredits(u.credits_used)}</div><div className="muted text-[11px]">of {fmtCredits(u.credit_limit)} · resets {u.period_reset === "monthly" ? "monthly" : "never"}</div></div>
        <div className="glass p-4"><div className="muted text-xs">1 credit =</div><div className="display text-3xl">${me.config.credit_usd.toFixed(2)}</div><div className="muted text-[11px]">{u.role} · since {u.created_at.slice(0, 10)}</div></div>
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
