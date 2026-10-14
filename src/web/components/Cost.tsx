import { useEffect, useRef } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type { Estimate, Generation } from "../../shared/types";
import { money, toUsd, usd } from "../lib/money";
import { Modal } from "./ui";

/** Price shown on a generation: the final charge, an estimate while running, or "refunded". */
export function CostTag({ g, className = "" }: { g: Pick<Generation, "status" | "estimate_credits" | "actual_credits" | "cost_usd">; className?: string }) {
  if (g.status === "failed") return <span className={`text-green-300/90 ${className}`} title="Failed runs are refunded in full">refunded</span>;
  if (g.status === "done") return <span className={className} title={g.cost_usd !== null ? "Charged the exact cost the provider reported" : "The provider didn't report a cost, so the estimate was charged"}>{money(g.actual_credits ?? g.estimate_credits)}{g.cost_usd === null ? " (est.)" : ""}</span>;
  return <span className={`opacity-80 ${className}`} title="Held from your budget while it runs; adjusted to the exact cost when it finishes">~{money(g.estimate_credits)} held</span>;
}

export function needsConfirm(est: Estimate | null, remainingCredits: number, confirmOverUsd: number): boolean {
  if (!est) return false;
  return est.usd >= confirmOverUsd || est.credits > remainingCredits * 0.25;
}

/** Confirmation shown before an expensive run. */
export function CostConfirm({ open, est, remainingCredits, what, onConfirm, onCancel }: { open: boolean; est: Estimate | null; remainingCredits: number; what: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open || !est) return null;
  const after = toUsd(remainingCredits) - est.usd;
  return (
    <Modal open onClose={onCancel} title="Confirm this run">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm muted">{what}</div>
          <div className="display text-3xl">{usd(est.usd)}</div>
        </div>
        <ul className="space-y-1 text-sm">{est.breakdown.map((b) => <li key={b} className="flex gap-2"><span className="muted">·</span>{b}</li>)}</ul>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="panel p-3"><div className="text-[11px] muted">Left now</div><div className="font-semibold">{money(remainingCredits)}</div></div>
          <div className="panel p-3"><div className="text-[11px] muted">Left after this run</div><div className={`font-semibold ${after < 0 ? "text-red-300" : ""}`}>{usd(Math.max(0, after))}</div></div>
        </div>
        {est.warning && <p className="text-xs muted">{est.warning}</p>}
        <p className="text-xs muted">The price is held now and adjusted to the exact cost when the run finishes. Failed runs are refunded.</p>
        <div className="flex justify-end gap-2"><button className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-sun" onClick={onConfirm} autoFocus>Spend {usd(est.usd)}</button></div>
      </div>
    </Modal>
  );
}

/** Watches a feed and announces each finished run's real charge. */
export function useChargeNotices(items: Generation[], say: (m: string, k?: "info" | "error") => void) {
  const seen = useRef<Map<string, string>>(new Map());
  const first = useRef(true);
  useEffect(() => {
    for (const g of items) {
      const prev = seen.current.get(g.id);
      if (!first.current && prev && prev !== g.status) {
        if (g.status === "done") {
          const diff = (g.actual_credits ?? g.estimate_credits) - g.estimate_credits;
          say(`Finished · charged ${money(g.actual_credits ?? g.estimate_credits)}${diff ? ` (estimate was ${money(g.estimate_credits)})` : ""}`);
        } else if (g.status === "failed") say(`Failed · ${money(g.estimate_credits)} refunded. ${g.error ?? ""}`.trim(), "error");
      }
      seen.current.set(g.id, g.status);
    }
    first.current = false;
  }, [items, say]);
}

export function LowBudget({ remainingCredits, limitCredits }: { remainingCredits: number; limitCredits: number }) {
  if (!limitCredits || remainingCredits / limitCredits > 0.1) return null;
  return <div className="panel mb-3 flex items-center gap-2 border-red-400/30 px-4 py-2 text-sm"><AlertTriangle size={15} className="text-red-300" /> {remainingCredits <= 0 ? "Your budget for this month is used up." : `Only ${money(remainingCredits)} left this month.`} Ask an admin for a top-up if you need more.</div>;
}

export function NotionLink({ url, children }: { url: string | null; children: React.ReactNode }) {
  return url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">{children}<ExternalLink size={11} /></a> : <>{children}</>;
}
