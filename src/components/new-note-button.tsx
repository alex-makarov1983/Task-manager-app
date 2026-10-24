"use client";

import { useTransition } from "react";
import { createNote } from "@/app/actions/notes";
import { getDict, type Locale } from "@/lib/i18n";

export function NewNoteButton({ locale }: { locale: Locale }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary" disabled={pending} onClick={() => start(() => createNote())}>
      + {getDict(locale).newNote}
    </button>
  );
}
