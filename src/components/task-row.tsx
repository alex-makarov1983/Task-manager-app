"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { acceptSuggestion, dismissSuggestion, setFocus, toggleDone } from "@/app/actions/tasks";
import { formatDay, PRIORITY_COLOR } from "@/lib/format";
import { getDict, type Locale } from "@/lib/i18n";
import type { TaskWithMeta } from "@/lib/queries";

type Props = {
  task: TaskWithMeta;
  locale: Locale;
  today: string;
  /** show the "pin to focus" control */
  focusControl?: "pin" | "unpin";
  hideProject?: boolean;
};

export function TaskRow({ task, locale, today, focusControl, hideProject }: Props) {
  const t = getDict(locale);
  const [pending, start] = useTransition();
  const [done, setDone] = useOptimistic(task.status === "done");

  const overdue = task.deadline && task.deadline < today && !done;
  const meta = [
    !hideProject && (task.projectName || task.areaName) && (
      <span key="p" className="inline-flex items-center gap-1">
        <span className="size-1.5 rounded-full" style={{ background: task.areaColor ?? "var(--fg-muted)" }} />
        {task.projectName ?? task.areaName}
      </span>
    ),
    task.startDate && task.startDate !== today && <span key="s">▶ {formatDay(task.startDate, today, locale)}</span>,
    task.time && <span key="t">◷ {task.time.slice(0, 5)}</span>,
    task.deadline && (
      <span key="d" className={overdue ? "font-medium text-danger" : ""}>
        ⚑ {formatDay(task.deadline, today, locale)}
      </span>
    ),
    task.recurrence && <span key="r">↻</span>,
    task.subtaskTotal > 0 && (
      <span key="st">
        ☑ {task.subtaskDone}/{task.subtaskTotal}
      </span>
    ),
    task.status === "waiting" && <span key="w" className="text-amber-600">{t.statuses.waiting}</span>,
    task.status === "in_progress" && <span key="ip" className="text-accent">{t.statuses.in_progress}</span>,
    ...task.tagNames.map((tag) => <span key={`#${tag}`}>#{tag}</span>),
  ].filter(Boolean);

  return (
    <li className={`group rounded-lg px-2 py-2 hover:bg-bg-soft ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          aria-label={done ? "Mark not done" : "Mark done"}
          onClick={() =>
            start(async () => {
              setDone(!done);
              await toggleDone(task.id, !done);
            })
          }
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] text-white transition-colors"
          style={{
            borderColor: PRIORITY_COLOR[task.priority],
            background: done ? PRIORITY_COLOR[task.priority] : "transparent",
          }}
        >
          {done ? "✓" : ""}
        </button>
        <div className="min-w-0 flex-1">
          <Link href={`/tasks/${task.id}`} className={`block text-sm leading-5 ${done ? "text-muted line-through" : ""}`}>
            {task.title}
          </Link>
          {meta.length > 0 && <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">{meta}</div>}
          {task.suggestion && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-accent-soft px-2 py-1 text-xs">
              <span className="font-medium text-accent">{t.suggestion}:</span>
              {[
                task.suggestion.projectName ?? task.suggestion.areaName,
                task.suggestion.startDate && `▶ ${formatDay(task.suggestion.startDate, today, locale)}`,
                task.suggestion.deadline && `⚑ ${formatDay(task.suggestion.deadline, today, locale)}`,
                task.suggestion.priority && `P${task.suggestion.priority}`,
                task.suggestion.assigneeName,
              ]
                .filter(Boolean)
                .join(" · ")}
              <button className="font-medium text-accent hover:underline" onClick={() => start(() => acceptSuggestion(task.id))}>
                {t.accept}
              </button>
              <button className="text-muted hover:underline" onClick={() => start(() => dismissSuggestion(task.id))}>
                {t.dismiss}
              </button>
            </div>
          )}
        </div>
        {focusControl && (
          <button
            className="shrink-0 text-xs text-muted opacity-100 hover:text-accent md:opacity-0 md:group-hover:opacity-100"
            onClick={() => start(() => setFocus(task.id, focusControl === "pin"))}
            title={focusControl === "pin" ? t.pin : t.unpin}
          >
            {focusControl === "pin" ? "☆" : "★"}
          </button>
        )}
      </div>
    </li>
  );
}

export function TaskList(props: Omit<Props, "task"> & { tasks: TaskWithMeta[]; empty?: string }) {
  const { tasks, empty, ...rest } = props;
  if (!tasks.length && empty === "") return null;
  if (!tasks.length) return <p className="px-2 py-3 text-sm text-muted">{empty ?? getDict(rest.locale).nothingHere}</p>;
  return (
    <ul className="space-y-0.5">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} {...rest} />
      ))}
    </ul>
  );
}
