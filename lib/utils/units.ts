export type Units = 'kg' | 'lb';
export const KG_PER_LB = 0.45359237;

export const toDisplay = (kg: number | null | undefined, units: Units): number | null =>
  kg == null ? null : units === 'kg' ? Math.round(kg * 100) / 100 : Math.round((kg / KG_PER_LB) * 10) / 10;
export const fromDisplay = (v: number, units: Units): number => (units === 'kg' ? v : Math.round(v * KG_PER_LB * 100) / 100);

export function fmtLoad(kg: number | null | undefined, units: Units): string {
  const v = toDisplay(kg, units);
  if (v == null) return '—';
  return `${Number.isInteger(v) ? v : v.toFixed(units === 'kg' ? (Math.round(v * 10) === v * 10 ? 1 : 2) : 1)} ${units}`;
}
export const fmtNum = (v: number | null | undefined, digits = 0) => (v == null ? '—' : v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
