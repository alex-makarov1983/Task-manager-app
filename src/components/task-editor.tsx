"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSubtask, deleteTask, updateTask, type TaskPatchInput } from "@/app/actions/tasks";
import { TaskList } from "@/components/task-row";
import type { Area, Project } from "@/db/schema";
import { getDict, type Locale } from "@/lib/i18n";
import type { TaskWithMeta } from "@/lib/queries";
import { describeRecurrence, type Recurrence } from "@/lib/recurrence";

type Props = {
  task: TaskWithMeta;
  subtasks: TaskWithMeta[];
  linkedNotes: { id: string; title: string }[];
  areas: Area[];
  projects: Project[];
  people: { id: string; name: string }[];
  locale: Locale;
  today: string;
};

export function TaskEditor({ task, subtasks, linkedNotes, areas, projects, people, locale, today }: Props) {
  const t = getDict(locale);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [tags, setTags] = useState(task.tagNames.join(", "));
  const [newSub, setNewSub] = useState("");

  const save = (patch: TaskPatchInput) => start(() => updateTask(task.id, patch));
  const orNull = (v: string) => (v === "" ? null : v);

  // Placement is one select: area or project.
  const placement = task.projectId ? `p:${task.projectId}` : task.areaId ? `a:${task.areaId}` : "";

  return (
    <div className={pending ? "opacity-80" : ""}>
      <button onClick={() => router.back()} className="btn-ghost mb-3 -ml-3 px-3 py-1 text-xs">
        ← {t.back}
      </button>

      <input
        className="w-full bg-transparent text-2xl font-semibold outline-none"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
      />
      {task.parentId && (
        <Link href={`/tasks/${task.parentId}`} className="text-xs text-accent">
          ↑ {t.back}
        </Link>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t.status}>
          <select className="input" value={task.status} onChange={(e) => save({ status: e.target.value as TaskPatchInput["status"] })}>
            {Object.entries(t.statuses).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label={t.priority}>
          <select className="input" value={task.priority} onChange={(e) => save({ priority: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>{t.priorities[p]}</option>
            ))}
          </select>
        </Field>
        {!task.parentId && (
          <Field label={`${t.area} / ${t.project}`}>
            <select
              className="input"
              value={placement}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(":");
                save(kind === "p" ? { projectId: id } : kind === "a" ? { areaId: id } : { areaId: null, projectId: null });
              }}
            >
              <option value="">{t.inbox}</option>
              {areas.map((a) => (
                <optgroup key={a.id} label={a.name}>
                  <option value={`a:${a.id}`}>{a.icon} {a.name}</option>
                  {projects
                    .filter((p) => p.areaId === a.id)
                    .map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>○ {p.name}</option>
                    ))}
                </optgroup>
              ))}
              {projects
                .filter((p) => !p.areaId)
                .map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>○ {p.name}</option>
                ))}
            </select>
          </Field>
        )}
        <Field label={t.startDate}>
          <input type="date" className="input" defaultValue={task.startDate ?? ""} onChange={(e) => save({ startDate: orNull(e.target.value) })} />
        </Field>
        <Field label={t.deadline}>
          <input
            type="date"
            className={`input ${task.deadline && task.deadline < today && task.status !== "done" ? "border-danger text-danger" : ""}`}
            defaultValue={task.deadline ?? ""}
            onChange={(e) => save({ deadline: orNull(e.target.value) })}
          />
        </Field>
        <Field label={t.time}>
          <input type="time" className="input" defaultValue={task.time?.slice(0, 5) ?? ""} onChange={(e) => save({ time: orNull(e.target.value) })} />
        </Field>
        <Field label={t.assignee}>
          <select className="input" value={task.assigneeId ?? ""} onChange={(e) => save({ assigneeId: orNull(e.target.value) })}>
            <option value="">{t.none}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label={`${t.tags} (${t.tagsHint})`} wide>
          <input
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => tags !== task.tagNames.join(", ") && save({ tags: tags.split(",") })}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={task.someday} onChange={(e) => save({ someday: e.target.checked })} />
          {t.someday}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={task.personal} onChange={(e) => save({ personal: e.target.checked })} />
          {t.personal}
        </label>
      </div>

      <Field label={t.description} className="mt-5">
        <textarea
          className="input min-h-28"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && save({ description })}
        />
      </Field>

      {!task.parentId && (
        <RecurrenceEditor value={task.recurrence} locale={locale} onChange={(recurrence) => save({ recurrence })} />
      )}

      {!task.parentId && (
        <section className="mt-6">
          <h2 className="label px-2">{t.subtasks}</h2>
          <TaskList tasks={subtasks} locale={locale} today={today} hideProject empty="" />
          <form
            className="mt-1 px-2"
            onSubmit={(e) => {
              e.preventDefault();
              const title = newSub;
              setNewSub("");
              start(() => addSubtask(task.id, title));
            }}
          >
            <input className="input py-1.5" placeholder={`+ ${t.addSubtask}`} value={newSub} onChange={(e) => setNewSub(e.target.value)} />
          </form>
        </section>
      )}

      {linkedNotes.length > 0 && (
        <section className="mt-6">
          <h2 className="label px-2">{t.linkedNotes}</h2>
          <ul className="px-2 text-sm">
            {linkedNotes.map((n) => (
              <li key={n.id}>
                <Link className="text-accent hover:underline" href={`/notes/${n.id}`}>✎ {n.title || t.untitled}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 border-t border-line pt-4">
        <button
          className="btn-ghost text-danger"
          onClick={() => {
            if (!confirm(t.confirmDelete)) return;
            start(async () => {
              await deleteTask(task.id);
              router.back();
            });
          }}
        >
          {t.delete}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, wide, className = "" }: { label: string; children: React.ReactNode; wide?: boolean; className?: string }) {
  return (
    <label className={`block ${wide ? "col-span-2 sm:col-span-3" : ""} ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function RecurrenceEditor({ value, locale, onChange }: { value: Recurrence | null; locale: Locale; onChange: (r: Recurrence | null) => void }) {
  const t = getDict(locale);
  const [open, setOpen] = useState(false);
  const r: Recurrence = value ?? { freq: "weekly", interval: 1, mode: "schedule" };
  const set = (patch: Partial<Recurrence>) => onChange({ ...r, ...patch });

  return (
    <section className="mt-5 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">
          ↻ {t.repeat}: <span className="text-muted">{value ? describeRecurrence(value, locale) : t.noRepeat}</span>
        </span>
        <div className="flex gap-2">
          {value && (
            <button className="btn-ghost py-1 text-xs" onClick={() => onChange(null)}>
              {t.noRepeat}
            </button>
          )}
          <button className="btn-ghost py-1 text-xs" onClick={() => setOpen(!open)}>
            {open ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <label>
            <span className="label">{t.every}</span>
            <input type="number" min={1} className="input" value={r.interval} onChange={(e) => set({ interval: Math.max(1, Number(e.target.value)) })} />
          </label>
          <label>
            <span className="label">&nbsp;</span>
            <select
              className="input"
              value={r.freq}
              onChange={(e) => set({ freq: e.target.value as Recurrence["freq"], byWeekday: undefined, monthly: undefined })}
            >
              {Object.entries(t.freq).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">{t.repeatMode}</span>
            <select className="input" value={r.mode} onChange={(e) => set({ mode: e.target.value as Recurrence["mode"] })}>
              <option value="schedule">{t.bySchedule}</option>
              <option value="afterCompletion">{t.afterCompletion}</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label">{t.until}</span>
              <input type="date" className="input px-1" value={r.until ?? ""} onChange={(e) => set({ until: e.target.value || undefined })} />
            </label>
            <label>
              <span className="label">{t.times}</span>
              <input
                type="number"
                min={1}
                className="input"
                value={r.count ?? ""}
                onChange={(e) => set({ count: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
          </div>

          {r.freq === "weekly" && r.mode === "schedule" && (
            <div className="col-span-2 sm:col-span-4">
              <span className="label">{t.onWeekdays}</span>
              <div className="flex gap-1">
                {t.weekdaysShort.map((d, i) => {
                  const on = r.byWeekday?.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`size-9 rounded-lg border text-xs ${on ? "border-accent bg-accent text-white" : "border-line"}`}
                      onClick={() =>
                        set({ byWeekday: on ? r.byWeekday!.filter((x) => x !== i) : [...(r.byWeekday ?? []), i].sort() })
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {r.freq === "monthly" && r.mode === "schedule" && (
            <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-4">
              <label>
                <span className="label">{t.monthlyBy}</span>
                <select
                  className="input"
                  value={r.monthly?.kind ?? ""}
                  onChange={(e) => {
                    const kind = e.target.value;
                    set({
                      monthly:
                        kind === "nthWeekday"
                          ? { kind, n: 1, weekday: 0 }
                          : kind === "lastWorkday"
                            ? { kind }
                            : undefined,
                    });
                  }}
                >
                  <option value="">{t.sameDay}</option>
                  <option value="nthWeekday">{t.nthWeekday}</option>
                  <option value="lastWorkday">{t.lastWorkday}</option>
                </select>
              </label>
              {r.monthly?.kind === "nthWeekday" && (
                <>
                  <label>
                    <span className="label">&nbsp;</span>
                    <select
                      className="input"
                      value={r.monthly.n}
                      onChange={(e) => set({ monthly: { kind: "nthWeekday", n: Number(e.target.value), weekday: (r.monthly as { weekday: number }).weekday } })}
                    >
                      {t.nth.map((label, i) => (
                        <option key={label} value={i + 1}>{label}</option>
                      ))}
                      <option value={-1}>{t.last}</option>
                    </select>
                  </label>
                  <label>
                    <span className="label">&nbsp;</span>
                    <select
                      className="input"
                      value={r.monthly.weekday}
                      onChange={(e) => set({ monthly: { kind: "nthWeekday", n: (r.monthly as { n: number }).n, weekday: Number(e.target.value) } })}
                    >
                      {t.weekdaysShort.map((d, i) => (
                        <option key={d} value={i}>{d}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
