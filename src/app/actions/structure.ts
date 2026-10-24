"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { areas, projects, users } from "@/db/schema";
import { requireViewer } from "@/lib/auth";

const refresh = () => revalidatePath("/", "layout");

export async function createArea(name: string) {
  const viewer = await requireViewer();
  if (!name.trim()) return;
  const [a] = await db.insert(areas).values({ workspaceId: viewer.workspaceId, name: name.trim() }).returning();
  refresh();
  redirect(`/areas/${a.id}`);
}

const AreaPatch = z.object({ name: z.string().min(1), color: z.string(), icon: z.string() }).partial();

export async function updateArea(id: string, input: z.infer<typeof AreaPatch>) {
  const viewer = await requireViewer();
  await db
    .update(areas)
    .set(AreaPatch.parse(input))
    .where(and(eq(areas.id, id), eq(areas.workspaceId, viewer.workspaceId)));
  refresh();
}

export async function deleteArea(id: string) {
  const viewer = await requireViewer();
  await db.delete(areas).where(and(eq(areas.id, id), eq(areas.workspaceId, viewer.workspaceId)));
  refresh();
  redirect("/");
}

export async function createProject(name: string, areaId: string | null) {
  const viewer = await requireViewer();
  if (!name.trim()) return;
  if (areaId) {
    const [a] = await db.select().from(areas).where(and(eq(areas.id, areaId), eq(areas.workspaceId, viewer.workspaceId)));
    if (!a) throw new Error("Area not found");
  }
  const [p] = await db
    .insert(projects)
    .values({ workspaceId: viewer.workspaceId, name: name.trim(), areaId })
    .returning();
  refresh();
  redirect(`/projects/${p.id}`);
}

const ProjectPatch = z
  .object({
    name: z.string().min(1),
    status: z.enum(["active", "paused", "done", "archived"]),
    areaId: z.string().uuid().nullable(),
    deadline: z.string().nullable(),
  })
  .partial();

export async function updateProject(id: string, input: z.infer<typeof ProjectPatch>) {
  const viewer = await requireViewer();
  const patch = ProjectPatch.parse(input);
  if (patch.areaId) {
    const [a] = await db.select().from(areas).where(and(eq(areas.id, patch.areaId), eq(areas.workspaceId, viewer.workspaceId)));
    if (!a) throw new Error("Area not found");
  }
  await db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, viewer.workspaceId)));
  refresh();
}

export async function deleteProject(id: string) {
  const viewer = await requireViewer();
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, viewer.workspaceId)));
  refresh();
  redirect("/");
}

const Settings = z.object({
  name: z.string().trim().min(1),
  locale: z.enum(["ru", "en"]),
  timezone: z.string().min(1),
});

export async function updateSettings(input: z.infer<typeof Settings>) {
  const viewer = await requireViewer();
  const data = Settings.parse(input);
  // Reject unknown timezones before storing them.
  new Intl.DateTimeFormat("en", { timeZone: data.timezone });
  await db.update(users).set(data).where(eq(users.id, viewer.userId));
  refresh();
}
