import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { areas, memberships, notes, projects, tags, taskTags, tasks, users, type Task } from "@/db/schema";
import { addDays, type DateStr } from "./dates";
import type { Viewer } from "./auth";

export type TaskWithMeta = Task & {
  projectName: string | null;
  areaName: string | null;
  areaColor: string | null;
  tagNames: string[];
  subtaskTotal: number;
  subtaskDone: number;
};

const OPEN = notInArray(tasks.status, ["done", "cancelled"]);

/** Tasks of the viewer's workspace with the joins every list needs. Top-level tasks only by default. */
export async function listTasks(
  viewer: Viewer,
  where: SQL | undefined,
  opts: { orderBy?: SQL[]; includeSubtasks?: boolean; limit?: number } = {},
): Promise<TaskWithMeta[]> {
  const sub = db
    .select({
      parentId: tasks.parentId,
      total: sql<number>`count(*)::int`.as("total"),
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`.as("done"),
    })
    .from(tasks)
    .where(eq(tasks.workspaceId, viewer.workspaceId))
    .groupBy(tasks.parentId)
    .as("sub");

  const rows = await db
    .select({
      task: tasks,
      projectName: projects.name,
      areaName: areas.name,
      areaColor: areas.color,
      subtaskTotal: sub.total,
      subtaskDone: sub.done,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(areas, eq(areas.id, sql`coalesce(${tasks.areaId}, ${projects.areaId})`))
    .leftJoin(sub, eq(sub.parentId, tasks.id))
    .where(
      and(
        eq(tasks.workspaceId, viewer.workspaceId),
        opts.includeSubtasks ? undefined : isNull(tasks.parentId),
        where,
      ),
    )
    .orderBy(...(opts.orderBy ?? [asc(tasks.priority), asc(tasks.sortOrder), asc(tasks.createdAt)]))
    .limit(opts.limit ?? 500);

  const ids = rows.map((r) => r.task.id);
  const tagRows = ids.length
    ? await db
        .select({ taskId: taskTags.taskId, name: tags.name })
        .from(taskTags)
        .innerJoin(tags, eq(tags.id, taskTags.tagId))
        .where(inArray(taskTags.taskId, ids))
    : [];
  const tagMap = new Map<string, string[]>();
  for (const t of tagRows) tagMap.set(t.taskId, [...(tagMap.get(t.taskId) ?? []), t.name]);

  return rows.map((r) => ({
    ...r.task,
    projectName: r.projectName,
    areaName: r.areaName,
    areaColor: r.areaColor,
    tagNames: tagMap.get(r.task.id) ?? [],
    subtaskTotal: r.subtaskTotal ?? 0,
    subtaskDone: r.subtaskDone ?? 0,
  }));
}

// ---- GTD views ----

export const inboxWhere = and(OPEN, isNull(tasks.projectId), isNull(tasks.areaId), eq(tasks.someday, false));

export const todayWhere = (today: DateStr) =>
  and(
    OPEN,
    eq(tasks.someday, false),
    or(lte(tasks.startDate, today), lte(tasks.deadline, today), eq(tasks.focusDate, today)),
  );

export const upcomingWhere = (today: DateStr) =>
  and(
    OPEN,
    eq(tasks.someday, false),
    or(
      and(gte(tasks.startDate, addDays(today, 1)), lte(tasks.startDate, addDays(today, 14))),
      and(gte(tasks.deadline, addDays(today, 1)), lte(tasks.deadline, addDays(today, 14))),
    ),
  );

export const somedayWhere = and(OPEN, eq(tasks.someday, true));

export const logbookWhere = (q?: string) =>
  and(eq(tasks.status, "done"), q ? ilike(tasks.title, `%${q}%`) : undefined);

export const logbookOrder = [desc(tasks.completedAt)];

export async function inboxCount(viewer: Viewer) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, viewer.workspaceId), isNull(tasks.parentId), inboxWhere));
  return r.n;
}

// ---- Focus dashboard ----

export async function focusData(viewer: Viewer, today: DateStr) {
  const todayTasks = await listTasks(viewer, todayWhere(today));
  const pinned = todayTasks.filter((t) => t.focusDate === today);
  // Until the AI planner (stage 3) picks them, suggest by priority, then nearest deadline.
  const suggested = [...todayTasks]
    .filter((t) => t.focusDate !== today && t.status !== "waiting")
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .slice(0, Math.max(0, 3 - pinned.length));

  const urgent = await listTasks(
    viewer,
    and(OPEN, or(sql`${tasks.deadline} < ${today}`, eq(tasks.priority, 1))),
    { orderBy: [asc(tasks.deadline), asc(tasks.priority)] },
  );
  const timeline = await listTasks(
    viewer,
    and(OPEN, sql`${tasks.time} is not null`, or(eq(tasks.startDate, today), eq(tasks.deadline, today))),
    { orderBy: [asc(tasks.time)], includeSubtasks: true },
  );
  const waiting = await listTasks(viewer, eq(tasks.status, "waiting"), {
    orderBy: [asc(tasks.updatedAt)],
  });
  return { pinned, suggested, urgent, timeline, waiting, inbox: await inboxCount(viewer) };
}

// ---- Sidebar / lookups ----

export async function sidebarData(viewer: Viewer) {
  const [areaRows, projectRows] = await Promise.all([
    db.select().from(areas).where(eq(areas.workspaceId, viewer.workspaceId)).orderBy(asc(areas.sortOrder), asc(areas.createdAt)),
    db
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, viewer.workspaceId), inArray(projects.status, ["active", "paused"])))
      .orderBy(asc(projects.sortOrder), asc(projects.createdAt)),
  ]);
  return { areas: areaRows, projects: projectRows, inbox: await inboxCount(viewer) };
}

export async function allProjects(viewer: Viewer) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, viewer.workspaceId), ne(projects.status, "archived")))
    .orderBy(asc(projects.name));
}

export async function workspacePeople(viewer: Viewer) {
  return db
    .select({ id: users.id, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, viewer.workspaceId));
}

export async function getTask(viewer: Viewer, id: string) {
  const [task] = await listTasks(viewer, eq(tasks.id, id), { includeSubtasks: true });
  if (!task) return null;
  const subtasks = await listTasks(viewer, eq(tasks.parentId, id), {
    includeSubtasks: true,
    orderBy: [asc(tasks.sortOrder), asc(tasks.createdAt)],
  });
  const linkedNotes = await db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(
      and(
        eq(notes.workspaceId, viewer.workspaceId),
        or(eq(notes.taskId, id), task.sourceNoteId ? eq(notes.id, task.sourceNoteId) : undefined),
      ),
    );
  return { task, subtasks, linkedNotes };
}

export async function listNotes(
  viewer: Viewer,
  filter: { q?: string; areaId?: string; projectId?: string } = {},
) {
  return db
    .select({
      id: notes.id,
      title: notes.title,
      plainText: notes.plainText,
      pinned: notes.pinned,
      updatedAt: notes.updatedAt,
      projectName: projects.name,
      areaName: areas.name,
    })
    .from(notes)
    .leftJoin(projects, eq(projects.id, notes.projectId))
    .leftJoin(areas, eq(areas.id, notes.areaId))
    .where(
      and(
        eq(notes.workspaceId, viewer.workspaceId),
        filter.q ? ilike(notes.plainText, `%${filter.q}%`) : undefined,
        filter.areaId ? eq(notes.areaId, filter.areaId) : undefined,
        filter.projectId ? eq(notes.projectId, filter.projectId) : undefined,
      ),
    )
    .orderBy(desc(notes.pinned), desc(notes.updatedAt));
}

export { OPEN as openTaskWhere };
