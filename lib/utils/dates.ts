import { formatInTimeZone } from 'date-fns-tz';

/** "Today" in the user's timezone as an ISO date (all day/week logic uses this, Section 11). */
export function todayIn(tz: string, now: Date = new Date()): string {
  try {
    return formatInTimeZone(now, tz, 'yyyy-MM-dd');
  } catch {
    return formatInTimeZone(now, 'Europe/Sofia', 'yyyy-MM-dd');
  }
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayShort = (iso1to7: number) => WD[iso1to7 - 1];
export const weekdayLong = (iso1to7: number) => WD_LONG[iso1to7 - 1];

export function prettyDate(iso: string, opts?: { weekday?: boolean }): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
  return `${opts?.weekday === false ? '' : `${WD[wd - 1]} `}${d} ${MON[m - 1]}`;
}
