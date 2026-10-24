import { PageTitle } from "@/components/section";
import { TaskList } from "@/components/task-row";
import { pageContext } from "@/lib/page";
import { listTasks, somedayWhere } from "@/lib/queries";

export default async function SomedayPage() {
  const { viewer, locale, t, today } = await pageContext();
  const items = await listTasks(viewer, somedayWhere);
  return (
    <>
      <PageTitle>{t.someday}</PageTitle>
      <TaskList tasks={items} locale={locale} today={today} />
    </>
  );
}
