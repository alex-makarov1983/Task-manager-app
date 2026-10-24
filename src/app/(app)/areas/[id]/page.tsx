import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { AreaHeader } from "@/components/structure-controls";
import { NoteLinks } from "@/components/note-links";
import { Section } from "@/components/section";
import { TaskList } from "@/components/task-row";
import { db } from "@/db";
import { areas, projects, tasks } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { listNotes, listTasks, openTaskWhere } from "@/lib/queries";

export default async function AreaPage({ params }: PageProps<"/areas/[id]">) {
  const { viewer, locale, t, today } = await pageContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [area] = await db.select().from(areas).where(and(eq(areas.id, id), eq(areas.workspaceId, viewer.workspaceId)));
  if (!area) notFound();

  const [projectRows, items, noteRows] = await Promise.all([
    db.select().from(projects).where(and(eq(projects.areaId, id), eq(projects.workspaceId, viewer.workspaceId))).orderBy(asc(projects.status), asc(projects.createdAt)),
    listTasks(viewer, and(openTaskWhere, eq(tasks.areaId, id), isNull(tasks.projectId))),
    listNotes(viewer, { areaId: id }),
  ]);

  return (
    <>
      <AreaHeader area={area} locale={locale} />
      <Section title={t.projectsInArea}>
        <ul className="space-y-0.5">
          {projectRows.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-bg-soft">
                <span>○ {p.name}</span>
                <span className="text-xs text-muted">{t.projectStatuses[p.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t.tasksInArea}>
        <TaskList tasks={items} locale={locale} today={today} hideProject />
      </Section>
      <NoteLinks notes={noteRows} locale={locale} link={{ areaId: id }} />
    </>
  );
}
