import { PageTitle } from "@/components/section";
import { TaskList } from "@/components/task-row";
import { formatLongDay } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { listTasks, todayWhere } from "@/lib/queries";

export default async function TodayPage() {
  const { viewer, locale, t, today } = await pageContext();
  const items = await listTasks(viewer, todayWhere(today));
  return (
    <>
      <PageTitle sub={formatLongDay(today, locale)}>{t.today}</PageTitle>
      <TaskList tasks={items} locale={locale} today={today} focusControl="pin" />
    </>
  );
}
