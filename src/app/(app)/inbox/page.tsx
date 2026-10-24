import { PageTitle } from "@/components/section";
import { TaskList } from "@/components/task-row";
import { TriageButton } from "@/components/triage-button";
import { pageContext } from "@/lib/page";
import { inboxWhere, listTasks } from "@/lib/queries";
import { asc } from "drizzle-orm";
import { tasks } from "@/db/schema";

export default async function InboxPage() {
  const { viewer, locale, t, today } = await pageContext();
  const items = await listTasks(viewer, inboxWhere, { orderBy: [asc(tasks.createdAt)] });
  return (
    <>
      <div className="flex items-start justify-between">
        <PageTitle sub={items.length ? String(items.length) : undefined}>{t.inbox}</PageTitle>
        {items.length > 0 && <TriageButton locale={locale} />}
      </div>
      <TaskList tasks={items} locale={locale} today={today} />
    </>
  );
}
