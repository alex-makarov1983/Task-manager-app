import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { NoteEditor } from "@/components/note-editor";
import { db } from "@/db";
import { areas, notes } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { allProjects } from "@/lib/queries";

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { viewer, locale } = await pageContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [note] = await db.select().from(notes).where(and(eq(notes.id, id), eq(notes.workspaceId, viewer.workspaceId)));
  if (!note) notFound();
  const [areaRows, projects] = await Promise.all([
    db.select().from(areas).where(eq(areas.workspaceId, viewer.workspaceId)),
    allProjects(viewer),
  ]);
  return <NoteEditor key={note.id} note={note} areas={areaRows} projects={projects} locale={locale} />;
}
