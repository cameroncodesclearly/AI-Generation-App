/** All spend is stored in integer units of CREDIT_USD (default $0.001) and shown to people in dollars. */
let UNIT = 0.001;
export function setUnit(u: number) { if (u > 0) UNIT = u; }
export function unit() { return UNIT; }
export function toUsd(credits: number | null | undefined): number { return (credits ?? 0) * UNIT; }
export function toCredits(usd: number): number { return Math.round(usd / UNIT); }

/** $1,234.56 for budgets; $0.039 for small runs; "<$0.001" for tiny ones. */
export function usd(n: number | null | undefined, opts: { precise?: boolean } = {}): string {
  const v = n ?? 0;
  if (v > 0 && v < 0.001) return "<$0.001";
  const digits = opts.precise || (v > 0 && v < 0.1) ? 3 : 2;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: digits === 3 ? 3 : 2, maximumFractionDigits: digits })}`;
}
export function money(credits: number | null | undefined, opts: { precise?: boolean } = {}): string { return usd(toUsd(credits), opts); }
