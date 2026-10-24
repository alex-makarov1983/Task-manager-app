import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { TaskEditor } from "@/components/task-editor";
import { db } from "@/db";
import { areas } from "@/db/schema";
import { pageContext } from "@/lib/page";
import { allProjects, getTask, workspacePeople } from "@/lib/queries";

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { viewer, locale, today } = await pageContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getTask(viewer, id);
  if (!data) notFound();
  const [areaRows, projects, people] = await Promise.all([
    db.select().from(areas).where(eq(areas.workspaceId, viewer.workspaceId)),
    allProjects(viewer),
    workspacePeople(viewer),
  ]);
  return (
    <TaskEditor
      key={data.task.id}
      {...data}
      areas={areaRows}
      projects={projects}
      people={people}
      locale={locale}
      today={today}
    />
  );
}
