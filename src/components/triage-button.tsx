"use client";

import { useState, useTransition } from "react";
import { triageInbox } from "@/app/actions/tasks";
import { getDict, type Locale } from "@/lib/i18n";

export function TriageButton({ locale }: { locale: Locale }) {
  const t = getDict(locale);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-muted">{result}</span>}
      <button
        className="btn border border-line py-1 text-xs hover:bg-bg-hover"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await triageInbox();
            setResult(t.triageDone(r.suggested, r.total));
          })
        }
      >
        ✨ {pending ? "…" : t.triageWithAi}
      </button>
    </div>
  );
}
