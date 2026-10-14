import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { setUnit } from "./money";
import type { User } from "../../shared/types";

export interface MeResponse {
  user: User;
  remaining: number;
  config: { app_name: string; credit_usd: number; markup: number; nas_bridge: boolean; openrouter: boolean; email: boolean; google: boolean; research?: boolean; confirm_over_usd?: number };
}

interface AuthCtx {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ me: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const r = await api.get<MeResponse>("/api/auth/me"); setUnit(r.config.credit_usd); setMe(r); } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const logout = useCallback(async () => { await api.post("/api/auth/logout"); setMe(null); }, []);
  return <Ctx.Provider value={{ me, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
