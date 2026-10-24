"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { quickAdd } from "@/app/actions/tasks";
import { getDict, type Locale } from "@/lib/i18n";
import { quickParse } from "@/lib/quick-parse";
import { formatDay } from "@/lib/format";

type Props = {
  locale: Locale;
  today: string;
  aiEnabled: boolean;
};

// Minimal typing for the Web Speech API (not in TS's DOM lib).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function getRecognition(): (new () => Recognition) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

export function QuickAdd({ locale, today, aiEnabled }: Props) {
  const t = getDict(locale);
  // Inside a project or area page, new tasks land there.
  const pathname = usePathname();
  const [, kind, id] = pathname.split("/");
  const defaults = kind === "projects" ? { projectId: id } : kind === "areas" ? { areaId: id } : {};
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [pending, start] = useTransition();
  const recRef = useRef<Recognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // "n" anywhere focuses quick add, like Things / Todoist.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(id);
  }, [message]);

  const submit = (value: string) => {
    if (!value.trim()) return;
    setText("");
    start(async () => {
      const res = await quickAdd(value, defaults);
      setMessage(t.addedN(res.created) + (res.source === "ai" ? ` · ${t.aiParsed}` : ""));
    });
  };

  const toggleVoice = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Rec = getRecognition();
    if (!Rec) {
      setMessage(t.voiceUnsupported);
      return;
    }
    const rec = new Rec();
    rec.lang = locale === "ru" ? "ru-RU" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (const r of Array.from(e.results)) {
        if (r.isFinal) finalText = r[0].transcript;
        else interim += r[0].transcript;
      }
      setText(finalText || interim);
    };
    rec.onend = () => {
      setListening(false);
      if (finalText) submit(finalText);
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const preview = text.trim() ? quickParse(text, today) : null;
  const chips = preview
    ? [
        preview.startDate && `▶ ${formatDay(preview.startDate, today, locale)}`,
        preview.deadline && `⚑ ${formatDay(preview.deadline, today, locale)}`,
        preview.time && `◷ ${preview.time}`,
        preview.priority && `P${preview.priority}`,
        preview.projectName && `○ ${preview.projectName}`,
        preview.someday && t.someday,
        preview.recurrence && "↻",
        ...preview.tags.map((tag) => `#${tag}`),
      ].filter(Boolean)
    : [];

  return (
    <div className="relative">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          ref={inputRef}
          className="input py-2.5 text-base"
          placeholder={listening ? t.listening : t.quickAddPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="done"
        />
        <button
          type="button"
          onClick={toggleVoice}
          aria-label="Voice"
          className={`btn shrink-0 border border-line px-3 py-2.5 ${listening ? "animate-pulse bg-danger text-white" : "hover:bg-bg-hover"}`}
        >
          🎙
        </button>
        <button className="btn-primary shrink-0 py-2.5" disabled={pending || !text.trim()}>
          {pending ? "…" : t.add}
        </button>
      </form>
      <div className="mt-1.5 flex min-h-5 flex-wrap gap-1.5 text-xs text-muted">
        {chips.map((c) => (
          <span key={c as string} className="rounded bg-bg-soft px-1.5 py-0.5">{c}</span>
        ))}
        {chips.length > 0 && aiEnabled && <span className="opacity-60">· AI</span>}
        {message && <span className="text-accent">{message}</span>}
      </div>
    </div>
  );
}
