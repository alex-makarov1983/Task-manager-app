import { addDays, weekday, type DateStr } from "./dates";
import type { Recurrence } from "./recurrence";

/** Fields extracted from a quick-add line, by the AI or by the rule-based fallback. */
export type ParsedTask = {
  title: string;
  priority?: number;
  startDate?: DateStr;
  deadline?: DateStr;
  time?: string;
  tags: string[];
  projectName?: string;
  areaName?: string;
  assigneeName?: string;
  someday?: boolean;
  recurrence?: Recurrence;
  /** false → task goes to Inbox with the suggestions for the user to confirm */
  confident: boolean;
};

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/^(понедельник|пн|monday|mon)$/, 0],
  [/^(вторник|вт|tuesday|tue)$/, 1],
  [/^(среду|среда|ср|wednesday|wed)$/, 2],
  [/^(четверг|чт|thursday|thu)$/, 3],
  [/^(пятницу|пятница|пт|friday|fri)$/, 4],
  [/^(субботу|суббота|сб|saturday|sat)$/, 5],
  [/^(воскресенье|вс|sunday|sun)$/, 6],
];

function weekdayIndex(word: string): number | undefined {
  return WEEKDAY_WORDS.find(([re]) => re.test(word))?.[1];
}

/** The coming given weekday, strictly after today ("пятница" said on a Friday means next Friday). */
function nextWeekday(today: DateStr, wd: number): DateStr {
  const diff = (wd - weekday(today) + 7) % 7 || 7;
  return addDays(today, diff);
}

function relativeDay(word: string, today: DateStr): DateStr | undefined {
  switch (word) {
    case "сегодня":
    case "today":
      return today;
    case "завтра":
    case "tomorrow":
      return addDays(today, 1);
    case "послезавтра":
      return addDays(today, 2);
  }
  const wd = weekdayIndex(word);
  if (wd !== undefined) return nextWeekday(today, wd);
  const m = word.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (m) {
    const [, d, mo, y] = m;
    let year = y ? Number(y.length === 2 ? `20${y}` : y) : Number(today.slice(0, 4));
    let candidate = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!y && candidate < today) {
      year += 1;
      candidate = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return candidate;
  }
  return undefined;
}

const DEADLINE_WORDS = new Set(["до", "by", "due", "дедлайн", "deadline", "к"]);
const FILLER = new Set(["в", "во", "на", "at", "on"]);

/**
 * Rule-based parser used when no AI key is configured, and as the instant preview while typing.
 * Understands: dates (сегодня/завтра/пятница/12.11, today/tomorrow/fri), "до …" for deadlines,
 * times (15:00, 3pm), !1–!4 or p1–p4 or "срочно", #tags, +Project, "когда-нибудь", "каждый …".
 */
export function quickParse(input: string, today: DateStr): ParsedTask {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const out: ParsedTask = { title: "", tags: [], confident: true };
  const kept: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const w = raw.toLowerCase().replace(/[,.;]$/, "");
    const nextW = words[i + 1]?.toLowerCase().replace(/[,.;]$/, "");

    if (/^(!|p)[1-4]$/.test(w)) {
      out.priority = Number(w[1]);
      continue;
    }
    if (w === "срочно" || w === "urgent" || w === "asap") {
      out.priority = 1;
      continue;
    }
    if (raw.startsWith("#") && raw.length > 1) {
      out.tags.push(raw.slice(1));
      continue;
    }
    if (raw.startsWith("+") && raw.length > 1) {
      out.projectName = raw.slice(1).replace(/_/g, " ");
      continue;
    }
    if (w === "когда-нибудь" || w === "someday") {
      out.someday = true;
      continue;
    }
    if ((w === "каждый" || w === "каждую" || w === "каждое" || w === "every") && nextW) {
      const rec = recurrenceWord(nextW);
      if (rec) {
        out.recurrence = rec.rule;
        if (rec.firstDate) out.startDate ??= rec.firstDate(today);
        else out.startDate ??= today;
        i++;
        continue;
      }
    }
    if (w === "daily" || w === "weekly" || w === "monthly" || w === "yearly") {
      out.recurrence = { freq: w, interval: 1, mode: "schedule" };
      out.startDate ??= today;
      continue;
    }

    // time: 15:00, 9:30, 3pm, 10am
    const time = w.match(/^(\d{1,2}):(\d{2})$/) ?? w.match(/^(\d{1,2})(am|pm)$/);
    if (time) {
      let h = Number(time[1]);
      const min = time[2] && !/[ap]m/.test(time[2]) ? Number(time[2]) : 0;
      if (time[2] === "pm" && h < 12) h += 12;
      if (time[2] === "am" && h === 12) h = 0;
      if (h < 24 && min < 60) {
        out.time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        if (FILLER.has(kept.at(-1)?.toLowerCase() ?? "")) kept.pop();
        continue;
      }
    }

    // "до пятницы" style deadlines
    if (DEADLINE_WORDS.has(w) && nextW) {
      const d = relativeDay(genitiveToNominative(nextW), today);
      if (d) {
        out.deadline = d;
        i++;
        continue;
      }
    }
    const d = relativeDay(w, today);
    if (d) {
      out.startDate = d;
      if (FILLER.has(kept.at(-1)?.toLowerCase() ?? "")) kept.pop();
      continue;
    }
    kept.push(raw);
  }

  out.title = kept.join(" ").trim() || input.trim();
  return out;
}

// "до пятницы" → "пятница", "до среды" → "среда", "до понедельника" → "понедельник"
function genitiveToNominative(w: string): string {
  const map: Record<string, string> = {
    понедельника: "понедельник",
    вторника: "вторник",
    среды: "среда",
    четверга: "четверг",
    пятницы: "пятница",
    субботы: "суббота",
    воскресенья: "воскресенье",
    завтра: "завтра",
  };
  return map[w] ?? w;
}

function recurrenceWord(w: string): { rule: Recurrence; firstDate?: (today: DateStr) => DateStr } | null {
  const base = { interval: 1, mode: "schedule" as const };
  if (/^(день|day)$/.test(w)) return { rule: { ...base, freq: "daily" } };
  if (/^(неделю|week)$/.test(w)) return { rule: { ...base, freq: "weekly" } };
  if (/^(месяц|month)$/.test(w)) return { rule: { ...base, freq: "monthly" } };
  if (/^(год|year)$/.test(w)) return { rule: { ...base, freq: "yearly" } };
  const wd = weekdayIndex(w.replace(/у$/, "а").replace(/^(понедельника?)$/, "понедельник"));
  if (wd !== undefined)
    return {
      rule: { ...base, freq: "weekly", byWeekday: [wd] },
      firstDate: (today) => (weekday(today) === wd ? today : nextWeekday(today, wd)),
    };
  return null;
}
