import { addDays, daysInMonth, formatDate, parseDate, weekday, type DateStr } from "./dates";

export type MonthlyRule =
  | { kind: "day"; day: number }
  /** n = 1…5, or -1 for "last"; weekday 0 = Monday … 6 = Sunday */
  | { kind: "nthWeekday"; n: number; weekday: number }
  | { kind: "lastWorkday" };

export type Recurrence = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  /** weekly only: which weekdays (0 = Monday … 6 = Sunday) */
  byWeekday?: number[];
  /** monthly only; defaults to the anchor's day of month */
  monthly?: MonthlyRule;
  /** schedule: next date follows the calendar; afterCompletion: N units after the task was closed */
  mode: "schedule" | "afterCompletion";
  until?: DateStr;
  /** total number of occurrences, including the first */
  count?: number;
};

function addMonthsClamped(s: DateStr, months: number, day?: number): DateStr {
  const d = parseDate(s);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const dd = Math.min(day ?? d.getUTCDate(), daysInMonth(y, m));
  return formatDate(new Date(Date.UTC(y, m, dd)));
}

function nthWeekdayOfMonth(year: number, month0: number, n: number, wd: number): DateStr | null {
  if (n === -1) {
    const last = formatDate(new Date(Date.UTC(year, month0, daysInMonth(year, month0))));
    return addDays(last, -((weekday(last) - wd + 7) % 7));
  }
  const first = formatDate(new Date(Date.UTC(year, month0, 1)));
  const offset = (wd - weekday(first) + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  if (day > daysInMonth(year, month0)) return null;
  return formatDate(new Date(Date.UTC(year, month0, day)));
}

function lastWorkdayOfMonth(year: number, month0: number): DateStr {
  let d = formatDate(new Date(Date.UTC(year, month0, daysInMonth(year, month0))));
  while (weekday(d) > 4) d = addDays(d, -1);
  return d;
}

function monthlyCandidate(rule: MonthlyRule | undefined, anchor: DateStr, monthsAhead: number) {
  const base = addMonthsClamped(anchor, monthsAhead, 1);
  const y = parseDate(base).getUTCFullYear();
  const m = parseDate(base).getUTCMonth();
  if (!rule) return addMonthsClamped(anchor, monthsAhead);
  switch (rule.kind) {
    case "day":
      return addMonthsClamped(anchor, monthsAhead, rule.day);
    case "nthWeekday":
      return nthWeekdayOfMonth(y, m, rule.n, rule.weekday);
    case "lastWorkday":
      return lastWorkdayOfMonth(y, m);
  }
}

function nextScheduled(rule: Recurrence, anchor: DateStr): DateStr | null {
  const interval = Math.max(1, rule.interval);
  switch (rule.freq) {
    case "daily":
      return addDays(anchor, interval);
    case "weekly": {
      const days = [...new Set(rule.byWeekday ?? [])].sort();
      if (days.length === 0) return addDays(anchor, 7 * interval);
      const wd = weekday(anchor);
      const later = days.find((d) => d > wd);
      if (later !== undefined) return addDays(anchor, later - wd);
      const weekStart = addDays(anchor, -wd);
      return addDays(weekStart, 7 * interval + days[0]);
    }
    case "monthly": {
      // A month can lack the wanted date (5th Friday); look a few periods ahead.
      for (let k = 1; k <= 12; k++) {
        const c = monthlyCandidate(rule.monthly, anchor, interval * k);
        if (c && c > anchor) return c;
      }
      return null;
    }
    case "yearly":
      return addMonthsClamped(anchor, 12 * interval);
  }
}

function nextAfterCompletion(rule: Recurrence, completed: DateStr): DateStr {
  const interval = Math.max(1, rule.interval);
  switch (rule.freq) {
    case "daily":
      return addDays(completed, interval);
    case "weekly":
      return addDays(completed, 7 * interval);
    case "monthly":
      return addMonthsClamped(completed, interval);
    case "yearly":
      return addMonthsClamped(completed, 12 * interval);
  }
}

/**
 * Date of the next occurrence, or null when the series is over.
 * @param anchor the current occurrence's date (schedule mode)
 * @param completedOn the day the task was closed (afterCompletion mode)
 * @param occurrencesSoFar how many occurrences already happened, including the current one
 */
export function nextOccurrence(
  rule: Recurrence,
  anchor: DateStr,
  completedOn: DateStr,
  occurrencesSoFar: number,
): DateStr | null {
  if (rule.count !== undefined && occurrencesSoFar >= rule.count) return null;
  const next =
    rule.mode === "afterCompletion"
      ? nextAfterCompletion(rule, completedOn)
      : nextScheduled(rule, anchor);
  if (!next) return null;
  if (rule.until && next > rule.until) return null;
  return next;
}

const WEEKDAYS = {
  ru: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

export function describeRecurrence(rule: Recurrence, locale: "ru" | "en"): string {
  const ru = locale === "ru";
  const n = rule.interval;
  const every = (one: string, many: string) =>
    n === 1 ? one : ru ? `каждые ${n} ${many}` : `every ${n} ${many}`;
  let s: string;
  switch (rule.freq) {
    case "daily":
      s = every(ru ? "каждый день" : "daily", ru ? "дн." : "days");
      break;
    case "weekly":
      s = every(ru ? "каждую неделю" : "weekly", ru ? "нед." : "weeks");
      if (rule.byWeekday?.length)
        s += ": " + rule.byWeekday.map((d) => WEEKDAYS[locale][d]).join(", ");
      break;
    case "monthly":
      s = every(ru ? "каждый месяц" : "monthly", ru ? "мес." : "months");
      if (rule.monthly?.kind === "lastWorkday") s += ru ? ", последний рабочий день" : ", last workday";
      if (rule.monthly?.kind === "nthWeekday") {
        const nth = rule.monthly.n === -1 ? (ru ? "последний" : "last") : `${rule.monthly.n}-${ru ? "й" : "th"}`;
        s += `, ${nth} ${WEEKDAYS[locale][rule.monthly.weekday]}`;
      }
      if (rule.monthly?.kind === "day") s += ru ? `, ${rule.monthly.day} число` : `, day ${rule.monthly.day}`;
      break;
    case "yearly":
      s = every(ru ? "каждый год" : "yearly", ru ? "г." : "years");
      break;
  }
  if (rule.mode === "afterCompletion") s += ru ? " после выполнения" : " after completion";
  return s;
}
