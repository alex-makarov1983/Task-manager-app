import { PageTitle, Section } from "@/components/section";
import { TaskList } from "@/components/task-row";
import { addDays } from "@/lib/dates";
import { formatLongDay } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { listTasks, upcomingWhere } from "@/lib/queries";

export default async function UpcomingPage() {
  const { viewer, locale, t, today } = await pageContext();
  const items = await listTasks(viewer, upcomingWhere(today));
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1));
  // A task shows on its start day; one with only a deadline shows on the deadline.
  const dayOf = (task: (typeof items)[number]) =>
    task.startDate && task.startDate > today ? task.startDate : task.deadline;

  return (
    <>
      <PageTitle>{t.upcoming}</PageTitle>
      {days.map((day) => {
        const list = items.filter((task) => dayOf(task) === day);
        return (
          <Section key={day} title={formatLongDay(day, locale)}>
            {list.length ? <TaskList tasks={list} locale={locale} today={today} /> : <div className="mx-2 border-b border-line" />}
          </Section>
        );
      })}
    </>
  );
}
