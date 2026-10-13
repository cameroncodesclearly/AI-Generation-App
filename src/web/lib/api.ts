export class ApiError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

async function handle<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const b = (typeof body === "object" && body ? body : {}) as Record<string, unknown>;
    throw new ApiError(res.status, (b.error as string) || (typeof body === "string" && body) || `Request failed (${res.status})`, b);
  }
  return body as T;
}

export const api = {
  get: <T>(url: string) => fetch(url, { credentials: "include" }).then((r) => handle<T>(r)),
  post: <T>(url: string, data?: unknown) => fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) }).then((r) => handle<T>(r)),
  put: <T>(url: string, data?: unknown) => fetch(url, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? {}) }).then((r) => handle<T>(r)),
  patch: <T>(url: string, data?: unknown) => fetch(url, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? {}) }).then((r) => handle<T>(r)),
  del: <T>(url: string) => fetch(url, { method: "DELETE", credentials: "include" }).then((r) => handle<T>(r)),
  form: <T>(url: string, form: FormData) => fetch(url, { method: "POST", credentials: "include", body: form }).then((r) => handle<T>(r)),
};

export function fileUrl(key: string | null | undefined, download = false): string {
  if (!key) return "";
  return `/files/${key.split("/").map(encodeURIComponent).join("/")}${download ? "?download=1" : ""}`;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function fmtCredits(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return n.toLocaleString();
}

export function timeAgo(iso: string): string {
  const t = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")).getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
