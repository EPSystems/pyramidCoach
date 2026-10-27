export type Units = 'kg' | 'lb';
export const KG_PER_LB = 0.45359237;

export const toDisplay = (kg: number | null | undefined, units: Units): number | null =>
  kg == null ? null : units === 'kg' ? Math.round(kg * 100) / 100 : Math.round((kg / KG_PER_LB) * 10) / 10;
export const fromDisplay = (v: number, units: Units): number => (units === 'kg' ? v : Math.round(v * KG_PER_LB * 100) / 100);

export function fmtLoad(kg: number | null | undefined, units: Units): string {
  const v = toDisplay(kg, units);
  if (v == null) return '-';
  return `${Number.isInteger(v) ? v : v.toFixed(units === 'kg' ? (Math.round(v * 10) === v * 10 ? 1 : 2) : 1)} ${units}`;
}
export const fmtNum = (v: number | null | undefined, digits = 0) => (v == null ? '-' : v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));

// Height is always stored in cm; lb users enter feet + inches.
export const CM_PER_IN = 2.54;
/** Feet + inches → cm (1 decimal, the column's precision). */
export const cmFromFtIn = (ft: number, inches: number): number => Math.round((ft * 12 + inches) * CM_PER_IN * 10) / 10;
/** cm → whole feet + inches rounded to the nearest inch (5' 11.6" shows as 6' 0"). */
export function ftInFromCm(cm: number): { ft: number; in: number } {
  const total = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(total / 12), in: total % 12 };
}
