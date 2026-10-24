import Link from "next/link";
import { PageTitle, Section } from "@/components/section";
import { TaskList } from "@/components/task-row";
import { TriageButton } from "@/components/triage-button";
import { formatLongDay } from "@/lib/format";
import { pageContext } from "@/lib/page";
import { focusData } from "@/lib/queries";

export default async function FocusPage() {
  const { viewer, locale, t, today } = await pageContext();
  const d = await focusData(viewer, today);
  const common = { locale, today };

  return (
    <>
      <PageTitle sub={formatLongDay(today, locale)}>{t.focusTitle}</PageTitle>

      <section className="mb-7 rounded-2xl border border-line p-3">
        <h2 className="mb-1 px-2 text-sm font-semibold">{t.top3}</h2>
        <TaskList tasks={d.pinned} focusControl="unpin" {...common} empty="" />
        {d.suggested.length > 0 && (
          <>
            <p className="mt-2 px-2 text-xs text-muted">{t.suggested}</p>
            <TaskList tasks={d.suggested} focusControl="pin" {...common} />
          </>
        )}
        {d.pinned.length + d.suggested.length === 0 && <p className="px-2 py-2 text-sm text-muted">{t.nothingHere}</p>}
      </section>

      <Section title={t.urgentBlock}>
        <TaskList tasks={d.urgent} {...common} empty={t.allClear} />
      </Section>

      {d.timeline.length > 0 && (
        <Section title={t.timeline}>
          <TaskList tasks={d.timeline} {...common} />
        </Section>
      )}

      <div className="mb-7 flex items-center justify-between rounded-xl bg-bg-soft px-4 py-3">
        <Link href="/inbox" className="text-sm hover:text-accent">
          ▢ {t.inboxCount(d.inbox)}
        </Link>
        {d.inbox > 0 && <TriageButton locale={locale} />}
      </div>

      {d.waiting.length > 0 && (
        <Section title={t.waitingBlock}>
          <TaskList tasks={d.waiting} {...common} />
        </Section>
      )}
    </>
  );
}
