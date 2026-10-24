import { describe, expect, it } from "vitest";
import { quickParse } from "./quick-parse";

// 2026-10-24 is a Saturday
const today = "2026-10-24";

describe("quickParse", () => {
  it("extracts priority, deadline and tags in Russian", () => {
    const p = quickParse("Оплатить счёт за виллу до пятницы срочно #бали", today);
    expect(p).toMatchObject({
      title: "Оплатить счёт за виллу",
      priority: 1,
      deadline: "2026-10-30",
      tags: ["бали"],
    });
  });

  it("start date and time with fillers removed", () => {
    const p = quickParse("Позвонить юристу завтра в 15:00", today);
    expect(p).toMatchObject({ title: "Позвонить юристу", startDate: "2026-10-25", time: "15:00" });
  });

  it("English with pm time and project", () => {
    const p = quickParse("Call bank tomorrow at 3pm +Renovation p2", today);
    expect(p).toMatchObject({
      title: "Call bank",
      startDate: "2026-10-25",
      time: "15:00",
      projectName: "Renovation",
      priority: 2,
    });
  });

  it("weekday means the coming one", () => {
    expect(quickParse("отчёт в субботу", today).startDate).toBe("2026-10-31");
    expect(quickParse("report mon", today).startDate).toBe("2026-10-26");
  });

  it("dd.mm rolls into next year when past", () => {
    expect(quickParse("Продлить визу 05.01", today).startDate).toBe("2027-01-05");
  });

  it("recurrence", () => {
    const p = quickParse("Полить цветы каждый понедельник", today);
    expect(p.recurrence).toMatchObject({ freq: "weekly", byWeekday: [0] });
    expect(p.startDate).toBe("2026-10-26");
    expect(quickParse("Зарядка каждый день", today).recurrence?.freq).toBe("daily");
  });

  it("someday", () => {
    expect(quickParse("Выучить испанский когда-нибудь", today)).toMatchObject({
      title: "Выучить испанский",
      someday: true,
    });
  });
});
