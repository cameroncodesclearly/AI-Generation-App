import { useState } from "react";
import { Mail, Plus, RefreshCw, RotateCcw, Star } from "lucide-react";
import type { ModelInfo, User } from "../../shared/types";
import { api, fmtCredits, timeAgo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/hooks";
import { Field, Modal, Spinner, useToast } from "../components/ui";

type U = User & { generations: number; analyses: number; period_usd: number };

export default function Admin() {
  const { me } = useAuth();
  const [tab, setTab] = useState<"team" | "models" | "usage">("team");
  if (me?.user.role !== "admin") return null;
  return (
    <div className="space-y-5">
      <div><div className="eyebrow">Admin</div><h1 className="display text-4xl">Studio controls</h1></div>
      <div className="flex gap-2">{(["team", "models", "usage"] as const).map((t) => <button key={t} className={`chip ${tab === t ? "chip-on" : ""}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === "team" && <Team />}
      {tab === "models" && <Models />}
      {tab === "usage" && <Usage />}
    </div>
  );
}

function Team() {
  const { me } = useAuth();
  const [toast, say] = useToast();
  const users = usePoll(() => api.get<{ users: U[] }>("/api/admin/users"), 15000, true);
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [limit, setLimit] = useState(2000); const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<U | null>(null);
  const patch = async (u: U, body: Partial<User>) => { try { await api.patch(`/api/admin/users/${u.id}`, body); void users.reload(); say("Updated"); } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } };
  const add = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ invited: boolean; devLink?: string }>("/api/admin/users", { email, name, credit_limit: limit, role });
      say(r.invited ? `Invite sent to ${email}` : r.devLink ? "Added (dev: link in console)" : "Added; invite email not sent (check RESEND_API_KEY)");
      if (r.devLink) console.log("[invite link]", r.devLink);
      setInvite(false); setEmail(""); setName(""); void users.reload();
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      {toast}
      <div className="flex items-center justify-between"><div className="muted text-sm">{users.data?.users.length ?? 0} people · credit limits reset monthly unless set to never</div><button className="btn btn-sun" onClick={() => setInvite(true)}><Plus size={16} /> Invite</button></div>
      <div className="glass glass-strong overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="muted text-left text-xs"><tr><th className="p-3">Person</th><th className="p-3">Role</th><th className="p-3">Credits</th><th className="p-3">Spend</th><th className="p-3">Activity</th><th className="p-3"></th></tr></thead>
          <tbody>
            {(users.data?.users ?? []).map((u) => {
              const pct = u.credit_limit ? Math.min(100, (u.credits_used / u.credit_limit) * 100) : 0;
              return (
                <tr key={u.id} className={`border-t border-white/5 ${u.status === "disabled" ? "opacity-50" : ""}`}>
                  <td className="p-3"><div className="font-semibold">{u.name || u.email.split("@")[0]}</div><div className="muted text-xs">{u.email}{u.status === "disabled" ? " · disabled" : ""}</div></td>
                  <td className="p-3"><select className="select py-1 text-xs" value={u.role} disabled={u.id === me?.user.id} onChange={(e) => void patch(u, { role: e.target.value as User["role"] })}><option value="member">member</option><option value="admin">admin</option></select></td>
                  <td className="p-3 min-w-44"><div className="flex items-center justify-between text-xs"><span>{fmtCredits(u.credits_used)} / <b>{fmtCredits(u.credit_limit)}</b></span><span className="muted">{Math.round(pct)}%</span></div><div className="meter mt-1"><div style={{ width: `${pct}%` }} /></div></td>
                  <td className="p-3 text-xs"><div>${Number(u.period_usd ?? 0).toFixed(2)} real</div><div className="muted">{u.generations} gens · {u.analyses} analyses</div></td>
                  <td className="p-3 text-xs muted">{u.last_seen_at ? timeAgo(u.last_seen_at) : "never"}</td>
                  <td className="p-3"><div className="flex justify-end gap-1"><button className="btn btn-sm" onClick={() => setEdit(u)}>Edit</button><button className="btn btn-sm" title="Resend sign-in link" onClick={async () => { await api.post(`/api/admin/users/${u.id}/invite`); say("Sign-in link sent"); }}><Mail size={13} /></button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal open={invite} onClose={() => setInvite(false)} title="Invite a team member">
        <div className="space-y-3">
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly credit limit" hint={`≈ $${(limit * (me?.config.credit_usd ?? 0.01)).toFixed(0)} of model spend`}><input className="input" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
            <Field label="Role"><select className="select" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}><option value="member">Member</option><option value="admin">Admin</option></select></Field>
          </div>
          <div className="flex justify-end"><button className="btn btn-sun" onClick={add} disabled={busy || !email}>{busy ? <Spinner /> : "Add & send magic link"}</button></div>
        </div>
      </Modal>
      {edit && <EditUser u={edit} onClose={() => setEdit(null)} onChanged={() => { void users.reload(); setEdit(null); }} />}
    </div>
  );
}

function EditUser({ u, onClose, onChanged }: { u: U; onClose: () => void; onChanged: () => void }) {
  const { me } = useAuth();
  const [toast, say] = useToast();
  const [name, setName] = useState(u.name ?? ""); const [limit, setLimit] = useState(u.credit_limit); const [reset, setReset] = useState(u.period_reset); const [status, setStatus] = useState(u.status);
  const [grant, setGrant] = useState(0);
  const save = async () => {
    try {
      await api.patch(`/api/admin/users/${u.id}`, { name, credit_limit: limit, period_reset: reset, status });
      if (grant) await api.post(`/api/admin/users/${u.id}/adjust`, { delta: -grant });
      onChanged();
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); }
  };
  return (
    <Modal open onClose={onClose} title={u.email}>
      {toast}
      <div className="space-y-3">
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Credit limit per period" hint={`≈ $${(limit * (me?.config.credit_usd ?? 0.01)).toFixed(0)}`}><input className="input" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
          <Field label="Reset"><select className="select" value={reset} onChange={(e) => setReset(e.target.value as User["period_reset"])}><option value="monthly">Monthly</option><option value="never">Never (one-off pool)</option></select></Field>
          <Field label="Status"><select className="select" value={status} disabled={u.id === me?.user.id} onChange={(e) => setStatus(e.target.value as User["status"])}><option value="active">Active</option><option value="disabled">Disabled</option></select></Field>
          <Field label="One-time top-up (credits)" hint="Adds credits for this period only"><input className="input" type="number" value={grant} onChange={(e) => setGrant(Number(e.target.value))} /></Field>
        </div>
        <div className="muted text-xs">Used {fmtCredits(u.credits_used)} this period (since {u.period_start}).</div>
        <div className="flex justify-between">
          <button className="btn btn-sm" onClick={async () => { if (confirm("Reset this person's used credits to zero?")) { await api.post(`/api/admin/users/${u.id}/reset`); onChanged(); } }}><RotateCcw size={14} /> Reset usage</button>
          <button className="btn btn-sun" onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function Models() {
  const [toast, say] = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const list = usePoll(() => api.get<{ models: ModelInfo[] }>("/api/admin/models"), 60000, false);
  const update = async (m: ModelInfo, body: Record<string, unknown>) => { try { await api.patch(`/api/admin/models/${m.id}`, { ...body, kind: m.kind }); void list.reload(); } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } };
  const refresh = async () => { setRefreshing(true); try { list.setData(await api.get<{ models: ModelInfo[] }>("/api/admin/models?refresh=1")); say("Catalog refreshed from OpenRouter"); } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); } finally { setRefreshing(false); } };
  const groups = (["image", "video", "text", "analyze"] as const).map((k) => ({ k, items: (list.data?.models ?? []).filter((m) => m.kind === k) }));
  return (
    <div className="space-y-4">
      {toast}
      <div className="flex items-center justify-between"><div className="muted text-sm">Enable the models your team can use. Prices come from OpenRouter when available; override when you know better.</div><button className="btn" onClick={refresh} disabled={refreshing}>{refreshing ? <Spinner /> : <RefreshCw size={14} />} Refresh catalog</button></div>
      {groups.map((g) => (
        <div key={g.k} className="glass glass-strong overflow-x-auto">
          <div className="eyebrow px-4 pt-4">{g.k}</div>
          <table className="w-full text-sm">
            <thead className="muted text-left text-xs"><tr><th className="p-3">On</th><th className="p-3">Model</th><th className="p-3">Pricing (USD)</th><th className="p-3">Override</th><th className="p-3">Source</th></tr></thead>
            <tbody>
              {g.items.map((m) => (
                <tr key={`${m.kind}:${m.id}`} className="border-t border-white/5">
                  <td className="p-3"><input type="checkbox" checked={m.enabled} onChange={(e) => void update(m, { enabled: e.target.checked })} /></td>
                  <td className="p-3"><div className="flex items-center gap-2 font-semibold">{m.name}<button className={`btn btn-ghost btn-sm ${m.featured ? "text-sun" : "opacity-40"}`} title="Featured" onClick={() => void update(m, { featured: !m.featured })}><Star size={13} /></button></div><div className="muted text-xs">{m.id}</div></td>
                  <td className="p-3 text-xs">{m.pricing.per_image !== undefined && <div>${m.pricing.per_image.toFixed(3)} / image</div>}{m.pricing.per_second !== undefined && <div>${m.pricing.per_second.toFixed(3)} / second</div>}{m.pricing.prompt !== undefined && <div>${(m.pricing.prompt * 1e6).toFixed(2)} / M in · ${((m.pricing.completion ?? 0) * 1e6).toFixed(2)} / M out</div>}</td>
                  <td className="p-3">
                    {m.kind === "image" && <input className="input py-1 text-xs" type="number" step="0.001" placeholder="$/image" defaultValue={m.source === "override" ? m.pricing.per_image : undefined} onBlur={(e) => e.target.value !== "" && void update(m, { price_override: { per_image: Number(e.target.value) } })} />}
                    {m.kind === "video" && <input className="input py-1 text-xs" type="number" step="0.001" placeholder="$/second" defaultValue={m.source === "override" ? m.pricing.per_second : undefined} onBlur={(e) => e.target.value !== "" && void update(m, { price_override: { per_second: Number(e.target.value) } })} />}
                    {(m.kind === "text" || m.kind === "analyze") && <span className="muted text-xs">live</span>}
                    {m.source === "override" && <button className="btn btn-ghost btn-sm" onClick={() => void update(m, { price_override: null })}>clear</button>}
                  </td>
                  <td className="p-3 text-xs muted">{m.source}</td>
                </tr>
              ))}
              {!g.items.length && <tr><td className="p-3 text-xs muted" colSpan={5}>None. Add OPENROUTER_API_KEY and refresh.</td></tr>}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Usage() {
  const { me } = useAuth();
  const data = usePoll(() => api.get<{ byUser: { id: string; email: string; name: string | null; credit_limit: number; credits_used: number; period_credits: number }[]; byModel: { model: string; kind: string; runs: number; credits: number; usd: number }[]; recent: { id: string; email: string; delta: number; reason: string; ref_type: string; created_at: string }[]; totals: { month_usd: number; month_generations: number; month_analyses: number; in_flight: number } }>("/api/admin/usage"), 15000, true);
  const t = data.data?.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="glass p-4"><div className="muted text-xs">Real spend this month</div><div className="display text-3xl">${Number(t?.month_usd ?? 0).toFixed(2)}</div></div>
        <div className="glass p-4"><div className="muted text-xs">Generations</div><div className="display text-3xl">{t?.month_generations ?? 0}</div></div>
        <div className="glass p-4"><div className="muted text-xs">Analyses</div><div className="display text-3xl">{t?.month_analyses ?? 0}</div></div>
        <div className="glass p-4"><div className="muted text-xs">In flight</div><div className="display text-3xl">{t?.in_flight ?? 0}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass glass-strong p-4"><div className="eyebrow mb-2">By person (this period)</div>
          {(data.data?.byUser ?? []).map((u) => <div key={u.id} className="flex items-center justify-between py-1.5 text-sm"><span>{u.name || u.email}</span><span className="muted text-xs">{fmtCredits(u.credits_used)} / {fmtCredits(u.credit_limit)} cr ≈ ${(u.credits_used * (me?.config.credit_usd ?? 0.01)).toFixed(2)}</span></div>)}
        </div>
        <div className="glass glass-strong p-4"><div className="eyebrow mb-2">By model (30 days)</div>
          {(data.data?.byModel ?? []).map((m) => <div key={`${m.kind}${m.model}`} className="flex items-center justify-between py-1.5 text-sm"><span>{m.model.split("/").pop()} <span className="muted text-xs">{m.kind}</span></span><span className="muted text-xs">{m.runs} runs · {fmtCredits(m.credits)} cr · ${Number(m.usd).toFixed(2)}</span></div>)}
          {!(data.data?.byModel ?? []).length && <div className="muted text-sm">No completed runs yet.</div>}
        </div>
      </div>
      <div className="glass glass-strong p-4"><div className="eyebrow mb-2">Recent ledger</div>
        <div className="divide-y divide-white/5 text-sm">{(data.data?.recent ?? []).slice(0, 40).map((e) => <div key={e.id} className="flex items-center justify-between py-1.5"><span>{e.email} <span className="muted text-xs">{e.reason} · {e.ref_type}</span></span><span className="flex gap-3"><span className={e.delta > 0 ? "text-red-200" : "text-green-200"}>{e.delta > 0 ? "−" : "+"}{Math.abs(e.delta)}</span><span className="muted w-16 text-right text-xs">{timeAgo(e.created_at)}</span></span></div>)}</div>
      </div>
    </div>
  );
}
