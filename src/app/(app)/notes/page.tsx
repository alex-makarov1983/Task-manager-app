import Link from "next/link";
import { NewNoteButton } from "@/components/new-note-button";
import { PageTitle } from "@/components/section";
import { pageContext } from "@/lib/page";
import { listNotes } from "@/lib/queries";

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const { viewer, locale, t } = await pageContext();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q : undefined;
  const items = await listNotes(viewer, { q: query });
  return (
    <>
      <div className="flex items-start justify-between">
        <PageTitle>{t.notes}</PageTitle>
        <NewNoteButton locale={locale} />
      </div>
      <form className="mb-4">
        <input name="q" defaultValue={query} className="input" placeholder={t.searchNotes} />
      </form>
      {items.length === 0 && <p className="text-sm text-muted">{t.nothingHere}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((n) => (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} className="block h-full rounded-xl border border-line p-3 hover:bg-bg-soft">
              <div className="truncate text-sm font-medium">
                {n.pinned && "📌 "}
                {n.title || t.untitled}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{n.plainText.split("\n").slice(1).join(" ")}</p>
              {(n.projectName || n.areaName) && <p className="mt-2 text-xs text-muted">○ {n.projectName ?? n.areaName}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
