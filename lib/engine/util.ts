// Pure helpers. Dates are ISO 'YYYY-MM-DD' strings handled in UTC so the engine never depends on the host clock.

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round1 = (x: number) => Math.round(x * 10) / 10;
export const round5 = (x: number) => Math.round(x / 5) * 5;
export const round10 = (x: number) => Math.round(x / 10) * 10;
/** Round half up (0.5 → 1) — used for deload set cuts (G6). */
export const roundHalfUp = (x: number) => Math.floor(x + 0.5 + 1e-9);

const fix = (x: number) => Math.round(x * 1000) / 1000;
export const roundToStep = (x: number, step: number) => fix(Math.round(x / step) * step);
export const roundDownToStep = (x: number, step: number) => fix(Math.floor(x / step + 1e-9) * step);
export const roundUpToStep = (x: number, step: number) => fix(Math.ceil(x / step - 1e-9) * step);

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
export function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}
export function variance(xs: number[]): number {
  if (!xs.length) return 0;
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
}
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------- Dates ----------
function toUtc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}
/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(iso: string): number {
  const wd = toUtc(iso).getUTCDay();
  return wd === 0 ? 7 : wd;
}
export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}
export function isWeekend(iso: string): boolean {
  return isoWeekday(iso) >= 6;
}
export function dateRange(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

export function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
