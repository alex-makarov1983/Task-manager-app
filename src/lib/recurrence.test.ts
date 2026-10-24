import { describe, expect, it } from "vitest";
import { nextOccurrence, type Recurrence } from "./recurrence";

const next = (rule: Partial<Recurrence>, anchor: string, done = anchor, count = 1) =>
  nextOccurrence({ freq: "daily", interval: 1, mode: "schedule", ...rule }, anchor, done, count);

describe("nextOccurrence", () => {
  it("daily and every N days", () => {
    expect(next({}, "2026-10-24")).toBe("2026-10-25");
    expect(next({ interval: 3 }, "2026-10-30")).toBe("2026-11-02");
  });

  it("weekly on chosen weekdays", () => {
    // 2026-10-26 is a Monday
    const rule = { freq: "weekly" as const, byWeekday: [0, 3] };
    expect(next(rule, "2026-10-26")).toBe("2026-10-29");
    expect(next(rule, "2026-10-29")).toBe("2026-11-02");
  });

  it("every other Tuesday", () => {
    expect(next({ freq: "weekly", interval: 2, byWeekday: [1] }, "2026-10-27")).toBe("2026-11-10");
  });

  it("monthly clamps to month end", () => {
    expect(next({ freq: "monthly" }, "2026-01-31")).toBe("2026-02-28");
    expect(next({ freq: "monthly", monthly: { kind: "day", day: 31 } }, "2026-02-28")).toBe(
      "2026-03-31",
    );
  });

  it("second Tuesday of the month", () => {
    const rule = { freq: "monthly" as const, monthly: { kind: "nthWeekday" as const, n: 2, weekday: 1 } };
    expect(next(rule, "2026-10-13")).toBe("2026-11-10");
  });

  it("fifth Friday skips months without one", () => {
    const rule = { freq: "monthly" as const, monthly: { kind: "nthWeekday" as const, n: 5, weekday: 4 } };
    // Oct 2026 has Fri 30; Nov has none; Dec has none (Fri 4..25); Jan 2027 has Fri 29
    expect(next(rule, "2026-10-30")).toBe("2027-01-29");
  });

  it("last workday of the month", () => {
    const rule = { freq: "monthly" as const, monthly: { kind: "lastWorkday" as const } };
    // Oct 30 2026 is Friday; Nov 30 2026 is Monday; Jan 31 2027 is Sunday → Fri 29
    expect(next(rule, "2026-10-30")).toBe("2026-11-30");
    expect(next(rule, "2026-12-31")).toBe("2027-01-29");
  });

  it("yearly handles Feb 29", () => {
    expect(next({ freq: "yearly" }, "2028-02-29")).toBe("2029-02-28");
  });

  it("after completion counts from the completion date", () => {
    expect(next({ mode: "afterCompletion", interval: 5 }, "2026-10-01", "2026-10-20")).toBe("2026-10-25");
  });

  it("stops at until and count", () => {
    expect(next({ until: "2026-10-24" }, "2026-10-24")).toBeNull();
    expect(next({ count: 3 }, "2026-10-24", "2026-10-24", 3)).toBeNull();
    expect(next({ count: 3 }, "2026-10-24", "2026-10-24", 2)).toBe("2026-10-25");
  });
});
