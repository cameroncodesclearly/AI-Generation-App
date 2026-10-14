import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner } from "../components/ui";

export default function Login() {
  const { me, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"link" | "password">("link");
  const [providers, setProviders] = useState<{ google: boolean; email: boolean }>({ google: false, email: true });
  useEffect(() => { api.get<{ google: boolean; email: boolean }>("/api/auth/providers").then(setProviders).catch(() => {}); }, []);
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
        const r = await api.post<{ message: string; devLink?: string; demo?: boolean }>("/api/auth/request", { email });
        setMsg(r.message); setDevLink(r.devLink ?? null);
        if (r.demo) { await refresh(); nav("/", { replace: true }); }
      }
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); } finally { setBusy(false); }
  };

  return (
    <div className="relative grid min-h-screen place-items-center p-6">
      <div className="sky" />
      <div className="w-full max-w-md">
        <div className="rays mb-10 text-center">
          <div className="eyebrow mb-3">Clear Sky Creations</div>
          <h1 className="display display-sun text-6xl leading-[0.9] sm:text-7xl">Creative<br />Creators</h1>
          <p className="muted mt-4 text-sm">Image, video and copy generation for the team. One studio, every model.</p>
        </div>
        <form onSubmit={submit} className="glass glass-strong p-6">
          {providers.google && (<>
            <a href="/api/auth/google" className="btn w-full !bg-white !py-3 !text-ink" onClick={async (e) => { if (!providers.google) return; const r = await api.post<{ demo?: boolean }>("/api/auth/google").catch(() => null); if (r?.demo) { e.preventDefault(); await refresh(); nav("/", { replace: true }); } }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.4 5.7c4.3-4 7.1-9.9 7.1-17.4z"/><path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.5 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
              Continue with Google
            </a>
            <div className="my-4 flex items-center gap-3 text-[11px] muted"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
          </>)}
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" className="input" type="email" required autoFocus autoComplete="email" placeholder="you@clearskycreations.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === "password" && (<>
            <label className="label mt-3" htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" required autoComplete="current-password" placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>)}
          <button className="btn btn-sun mt-4 w-full" disabled={busy || !email || (mode === "password" && !password)}>{busy ? <Spinner /> : mode === "password" ? "Sign in" : "Email me a sign-in link"}</button>
          <button type="button" className="btn btn-ghost mt-2 w-full text-xs" onClick={() => { setMode(mode === "password" ? "link" : "password"); setErr(null); setMsg(null); }}>
            {mode === "password" ? "Email me a sign-in link instead" : "Sign in with a password"}
          </button>
          {msg && <p className="mt-4 text-center text-sm text-cloud">{msg}</p>}
          {devLink && <a className="mt-2 block break-all text-center text-xs text-sun underline" href={devLink}>Dev: open magic link</a>}
          {err && <p className="mt-4 text-center text-sm text-red-300">{err}</p>}
          <p className="muted mt-5 text-center text-[11px]">{providers.google ? "Team Google accounts get in automatically. " : "Accounts are created by an admin. "}Email links expire in 15 minutes.</p>
        </form>
      </div>
    </div>
  );
}
