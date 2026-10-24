"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { areas, memberships, users, workspaces } from "@/db/schema";
import { createSession, destroySession } from "@/lib/auth";

export type AuthState = { error?: string } | undefined;

const SignUp = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  timezone: z.string().default("UTC"),
  locale: z.enum(["ru", "en"]).default("ru"),
});

const STARTER_AREAS = {
  ru: [
    ["Бизнес", "#6366f1", "💼"],
    ["Недвижимость", "#f59e0b", "🏠"],
    ["Семья", "#ec4899", "❤️"],
    ["Здоровье", "#10b981", "🌿"],
  ],
  en: [
    ["Business", "#6366f1", "💼"],
    ["Property", "#f59e0b", "🏠"],
    ["Family", "#ec4899", "❤️"],
    ["Health", "#10b981", "🌿"],
  ],
} as const;

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = SignUp.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid" };
  const { name, email, password, timezone, locale } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { error: "exists" };

  const { userId, workspaceId } = await db.transaction(async (tx) => {
    const [ws] = await tx.insert(workspaces).values({ name }).returning();
    const [user] = await tx
      .insert(users)
      .values({ name, email, passwordHash: await bcrypt.hash(password, 12), timezone, locale })
      .returning();
    await tx.insert(memberships).values({ workspaceId: ws.id, userId: user.id, role: "owner" });
    await tx.insert(areas).values(
      STARTER_AREAS[locale].map(([n, color, icon], i) => ({
        workspaceId: ws.id,
        name: n,
        color,
        icon,
        sortOrder: i,
      })),
    );
    return { userId: user.id, workspaceId: ws.id };
  });
  await createSession(userId, workspaceId);
  redirect("/");
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "credentials" };
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
  if (!m) return { error: "credentials" };
  await createSession(user.id, m.workspaceId);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
