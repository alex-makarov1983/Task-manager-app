import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { NoteBlock } from "@/lib/notes";
import type { ParsedTask } from "@/lib/quick-parse";
import type { Recurrence } from "@/lib/recurrence";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- Tenancy & auth ----------
// Every domain row carries workspace_id: one workspace = one account (tenant).

export const roleEnum = pgEnum("role", ["owner", "assistant"]);
export const localeEnum = pgEnum("locale", ["ru", "en"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  locale: localeEnum("locale").notNull().default("ru"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const sessions = pgTable("sessions", {
  // sha256 of the cookie token; the raw token never touches the database
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------- Hierarchy: Area → Project → Task → Subtask ----------

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    icon: text("icon").notNull().default("●"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("areas_ws_idx").on(t.workspaceId)],
);

export const projectStatusEnum = pgEnum("project_status", ["active", "paused", "done", "archived"]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: projectStatusEnum("status").notNull().default("active"),
    deadline: date("deadline"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("projects_ws_idx").on(t.workspaceId)],
);

export const taskStatusEnum = pgEnum("task_status", [
  "inbox",
  "todo",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    // Subtasks are one level deep: a subtask's parent never has a parent itself.
    parentId: uuid("parent_id"),
    status: taskStatusEnum("status").notNull().default("inbox"),
    // 1 = P1 urgent … 4 = P4 low
    priority: integer("priority").notNull().default(3),
    startDate: date("start_date"),
    deadline: date("deadline"),
    time: time("time"),
    durationMin: integer("duration_min"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    someday: boolean("someday").notNull().default(false),
    // Hidden from assistants even inside a shared project (v2).
    personal: boolean("personal").notNull().default(false),
    // Manual "top 3 of the day" pick for the Focus dashboard.
    focusDate: date("focus_date"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    // Times this series has already repeated (for "end after N times").
    recurrenceCount: integer("recurrence_count").notNull().default(0),
    sourceNoteId: uuid("source_note_id"),
    // Fields the AI proposed but was not sure about; the user confirms them from Inbox.
    suggestion: jsonb("suggestion").$type<ParsedTask>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_ws_status_idx").on(t.workspaceId, t.status),
    index("tasks_ws_project_idx").on(t.workspaceId, t.projectId),
    index("tasks_parent_idx").on(t.parentId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [index("tags_ws_idx").on(t.workspaceId)],
);

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] })],
);

// ---------- Notes ----------

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    blocks: jsonb("blocks").$type<NoteBlock[]>().notNull().default([]),
    // Plain-text projection of blocks, kept for full-text search.
    plainText: text("plain_text").notNull().default(""),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    parentNoteId: uuid("parent_note_id"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notes_ws_idx").on(t.workspaceId)],
);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  // MVP stores bytes in Postgres; move to object storage before multi-user launch.
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

// ---------- Audit ----------

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_ws_idx").on(t.workspaceId, t.createdAt)],
);

export type Task = typeof tasks.$inferSelect;
export type Area = typeof areas.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
