import { QuickAdd } from "@/components/quick-add";
import { Sidebar } from "@/components/sidebar";
import { aiEnabled } from "@/lib/ai-parse";
import { pageContext } from "@/lib/page";
import { sidebarData } from "@/lib/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { viewer, locale, today } = await pageContext();
  const side = await sidebarData(viewer);
  return (
    <div className="md:flex">
      <Sidebar locale={locale} areas={side.areas} projects={side.projects} inbox={side.inbox} userName={viewer.name} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
          <QuickAdd locale={locale} today={today} aiEnabled={aiEnabled()} />
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
