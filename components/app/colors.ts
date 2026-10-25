// Colour helpers for the body map and bars (Section 6.16 colour scale).
export const mixVolt = (pct: number) => `color-mix(in oklch, var(--volt) ${Math.round(Math.max(0, Math.min(100, pct)))}%, var(--card))`;
export const NONE_FILL = 'color-mix(in oklch, var(--foreground) 8%, var(--card))';

export type VolumeBand = 'none' | 'low' | 'building' | 'on' | 'above' | 'over';
export const VOLUME_BANDS: { key: VolumeBand; label: string; fill: string }[] = [
  { key: 'none', label: 'No sets', fill: NONE_FILL },
  { key: 'low', label: 'Below 50%', fill: mixVolt(22) },
  { key: 'building', label: '50–90%', fill: mixVolt(55) },
  { key: 'on', label: 'On target', fill: 'var(--volt)' },
  { key: 'above', label: 'Above target', fill: 'var(--warn)' },
  { key: 'over', label: 'Above 20', fill: 'var(--danger)' },
];

export function volumeBand(sets: number, target: number, cap = 20): VolumeBand {
  if (sets <= 0) return 'none';
  if (sets > cap) return 'over';
  if (sets > target + 1) return 'above';
  if (sets >= target - 1) return 'on';
  if (sets >= target * 0.5) return 'building';
  return 'low';
}
export const bandFill = (b: VolumeBand) => VOLUME_BANDS.find((x) => x.key === b)!.fill;

export const RECENCY = [
  { key: '0–1 days ago', max: 1, pct: 100 },
  { key: '2–3 days ago', max: 3, pct: 62 },
  { key: '4–7 days ago', max: 7, pct: 34 },
  { key: '8+ days ago', max: Infinity, pct: 16 },
];
