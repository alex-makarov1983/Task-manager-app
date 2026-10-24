"use client";

import { useState, useTransition } from "react";
import { deleteArea, deleteProject, updateArea, updateProject } from "@/app/actions/structure";
import type { Area, Project } from "@/db/schema";
import { getDict, type Locale } from "@/lib/i18n";

export function AreaHeader({ area, locale }: { area: Area; locale: Locale }) {
  const t = getDict(locale);
  const [name, setName] = useState(area.name);
  const [icon, setIcon] = useState(area.icon);
  const [pending, start] = useTransition();
  return (
    <div className="mb-6 flex items-center gap-3">
      <input
        className="w-12 rounded-lg bg-transparent text-center text-2xl outline-none hover:bg-bg-soft"
        value={icon}
        aria-label={t.icon}
        onChange={(e) => setIcon(e.target.value)}
        onBlur={() => icon && icon !== area.icon && start(() => updateArea(area.id, { icon }))}
      />
      <input
        className="min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== area.name && start(() => updateArea(area.id, { name: name.trim() }))}
      />
      <input
        type="color"
        aria-label={t.color}
        className="size-8 cursor-pointer rounded border-0 bg-transparent"
        defaultValue={area.color}
        onChange={(e) => start(() => updateArea(area.id, { color: e.target.value }))}
      />
      <button
        className="btn-ghost text-xs text-danger"
        disabled={pending}
        onClick={() => confirm(t.confirmDelete) && start(() => deleteArea(area.id))}
      >
        {t.delete}
      </button>
    </div>
  );
}

export function ProjectHeader({ project, areas, locale }: { project: Project; areas: Area[]; locale: Locale }) {
  const t = getDict(locale);
  const [name, setName] = useState(project.name);
  const [pending, start] = useTransition();
  return (
    <div className="mb-6">
      <input
        className="w-full bg-transparent text-2xl font-semibold outline-none"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== project.name && start(() => updateProject(project.id, { name: name.trim() }))}
      />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label>
          <span className="label">{t.status}</span>
          <select
            className="input py-1.5"
            value={project.status}
            onChange={(e) => start(() => updateProject(project.id, { status: e.target.value as Project["status"] }))}
          >
            {Object.entries(t.projectStatuses).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t.area}</span>
          <select
            className="input py-1.5"
            value={project.areaId ?? ""}
            onChange={(e) => start(() => updateProject(project.id, { areaId: e.target.value || null }))}
          >
            <option value="">{t.none}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{t.deadline}</span>
          <input
            type="date"
            className="input py-1.5"
            defaultValue={project.deadline ?? ""}
            onChange={(e) => start(() => updateProject(project.id, { deadline: e.target.value || null }))}
          />
        </label>
        <button
          className="btn-ghost ml-auto text-xs text-danger"
          disabled={pending}
          onClick={() => confirm(t.confirmDelete) && start(() => deleteProject(project.id))}
        >
          {t.delete}
        </button>
      </div>
    </div>
  );
}
