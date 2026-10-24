import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { NoteLinks } from "@/components/note-links";
import { Section } from "@/components/section";
import { ProjectHeader } from "@/components/structure-controls";
import { TaskList } from "@/components/task-row";
import { db } from "@/db";
import { areas, projects, tasks } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { listNotes, listTasks, openTaskWhere } from "@/lib/queries";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { viewer, locale, t, today } = await pageContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, viewer.workspaceId)));
  if (!project) notFound();

  const [open, done, noteRows, areaRows] = await Promise.all([
    listTasks(viewer, and(openTaskWhere, eq(tasks.projectId, id))),
    listTasks(viewer, and(eq(tasks.projectId, id), eq(tasks.status, "done")), { orderBy: [desc(tasks.completedAt)], limit: 50 }),
    listNotes(viewer, { projectId: id }),
    db.select().from(areas).where(eq(areas.workspaceId, viewer.workspaceId)),
  ]);

  return (
    <>
      <ProjectHeader project={project} areas={areaRows} locale={locale} />
      <Section title={t.openTasks}>
        <TaskList tasks={open} locale={locale} today={today} hideProject focusControl="pin" />
      </Section>
      <NoteLinks notes={noteRows} locale={locale} link={{ projectId: id }} />
      {done.length > 0 && (
        <Section title={t.doneTasks}>
          <TaskList tasks={done} locale={locale} today={today} hideProject />
        </Section>
      )}
    </>
  );
}
