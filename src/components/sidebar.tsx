"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "@/app/actions/auth";
import { createArea, createProject } from "@/app/actions/structure";
import type { Area, Project } from "@/db/schema";
import { getDict, type Locale } from "@/lib/i18n";

type Props = { locale: Locale; areas: Area[]; projects: Project[]; inbox: number; userName: string };

export function Sidebar({ locale, areas, projects, inbox, userName }: Props) {
  const t = getDict(locale);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = [
    { href: "/", label: t.focus, icon: "◎" },
    { href: "/inbox", label: t.inbox, icon: "▢", count: inbox },
    { href: "/today", label: t.today, icon: "☀" },
    { href: "/upcoming", label: t.upcoming, icon: "▦" },
    { href: "/someday", label: t.someday, icon: "☁" },
    { href: "/logbook", label: t.logbook, icon: "✓" },
    { href: "/notes", label: t.notes, icon: "✎" },
  ];

  const link = (href: string, active: boolean) =>
    `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
      active ? "bg-accent-soft text-accent font-medium" : "text-fg hover:bg-bg-hover"
    }`;

  const orphanProjects = projects.filter((p) => !p.areaId);

  const body = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto p-3" onClick={() => setOpen(false)}>
      <ul className="space-y-0.5">
        {nav.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className={link(n.href, n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))}>
              <span className="w-4 text-center text-muted">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {n.count ? <span className="text-xs text-muted">{n.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>

      <div>
        <div className="mb-1 flex items-center justify-between px-2.5 text-xs font-medium uppercase tracking-wide text-muted">
          {t.areas}
          <InlineCreate label={t.newArea} onCreate={(name) => createArea(name)} />
        </div>
        <ul className="space-y-0.5">
          {areas.map((a) => (
            <li key={a.id}>
              <Link href={`/areas/${a.id}`} className={link("", pathname === `/areas/${a.id}`)}>
                <span className="w-4 text-center" style={{ color: a.color }}>{a.icon}</span>
                <span className="flex-1 truncate">{a.name}</span>
              </Link>
              <ul className="ml-4 space-y-0.5">
                {projects
                  .filter((p) => p.areaId === a.id)
                  .map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className={link("", pathname === `/projects/${p.id}`)}>
                        <span className="w-4 text-center text-xs text-muted">○</span>
                        <span className="flex-1 truncate">{p.name}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
          {orphanProjects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className={link("", pathname === `/projects/${p.id}`)}>
                <span className="w-4 text-center text-xs text-muted">○</span>
                <span className="flex-1 truncate">{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-1 px-2.5">
          <InlineCreate label={t.newProject} wide onCreate={(name) => createProject(name, null)} />
        </div>
      </div>

      <div className="mt-auto space-y-0.5 border-t border-line pt-3">
        <Link href="/settings" className={link("/settings", pathname === "/settings")}>
          <span className="w-4 text-center text-muted">⚙</span>
          <span className="flex-1 truncate">{userName}</span>
        </Link>
        <form action={signOut}>
          <button className={link("", false) + " w-full text-muted"}>
            <span className="w-4 text-center">↩</span>
            {t.signOut}
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg px-4 py-2 md:hidden">
        <button className="btn-ghost px-2" aria-label="Menu" onClick={() => setOpen(true)}>☰</button>
        <span className="font-semibold">{t.appName}</span>
      </header>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-line bg-bg-soft transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {body}
      </aside>
    </>
  );
}

function InlineCreate({ label, onCreate, wide }: { label: string; onCreate: (name: string) => Promise<void>; wide?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  if (!editing)
    return (
      <button
        type="button"
        title={label}
        className={wide ? "text-xs text-muted hover:text-fg" : "rounded px-1 text-base leading-none text-muted hover:text-fg"}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        {wide ? `+ ${label}` : "+"}
      </button>
    );
  return (
    <form
      className="mt-1 normal-case tracking-normal"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await onCreate(name);
          setName("");
          setEditing(false);
        });
      }}
    >
      <input
        autoFocus
        disabled={pending}
        className="input py-1"
        placeholder={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => !name && setEditing(false)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
    </form>
  );
}
