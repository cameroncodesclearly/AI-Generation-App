import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner } from "../components/ui";

export default function Login() {
  const { me, loading } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(params.get("error"));
  if (!loading && me) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null);
    try { const r = await api.post<{ message: string; devLink?: string }>("/api/auth/request", { email }); setMsg(r.message); setDevLink(r.devLink ?? null); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="relative grid min-h-screen place-items-center p-6">
      <div className="sky" />
      <div className="w-full max-w-md">
        <div className="rays mb-10 text-center">
          <div className="eyebrow mb-3">Clear Sky Creations</div>
          <h1 className="display text-6xl leading-[0.9] sm:text-7xl">Creative<br />Creators</h1>
          <p className="muted mt-4 text-sm">Image, video and copy generation for the team. One studio, every model.</p>
        </div>
        <form onSubmit={submit} className="glass glass-strong p-6">
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" className="input" type="email" required autoFocus placeholder="you@clearskycreations.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-sun mt-4 w-full" disabled={busy || !email}>{busy ? <Spinner /> : "Email me a sign-in link"}</button>
          {msg && <p className="mt-4 text-center text-sm text-cloud">{msg}</p>}
          {devLink && <a className="mt-2 block break-all text-center text-xs text-sun underline" href={devLink}>Dev: open magic link</a>}
          {err && <p className="mt-4 text-center text-sm text-red-300">{err}</p>}
          <p className="muted mt-5 text-center text-[11px]">No passwords. Links expire in 15 minutes. Access is by invitation.</p>
        </form>
      </div>
    </div>
  );
}
