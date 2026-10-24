"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, areas, projects, tags, taskTags, tasks, type Task } from "@/db/schema";
import { parseTasks } from "@/lib/ai-parse";
import { requireViewer, type Viewer } from "@/lib/auth";
import { diffDays, addDays, todayIn } from "@/lib/dates";
import type { ParsedTask } from "@/lib/quick-parse";
import { nextOccurrence } from "@/lib/recurrence";
import { allProjects, inboxWhere, workspacePeople } from "@/lib/queries";

const refresh = () => revalidatePath("/", "layout");

async function log(viewer: Viewer, entityId: string, action: string, meta?: Record<string, unknown>) {
  await db.insert(activityLog).values({
    workspaceId: viewer.workspaceId,
    actorId: viewer.userId,
    entityType: "task",
    entityId,
    action,
    meta,
  });
}

async function ownedTask(viewer: Viewer, id: string) {
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, viewer.workspaceId)));
  if (!t) throw new Error("Task not found");
  return t;
}

async function assertInWorkspace(viewer: Viewer, ref: { areaId?: string | null; projectId?: string | null }) {
  if (ref.areaId) {
    const [a] = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, ref.areaId), eq(areas.workspaceId, viewer.workspaceId)));
    if (!a) throw new Error("Area not found");
  }
  if (ref.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, ref.projectId), eq(projects.workspaceId, viewer.workspaceId)));
    if (!p) throw new Error("Project not found");
  }
}

async function setTags(viewer: Viewer, taskId: string, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
  if (!clean.length) return;
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.workspaceId, viewer.workspaceId), inArray(tags.name, clean)));
  const missing = clean.filter((n) => !existing.some((e) => e.name === n));
  const created = missing.length
    ? await db.insert(tags).values(missing.map((name) => ({ workspaceId: viewer.workspaceId, name }))).returning()
    : [];
  await db.insert(taskTags).values([...existing, ...created].map((t) => ({ taskId, tagId: t.id })));
}

async function loadLookups(viewer: Viewer) {
  const [projectRows, areaRows, people] = await Promise.all([
    allProjects(viewer),
    db.select().from(areas).where(eq(areas.workspaceId, viewer.workspaceId)),
    workspacePeople(viewer),
  ]);
  return {
    projectRows,
    areaRows,
    people,
    context: (today: string) => ({
      today,
      projects: projectRows.map((p) => p.name),
      areas: areaRows.map((a) => a.name),
      people: people.map((p) => p.name),
    }),
  };
}

type Lookups = Awaited<ReturnType<typeof loadLookups>>;

/** Map a parsed quick-add result to task columns, resolving names against the workspace. */
function resolveParsed({ projectRows, areaRows, people }: Lookups, p: ParsedTask) {
  const norm = (s: string) => s.trim().toLowerCase();
  const project = p.projectName ? projectRows.find((x) => norm(x.name) === norm(p.projectName!)) : undefined;
  const area = p.areaName ? areaRows.find((x) => norm(x.name) === norm(p.areaName!)) : undefined;
  const assignee = p.assigneeName
    ? people.find((x) => norm(x.name).startsWith(norm(p.assigneeName!).slice(0, 3)))
    : undefined;
  return {
    title: p.title,
    priority: p.priority ?? 3,
    startDate: p.startDate ?? null,
    deadline: p.deadline ?? null,
    time: p.time ?? null,
    someday: p.someday ?? false,
    recurrence: p.recurrence ?? null,
    projectId: project?.id ?? null,
    areaId: project ? null : (area?.id ?? null),
    assigneeId: assignee?.id ?? null,
  };
}

/** Quick add / voice: parse the text (AI or rules) and create one or more tasks. */
export async function quickAdd(text: string, defaults: { projectId?: string; areaId?: string } = {}) {
  const viewer = await requireViewer();
  if (!text.trim()) return { created: 0, source: "rules" as const };
  await assertInWorkspace(viewer, defaults);

  const lookups = await loadLookups(viewer);
  const { tasks: parsed, source } = await parseTasks(text, lookups.context(todayIn(viewer.timezone)));

  for (const p of parsed) {
    const fields = resolveParsed(lookups, p);
    const confident = p.confident || Boolean(defaults.projectId || defaults.areaId);
    const projectId = defaults.projectId ?? (confident ? fields.projectId : null);
    const areaId = defaults.areaId ?? (confident ? fields.areaId : null);
    const [row] = await db
      .insert(tasks)
      .values({
        ...fields,
        workspaceId: viewer.workspaceId,
        createdById: viewer.userId,
        projectId,
        areaId: projectId ? null : areaId,
        status: projectId || areaId ? "todo" : "inbox",
        suggestion: confident ? null : p,
      })
      .returning();
    await setTags(viewer, row.id, p.tags);
    await log(viewer, row.id, "created", { source });
  }
  refresh();
  return { created: parsed.length, source };
}

const TaskPatch = z
  .object({
    title: z.string().min(1),
    description: z.string(),
    status: z.enum(["inbox", "todo", "in_progress", "waiting", "done", "cancelled"]),
    priority: z.number().int().min(1).max(4),
    startDate: z.string().nullable(),
    deadline: z.string().nullable(),
    time: z.string().nullable(),
    durationMin: z.number().int().positive().nullable(),
    areaId: z.string().uuid().nullable(),
    projectId: z.string().uuid().nullable(),
    assigneeId: z.string().uuid().nullable(),
    someday: z.boolean(),
    personal: z.boolean(),
    recurrence: z
      .object({
        freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
        interval: z.number().int().min(1),
        byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
        monthly: z
          .discriminatedUnion("kind", [
            z.object({ kind: z.literal("day"), day: z.number().int().min(1).max(31) }),
            z.object({ kind: z.literal("nthWeekday"), n: z.number().int().min(-1).max(5), weekday: z.number().int().min(0).max(6) }),
            z.object({ kind: z.literal("lastWorkday") }),
          ])
          .optional(),
        mode: z.enum(["schedule", "afterCompletion"]),
        until: z.string().optional(),
        count: z.number().int().positive().optional(),
      })
      .nullable(),
    tags: z.array(z.string()),
  })
  .partial();

export type TaskPatchInput = z.infer<typeof TaskPatch>;

export async function updateTask(id: string, input: TaskPatchInput) {
  const viewer = await requireViewer();
  const patch = TaskPatch.parse(input);
  const task = await ownedTask(viewer, id);
  await assertInWorkspace(viewer, patch);

  const { tags: tagNames, ...cols } = patch;
  const values: Partial<Task> = { ...cols };
  // A task lives in a project or directly in an area, not both.
  if (cols.projectId) values.areaId = null;
  if (cols.areaId) values.projectId = null;
  const placed = (cols.projectId ?? task.projectId) || (cols.areaId ?? task.areaId);
  if (task.status === "inbox" && placed && !cols.status) values.status = "todo";
  if (cols.status === "inbox" && placed) values.status = "todo";

  if (cols.status === "done" && task.status !== "done") {
    await completeTask(viewer, task);
    delete values.status;
  } else if (cols.status && cols.status !== "done") {
    values.completedAt = null;
  }
  if (Object.keys(values).length) {
    await db.update(tasks).set(values).where(eq(tasks.id, id));
  }
  if (tagNames) await setTags(viewer, id, tagNames);
  await log(viewer, id, "updated", { fields: Object.keys(patch) });
  refresh();
}

/** Close a task; for a recurring one, spawn the next occurrence with fresh subtasks. */
async function completeTask(viewer: Viewer, task: Task) {
  const completedOn = todayIn(viewer.timezone);
  await db.update(tasks).set({ status: "done", completedAt: new Date() }).where(eq(tasks.id, task.id));
  await log(viewer, task.id, "completed");
  if (!task.recurrence || task.parentId) return;

  const anchor = task.startDate ?? task.deadline ?? completedOn;
  const next = nextOccurrence(task.recurrence, anchor, completedOn, task.recurrenceCount + 1);
  if (!next) return;
  const shift = diffDays(next, anchor);

  const [copy] = await db
    .insert(tasks)
    .values({
      workspaceId: task.workspaceId,
      title: task.title,
      description: task.description,
      areaId: task.areaId,
      projectId: task.projectId,
      status: task.projectId || task.areaId ? "todo" : "inbox",
      priority: task.priority,
      startDate: task.startDate ? addDays(task.startDate, shift) : null,
      deadline: task.deadline ? addDays(task.deadline, shift) : task.startDate ? null : next,
      time: task.time,
      durationMin: task.durationMin,
      assigneeId: task.assigneeId,
      personal: task.personal,
      recurrence: task.recurrence,
      recurrenceCount: task.recurrenceCount + 1,
      sourceNoteId: task.sourceNoteId,
      createdById: viewer.userId,
    })
    .returning();
  const tagRows = await db.select().from(taskTags).where(eq(taskTags.taskId, task.id));
  if (tagRows.length) await db.insert(taskTags).values(tagRows.map((t) => ({ taskId: copy.id, tagId: t.tagId })));
  const subtasks = await db.select().from(tasks).where(eq(tasks.parentId, task.id));
  if (subtasks.length)
    await db.insert(tasks).values(
      subtasks.map((s) => ({
        workspaceId: s.workspaceId,
        title: s.title,
        parentId: copy.id,
        status: "todo" as const,
        priority: s.priority,
        sortOrder: s.sortOrder,
        createdById: viewer.userId,
      })),
    );
  await log(viewer, copy.id, "created", { recurrenceOf: task.id });
}

export async function toggleDone(id: string, done: boolean) {
  await updateTask(id, { status: done ? "done" : "todo" });
}

export async function addSubtask(parentId: string, title: string) {
  const viewer = await requireViewer();
  const parent = await ownedTask(viewer, parentId);
  if (parent.parentId) throw new Error("Subtasks are one level deep");
  if (!title.trim()) return;
  const [row] = await db
    .insert(tasks)
    .values({
      workspaceId: viewer.workspaceId,
      title: title.trim(),
      parentId,
      status: "todo",
      createdById: viewer.userId,
      sortOrder: Date.now() % 2_000_000_000,
    })
    .returning();
  await log(viewer, row.id, "created", { parentId });
  refresh();
}

export async function deleteTask(id: string) {
  const viewer = await requireViewer();
  await ownedTask(viewer, id);
  await db.delete(tasks).where(and(eq(tasks.workspaceId, viewer.workspaceId), eq(tasks.parentId, id)));
  await db.delete(tasks).where(eq(tasks.id, id));
  await log(viewer, id, "deleted");
  refresh();
}

/** Pin to / unpin from today's top 3 on the Focus dashboard. */
export async function setFocus(id: string, on: boolean) {
  const viewer = await requireViewer();
  await ownedTask(viewer, id);
  await db
    .update(tasks)
    .set({ focusDate: on ? todayIn(viewer.timezone) : null })
    .where(eq(tasks.id, id));
  refresh();
}

/** Apply the AI's suggested fields to an Inbox task. */
export async function acceptSuggestion(id: string) {
  const viewer = await requireViewer();
  const task = await ownedTask(viewer, id);
  if (!task.suggestion) return;
  const fields = resolveParsed(await loadLookups(viewer), task.suggestion);
  await db
    .update(tasks)
    .set({
      ...fields,
      status: fields.projectId || fields.areaId ? "todo" : task.status,
      suggestion: null,
    })
    .where(eq(tasks.id, id));
  await setTags(viewer, id, task.suggestion.tags);
  await log(viewer, id, "updated", { acceptedSuggestion: true });
  refresh();
}

export async function dismissSuggestion(id: string) {
  const viewer = await requireViewer();
  await ownedTask(viewer, id);
  await db.update(tasks).set({ suggestion: null }).where(eq(tasks.id, id));
  refresh();
}

/** "Разобрать с ИИ": propose project, dates and priority for every Inbox task that has none yet. */
export async function triageInbox() {
  const viewer = await requireViewer();
  const inbox = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, viewer.workspaceId), isNull(tasks.parentId), isNull(tasks.suggestion), inboxWhere));
  const ctx = (await loadLookups(viewer)).context(todayIn(viewer.timezone));
  let suggested = 0;
  await Promise.all(
    inbox.map(async (t) => {
      const { tasks: [p] } = await parseTasks(t.title, ctx);
      if (!p || (!p.projectName && !p.areaName && !p.startDate && !p.deadline && !p.priority)) return;
      await db.update(tasks).set({ suggestion: { ...p, title: t.title } }).where(eq(tasks.id, t.id));
      suggested++;
    }),
  );
  refresh();
  return { suggested, total: inbox.length };
}
