"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, areas, notes, projects, tasks } from "@/db/schema";
import { requireViewer } from "@/lib/auth";
import { notePlainText, type NoteBlock } from "@/lib/notes";

const refresh = () => revalidatePath("/", "layout");

const Block = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.enum(["text", "h1", "h2", "quote", "bullet", "numbered"]), text: z.string() }),
  z.object({ id: z.string(), type: z.literal("todo"), text: z.string(), checked: z.boolean(), taskId: z.string().uuid().optional() }),
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({ id: z.string(), type: z.literal("image"), fileId: z.string().uuid(), caption: z.string() }),
]);

export async function createNote(link: { areaId?: string; projectId?: string; taskId?: string } = {}) {
  const viewer = await requireViewer();
  const [n] = await db
    .insert(notes)
    .values({ workspaceId: viewer.workspaceId, ...(await ownedLinks(viewer.workspaceId, link)) })
    .returning();
  refresh();
  redirect(`/notes/${n.id}`);
}

type Links = { areaId?: string | null; projectId?: string | null; taskId?: string | null };

/** Keep only links that point into the workspace; foreign ids become null. */
async function ownedLinks(workspaceId: string, link: Links): Promise<Links> {
  const owned = async (table: typeof areas | typeof projects | typeof tasks, id: string | null | undefined) => {
    if (!id) return id;
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.workspaceId, workspaceId)));
    return row ? id : null;
  };
  const out: Links = {};
  if (link.areaId !== undefined) out.areaId = await owned(areas, link.areaId);
  if (link.projectId !== undefined) out.projectId = await owned(projects, link.projectId);
  if (link.taskId !== undefined) out.taskId = await owned(tasks, link.taskId);
  return out;
}

const NotePatch = z
  .object({
    title: z.string(),
    blocks: z.array(Block),
    pinned: z.boolean(),
    areaId: z.string().uuid().nullable(),
    projectId: z.string().uuid().nullable(),
  })
  .partial();

export async function saveNote(id: string, input: z.infer<typeof NotePatch>) {
  const viewer = await requireViewer();
  const patch = NotePatch.parse(input);
  const [note] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.workspaceId, viewer.workspaceId)));
  if (!note) throw new Error("Note not found");
  const { areaId, projectId, ...rest } = patch;
  const values: Partial<typeof notes.$inferInsert> = { ...rest, ...(await ownedLinks(viewer.workspaceId, { areaId, projectId })) };
  if (patch.title !== undefined || patch.blocks !== undefined) {
    values.plainText = notePlainText(patch.title ?? note.title, (patch.blocks ?? note.blocks) as NoteBlock[]);
  }
  await db.update(notes).set(values).where(eq(notes.id, id));
  // Only metadata changes need the lists re-rendered; text edits autosave silently.
  if (patch.pinned !== undefined || areaId !== undefined || projectId !== undefined) refresh();
}

export async function deleteNote(id: string) {
  const viewer = await requireViewer();
  await db.delete(notes).where(and(eq(notes.id, id), eq(notes.workspaceId, viewer.workspaceId)));
  refresh();
  redirect("/notes");
}

/** Turn a note line into a task that links back to the note. Returns the new task id. */
export async function taskFromNoteLine(noteId: string, text: string) {
  const viewer = await requireViewer();
  const [note] = await db.select().from(notes).where(and(eq(notes.id, noteId), eq(notes.workspaceId, viewer.workspaceId)));
  if (!note || !text.trim()) throw new Error("Nothing to convert");
  const [task] = await db
    .insert(tasks)
    .values({
      workspaceId: viewer.workspaceId,
      title: text.trim(),
      projectId: note.projectId,
      areaId: note.projectId ? null : note.areaId,
      status: note.projectId || note.areaId ? "todo" : "inbox",
      sourceNoteId: note.id,
      createdById: viewer.userId,
    })
    .returning();
  await db.insert(activityLog).values({
    workspaceId: viewer.workspaceId,
    actorId: viewer.userId,
    entityType: "task",
    entityId: task.id,
    action: "created",
    meta: { fromNote: note.id },
  });
  refresh();
  return task.id;
}
