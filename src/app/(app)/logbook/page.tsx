import { PageTitle } from "@/components/section";
import { TaskList } from "@/components/task-row";
import { pageContext } from "@/lib/page";
import { listTasks, logbookOrder, logbookWhere } from "@/lib/queries";

export default async function LogbookPage({ searchParams }: PageProps<"/logbook">) {
  const { viewer, locale, t, today } = await pageContext();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q : undefined;
  const items = await listTasks(viewer, logbookWhere(query), { orderBy: logbookOrder, includeSubtasks: true, limit: 200 });
  return (
    <>
      <PageTitle>{t.logbook}</PageTitle>
      <form className="mb-4">
        <input name="q" defaultValue={query} className="input" placeholder={t.searchLogbook} />
      </form>
      <TaskList tasks={items} locale={locale} today={today} />
    </>
  );
}
