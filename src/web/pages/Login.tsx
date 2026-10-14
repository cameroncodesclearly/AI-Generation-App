import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner } from "../components/ui";

export default function Login() {
  const { me, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(params.get("error"));
  if (!loading && me) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === "password") {
        const r = await api.post<{ must_set_password: boolean }>("/api/auth/login", { email, password });
        await refresh();
        nav(r.must_set_password ? "/account?setpw=1" : "/", { replace: true });
      } else {
        const r = await api.post<{ message: string; devLink?: string }>("/api/auth/request", { email });
        setMsg(r.message); setDevLink(r.devLink ?? null);
      }
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); } finally { setBusy(false); }
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
          <input id="email" className="input" type="email" required autoFocus autoComplete="email" placeholder="you@clearskycreations.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === "password" && (<>
            <label className="label mt-3" htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" required autoComplete="current-password" placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>)}
          <button className="btn btn-sun mt-4 w-full" disabled={busy || !email || (mode === "password" && !password)}>{busy ? <Spinner /> : mode === "password" ? "Sign in" : "Email me a sign-in link"}</button>
          <button type="button" className="btn btn-ghost mt-2 w-full text-xs" onClick={() => { setMode(mode === "password" ? "link" : "password"); setErr(null); setMsg(null); }}>
            {mode === "password" ? "Forgot password, or first time here? Email me a link" : "Back to password sign-in"}
          </button>
          {msg && <p className="mt-4 text-center text-sm text-cloud">{msg}</p>}
          {devLink && <a className="mt-2 block break-all text-center text-xs text-sun underline" href={devLink}>Dev: open magic link</a>}
          {err && <p className="mt-4 text-center text-sm text-red-300">{err}</p>}
          <p className="muted mt-5 text-center text-[11px]">Accounts are created by an admin. Email links expire in 15 minutes.</p>
        </form>
      </div>
    </div>
  );
}
