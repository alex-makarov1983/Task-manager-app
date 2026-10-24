"use client";

import Link from "next/link";
import { useTransition } from "react";
import { createNote } from "@/app/actions/notes";
import { getDict, type Locale } from "@/lib/i18n";

type NoteSummary = { id: string; title: string; plainText: string; pinned: boolean };

export function NoteLinks({ notes, locale, link }: { notes: NoteSummary[]; locale: Locale; link: { areaId?: string; projectId?: string } }) {
  const t = getDict(locale);
  const [pending, start] = useTransition();
  return (
    <section className="mb-7">
      <div className="mb-1.5 flex items-center justify-between px-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t.notes}</h2>
        <button className="text-xs text-muted hover:text-fg" disabled={pending} onClick={() => start(() => createNote(link))}>
          + {t.newNote}
        </button>
      </div>
      <ul className="space-y-0.5">
        {notes.map((n) => (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} className="block rounded-lg px-2 py-2 text-sm hover:bg-bg-soft">
              {n.pinned && "📌 "}✎ {n.title || t.untitled}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
