import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { useCopy } from "../lib/hooks";

export function Glass({ children, className = "", strong = false, hover = false, onClick }: { children: ReactNode; className?: string; strong?: boolean; hover?: boolean; onClick?: () => void }) {
  return <div onClick={onClick} className={`glass ${strong ? "glass-strong" : ""} ${hover ? "glass-hover" : ""} ${className}`}>{children}</div>;
}

export function StatusPill({ status }: { status: string }) {
  const label = status === "running" ? "Generating" : status;
  return <span className={`pill pill-${status}`}>{status === "running" && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}{label}</span>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] muted">{hint}</span>}
    </label>
  );
}

export function CopyButton({ text, id, label = "Copy" }: { text: string; id?: string; label?: string }) {
  const [copied, copy] = useCopy();
  const key = id ?? label;
  return (
    <button type="button" className="btn btn-sm" onClick={() => copy(text, key)} disabled={!text}>
      {copied === key ? <Check size={14} /> : <Copy size={14} />} {copied === key ? "Copied" : label}
    </button>
  );
}

export function CopyBlock({ title, text, mono = false }: { title: string; text: string; mono?: boolean }) {
  return (
    <div className="glass p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="eyebrow">{title}</div>
        <CopyButton text={text} id={title} />
      </div>
      <div className={`prose-out max-h-72 overflow-auto scrollbar-thin ${mono ? "font-mono text-[13px]" : ""}`}>{text || <span className="muted">—</span>}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className={`glass glass-strong fade-in max-h-[92vh] w-full overflow-auto scrollbar-thin rounded-t-3xl p-6 sm:rounded-3xl ${wide ? "sm:max-w-5xl" : "sm:max-w-2xl"}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="display text-2xl">{title}</div>
      {children && <div className="muted max-w-md text-sm">{children}</div>}
    </div>
  );
}

export function Toast({ message, kind = "info", onDone }: { message: string; kind?: "info" | "error"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 4200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`glass glass-strong fade-in fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 px-4 py-3 text-sm ${kind === "error" ? "border-red-400/40 text-red-100" : ""}`}>{message}</div>
  );
}

export function useToast(): [ReactNode, (m: string, kind?: "info" | "error") => void] {
  const [t, setT] = useState<{ m: string; k: "info" | "error" } | null>(null);
  const node = t ? <Toast message={t.m} kind={t.k} onDone={() => setT(null)} /> : null;
  return [node, (m, k = "info") => setT({ m, k })];
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white ${className}`} />;
}
