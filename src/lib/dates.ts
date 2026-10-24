// Calendar dates are handled as "YYYY-MM-DD" strings (Postgres `date`) and computed in UTC
// so that adding days never drifts across DST boundaries.

export type DateStr = string;

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday */
export function weekday(s: DateStr): number {
  return (parseDate(s).getUTCDay() + 6) % 7;
}

export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

/** Today's date in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): DateStr {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
