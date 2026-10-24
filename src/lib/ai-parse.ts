import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { weekday, type DateStr } from "./dates";
import { quickParse, type ParsedTask } from "./quick-parse";

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({
  anyOf: [{ type, ...extra }, { type: "null" }],
});

// JSON schema for structured outputs: every key required, nulls for "not mentioned".
const TASKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "priority",
          "startDate",
          "deadline",
          "time",
          "tags",
          "projectName",
          "areaName",
          "assigneeName",
          "someday",
          "recurrence",
          "confident",
        ],
        properties: {
          title: { type: "string" },
          priority: nullable("integer", { enum: [1, 2, 3, 4] }),
          startDate: nullable("string", { format: "date" }),
          deadline: nullable("string", { format: "date" }),
          time: nullable("string", { pattern: "^\\d{2}:\\d{2}$" }),
          tags: { type: "array", items: { type: "string" } },
          projectName: nullable("string"),
          areaName: nullable("string"),
          assigneeName: nullable("string"),
          someday: { type: "boolean" },
          recurrence: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["freq", "interval", "byWeekday", "mode"],
                properties: {
                  freq: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
                  interval: { type: "integer" },
                  byWeekday: { type: "array", items: { type: "integer", enum: [0, 1, 2, 3, 4, 5, 6] } },
                  mode: { type: "string", enum: ["schedule", "afterCompletion"] },
                },
              },
            ],
          },
          confident: { type: "boolean" },
        },
      },
    },
  },
};

const AiTask = z.object({
  title: z.string().min(1),
  priority: z.number().int().min(1).max(4).nullable(),
  startDate: z.string().nullable(),
  deadline: z.string().nullable(),
  time: z.string().nullable(),
  tags: z.array(z.string()),
  projectName: z.string().nullable(),
  areaName: z.string().nullable(),
  assigneeName: z.string().nullable(),
  someday: z.boolean(),
  recurrence: z
    .object({
      freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
      interval: z.number().int().min(1),
      byWeekday: z.array(z.number().int().min(0).max(6)),
      mode: z.enum(["schedule", "afterCompletion"]),
    })
    .nullable(),
  confident: z.boolean(),
});
const AiResult = z.object({ tasks: z.array(AiTask) });

const SYSTEM = `You turn a user's quick note (typed or dictated, Russian, English or mixed) into tasks for their task manager.

Rules:
- One phrase can hold several tasks; return each separately.
- title: short imperative action in the user's language, without the date, priority, tag or person words you extracted.
- startDate = the day the user plans to do it; deadline = a hard due date ("до", "by", "к", "дедлайн", "оплатить в пятницу" for bills counts as a deadline). Use ISO dates, resolved against today's date given below. A bare weekday means the coming one.
- priority: 1 urgent ("срочно", "ASAP"), 2 high ("важно"), 3 normal, 4 low; null if not stated.
- projectName / areaName: pick only from the provided lists, matching by meaning; null when nothing fits.
- assigneeName: only from the provided people; "напомни Кате …" means Katya is the assignee.
- recurrence: weekdays are 0 = Monday … 6 = Sunday; "after completion" mode for chores like "через 5 дней после полива".
- confident = false when the phrase is ambiguous or you guessed the project; the user will confirm.`;

export type ParseContext = {
  today: DateStr;
  projects: string[];
  areas: string[];
  people: string[];
};

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export const aiEnabled = () => client !== null;

/** Parse with Claude when configured; otherwise (or on any failure) fall back to the rule-based parser. */
export async function parseTasks(text: string, ctx: ParseContext): Promise<{ tasks: ParsedTask[]; source: "ai" | "rules" }> {
  const fallback = () => ({ tasks: [quickParse(text, ctx.today)], source: "rules" as const });
  if (!client) return fallback();

  const weekdayName = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][
    weekday(ctx.today)
  ];
  const context = [
    `Today: ${ctx.today} (${weekdayName})`,
    `Projects: ${ctx.projects.join("; ") || "none"}`,
    `Areas: ${ctx.areas.join("; ") || "none"}`,
    `People: ${ctx.people.join("; ") || "none"}`,
  ].join("\n");

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: TASKS_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `${context}\n\nNote:\n${text}` }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return fallback();
    const json = response.content.find((b) => b.type === "text")?.text;
    if (!json) return fallback();
    const parsed = AiResult.safeParse(JSON.parse(json));
    if (!parsed.success || parsed.data.tasks.length === 0) return fallback();

    return {
      source: "ai",
      tasks: parsed.data.tasks.map((t) => ({
        title: t.title,
        priority: t.priority ?? undefined,
        startDate: t.startDate ?? undefined,
        deadline: t.deadline ?? undefined,
        time: t.time ?? undefined,
        tags: t.tags,
        projectName: t.projectName ?? undefined,
        areaName: t.areaName ?? undefined,
        assigneeName: t.assigneeName ?? undefined,
        someday: t.someday || undefined,
        recurrence: t.recurrence
          ? {
              freq: t.recurrence.freq,
              interval: t.recurrence.interval,
              mode: t.recurrence.mode,
              ...(t.recurrence.byWeekday.length ? { byWeekday: t.recurrence.byWeekday } : {}),
            }
          : undefined,
        confident: t.confident,
      })),
    };
  } catch (err) {
    console.error("AI parse failed, using rule-based parser", err);
    return fallback();
  }
}
