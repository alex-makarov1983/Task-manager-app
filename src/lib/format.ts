import { diffDays, parseDate, type DateStr } from "./dates";
import type { Locale } from "./i18n";

/** Short human date: "сегодня", "завтра", "пт", "12 нояб." */
export function formatDay(date: DateStr, today: DateStr, locale: Locale): string {
  const diff = diffDays(date, today);
  const ru = locale === "ru";
  if (diff === 0) return ru ? "сегодня" : "today";
  if (diff === 1) return ru ? "завтра" : "tomorrow";
  if (diff === -1) return ru ? "вчера" : "yesterday";
  const d = parseDate(date);
  const tag = ru ? "ru-RU" : "en-US";
  if (diff > 1 && diff < 7) return d.toLocaleDateString(tag, { weekday: "short", timeZone: "UTC" });
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString(tag, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

export function formatLongDay(date: DateStr, locale: Locale): string {
  return parseDate(date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export const PRIORITY_COLOR: Record<number, string> = {
  1: "#dc2626",
  2: "#f59e0b",
  3: "#3b82f6",
  4: "#a1a1aa",
};
