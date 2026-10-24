"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { deleteNote, saveNote, taskFromNoteLine } from "@/app/actions/notes";
import { toggleDone } from "@/app/actions/tasks";
import type { Area, Note, Project } from "@/db/schema";
import { getDict, type Locale } from "@/lib/i18n";
import { newBlockId, type BlockType, type NoteBlock } from "@/lib/notes";

type Props = { note: Note; areas: Area[]; projects: Project[]; locale: Locale };

const LIST_TYPES: BlockType[] = ["bullet", "numbered", "todo"];
const TEXT_TYPES: BlockType[] = ["text", "h1", "h2", "bullet", "numbered", "todo", "quote"];

function makeBlock(type: BlockType, text = ""): NoteBlock {
  const id = newBlockId();
  if (type === "todo") return { id, type, text, checked: false };
  if (type === "divider") return { id, type };
  if (type === "image") throw new Error("image blocks are created by upload");
  return { id, type, text };
}

function changeType(b: NoteBlock, type: BlockType): NoteBlock {
  const text = "text" in b ? b.text : "";
  if (type === "todo") return { id: b.id, type, text, checked: false, taskId: b.type === "todo" ? b.taskId : undefined };
  if (type === "divider") return { id: b.id, type };
  return { id: b.id, type: type as "text", text };
}

export function NoteEditor({ note, areas, projects, locale }: Props) {
  const t = getDict(locale);
  const [title, setTitle] = useState(note.title);
  const [blocks, setBlocks] = useState<NoteBlock[]>(note.blocks.length ? note.blocks : [makeBlock("text")]);
  const [saving, setSaving] = useState(false);
  const [pending, start] = useTransition();
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);

  // Debounced autosave of title + blocks.
  useEffect(() => {
    if (!dirty.current) return;
    setSaving(true);
    const id = setTimeout(async () => {
      await saveNote(note.id, { title, blocks });
      setSaving(false);
    }, 600);
    return () => clearTimeout(id);
  }, [title, blocks, note.id]);

  // Block to focus once it is rendered (new blocks don't exist until the next commit).
  const focusNext = useRef<string | null>(null);
  const focusBlock = (id: string) => {
    focusNext.current = id;
    const el = refs.current.get(id);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      focusNext.current = null;
    }
  };
  useLayoutEffect(() => {
    if (focusNext.current) focusBlock(focusNext.current);
  });

  const edit = (fn: (bs: NoteBlock[]) => NoteBlock[]) => {
    dirty.current = true;
    setBlocks(fn);
  };
  const update = (id: string, patch: Partial<NoteBlock>) =>
    edit((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as NoteBlock) : b)));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: NoteBlock, i: number) => {
    const text = "text" in b ? b.text : "";
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Enter on an empty list item ends the list.
      if (!text && LIST_TYPES.includes(b.type)) {
        edit((bs) => bs.map((x) => (x.id === b.id ? changeType(x, "text") : x)));
        return;
      }
      const next = makeBlock(LIST_TYPES.includes(b.type) ? b.type : "text");
      edit((bs) => [...bs.slice(0, i + 1), next, ...bs.slice(i + 1)]);
      focusBlock(next.id);
    } else if (e.key === "Backspace" && !text && blocks.length > 1) {
      e.preventDefault();
      if (b.type !== "text") {
        edit((bs) => bs.map((x) => (x.id === b.id ? changeType(x, "text") : x)));
        return;
      }
      edit((bs) => bs.filter((x) => x.id !== b.id));
      const prev = blocks.slice(0, i).reverse().find((x) => "text" in x);
      if (prev) focusBlock(prev.id);
    } else if (e.key === "ArrowUp" && i > 0 && e.currentTarget.selectionStart === 0) {
      const prev = blocks.slice(0, i).reverse().find((x) => "text" in x);
      if (prev) {
        e.preventDefault();
        focusBlock(prev.id);
      }
    } else if (e.key === "ArrowDown" && e.currentTarget.selectionEnd === text.length) {
      const nxt = blocks.slice(i + 1).find((x) => "text" in x);
      if (nxt) {
        e.preventDefault();
        focusBlock(nxt.id);
      }
    }
  };

  // Markdown-style shortcuts at the start of a line: "- ", "1. ", "[] ", "# ", "## ", "> ", "---"
  const onText = (b: NoteBlock, value: string) => {
    const shortcuts: [RegExp, BlockType][] = [
      [/^- $/, "bullet"],
      [/^1\. $/, "numbered"],
      [/^\[\] $/, "todo"],
      [/^# $/, "h1"],
      [/^## $/, "h2"],
      [/^> $/, "quote"],
    ];
    if (b.type === "text") {
      const hit = shortcuts.find(([re]) => re.test(value));
      if (hit) {
        edit((bs) => bs.map((x) => (x.id === b.id ? { ...changeType(x, hit[1]), text: "" } as NoteBlock : x)));
        return;
      }
      if (value === "---") {
        const next = makeBlock("text");
        edit((bs) => bs.flatMap((x) => (x.id === b.id ? [makeBlock("divider"), next] : [x])));
        focusBlock(next.id);
        return;
      }
    }
    update(b.id, { text: value } as Partial<NoteBlock>);
  };

  const toTask = (b: NoteBlock) => {
    if (!("text" in b) || !b.text.trim()) return;
    start(async () => {
      const taskId = await taskFromNoteLine(note.id, b.text);
      edit((bs) => bs.map((x) => (x.id === b.id ? { id: x.id, type: "todo", text: b.text, checked: false, taskId } : x)));
    });
  };

  const upload = async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/files", { method: "POST", body });
    if (!res.ok) return alert(`Upload failed: ${res.status}`);
    const { id } = (await res.json()) as { id: string };
    edit((bs) => [...bs, { id: newBlockId(), type: "image", fileId: id, caption: "" }, makeBlock("text")]);
  };

  // Running number for consecutive numbered items.
  const numbers = blocks.reduce<number[]>((acc, b, i) => {
    acc.push(b.type === "numbered" ? (blocks[i - 1]?.type === "numbered" ? acc[i - 1] + 1 : 1) : 0);
    return acc;
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href="/notes" className="btn-ghost -ml-3 px-3 py-1">← {t.notes}</Link>
        <select
          className="input w-auto py-1 text-xs"
          value={note.projectId ? `p:${note.projectId}` : note.areaId ? `a:${note.areaId}` : ""}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":");
            start(() =>
              saveNote(note.id, kind === "p" ? { projectId: id, areaId: null } : kind === "a" ? { areaId: id, projectId: null } : { areaId: null, projectId: null }),
            );
          }}
        >
          <option value="">{t.none}</option>
          {areas.map((a) => (
            <optgroup key={a.id} label={a.name}>
              <option value={`a:${a.id}`}>{a.icon} {a.name}</option>
              {projects.filter((p) => p.areaId === a.id).map((p) => (
                <option key={p.id} value={`p:${p.id}`}>○ {p.name}</option>
              ))}
            </optgroup>
          ))}
          {projects.filter((p) => !p.areaId).map((p) => (
            <option key={p.id} value={`p:${p.id}`}>○ {p.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" defaultChecked={note.pinned} onChange={(e) => start(() => saveNote(note.id, { pinned: e.target.checked }))} />
          {t.pinNote}
        </label>
        <button className="btn-ghost py-1" onClick={() => fileRef.current?.click()}>📷 {t.addPhoto}</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <span className="ml-auto text-muted">{saving || pending ? "…" : t.saved}</span>
      </div>

      <input
        className="mb-3 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-muted/50"
        placeholder={t.untitled}
        value={title}
        onChange={(e) => {
          dirty.current = true;
          setTitle(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = blocks.find((b) => "text" in b);
            if (first) focusBlock(first.id);
          }
        }}
      />

      <div className="space-y-0.5">
        {blocks.map((b, i) => {
          return (
            <div key={b.id} className="group relative flex items-start gap-2 rounded-md py-0.5">
              <select
                aria-label="Block type"
                className="absolute -left-7 top-1 w-6 cursor-pointer appearance-none rounded bg-transparent text-center text-muted opacity-0 group-hover:opacity-100 focus:opacity-100"
                value={b.type}
                onChange={(e) => update(b.id, changeType(b, e.target.value as BlockType))}
              >
                <option value={b.type} disabled>⋮</option>
                {[...TEXT_TYPES, "divider" as const].map((type) => (
                  <option key={type} value={type}>{t.blockTypes[type]}</option>
                ))}
              </select>

              {b.type === "divider" && <hr className="my-3 w-full border-line" />}

              {b.type === "image" && (
                <figure className="w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${b.fileId}`} alt={b.caption} className="max-h-[480px] rounded-lg" />
                  <input
                    className="mt-1 w-full bg-transparent text-xs text-muted outline-none"
                    placeholder="…"
                    value={b.caption}
                    onChange={(e) => update(b.id, { caption: e.target.value })}
                  />
                </figure>
              )}

              {"text" in b && (
                <>
                  {b.type === "bullet" && <span className="mt-1 w-5 shrink-0 text-center text-muted">•</span>}
                  {b.type === "numbered" && <span className="mt-1 w-5 shrink-0 text-right text-sm text-muted">{numbers[i]}.</span>}
                  {b.type === "todo" && (
                    <input
                      type="checkbox"
                      className="mt-1.5 size-4 shrink-0"
                      checked={b.checked}
                      onChange={(e) => {
                        update(b.id, { checked: e.target.checked });
                        if (b.taskId) start(() => toggleDone(b.taskId!, e.target.checked));
                      }}
                    />
                  )}
                  <AutoTextarea
                    ref={(el) => {
                      if (el) refs.current.set(b.id, el);
                      else refs.current.delete(b.id);
                    }}
                    value={b.text}
                    onChange={(v) => onText(b, v)}
                    onKeyDown={(e) => onKeyDown(e, b, i)}
                    className={
                      {
                        h1: "text-2xl font-bold",
                        h2: "text-lg font-semibold",
                        quote: "border-l-2 border-line pl-3 italic text-muted",
                        todo: b.type === "todo" && b.checked ? "text-muted line-through" : "",
                      }[b.type as string] ?? ""
                    }
                  />
                  {b.type === "todo" && b.taskId ? (
                    <Link href={`/tasks/${b.taskId}`} className="mt-1 shrink-0 text-xs text-accent">↗ {t.linkedTask}</Link>
                  ) : (
                    b.text.trim() && (
                      <button
                        className="mt-1 shrink-0 text-xs text-muted opacity-0 hover:text-accent group-hover:opacity-100"
                        onClick={() => toTask(b)}
                      >
                        {t.toTask}
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted">{t.noteHint}</p>
      <div className="mt-6 border-t border-line pt-4">
        <button
          className="btn-ghost text-danger"
          onClick={() => confirm(t.confirmDelete) && start(() => deleteNote(note.id))}
        >
          {t.delete}
        </button>
      </div>
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  onKeyDown,
  className,
  ref,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className: string;
  ref: (el: HTMLTextAreaElement | null) => void;
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        ref(el);
      }}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={`w-full resize-none overflow-hidden bg-transparent leading-7 outline-none ${className}`}
    />
  );
}
