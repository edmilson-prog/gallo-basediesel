import { describe, expect, it } from "vitest";
import { getNextActionInfo } from "../utils/leadDisplay";
import { NEXT_ACTION_PRESETS, daysOverdue, resolveDueDate } from "./nextAction";

/** Mid-afternoon, so a naive UTC parse would visibly land on the wrong day. */
const NOW = new Date(2026, 7, 8, 15, 30);

describe("resolveDueDate", () => {
  it("marca hoje como hoje, não como um dia atrasado", () => {
    // `new Date("2026-08-08")` é meia-noite UTC — em BRT isso é 07/08 às 21h, e
    // a ação nasceria vencida. O caso que justifica a função existir.
    const due = resolveDueDate("today", NOW);
    expect(getNextActionInfo(due, NOW).urgency).toBe("today");
    expect(daysOverdue(due, NOW)).toBe(0);
  });

  it("amanhã e esta semana caem no futuro", () => {
    expect(getNextActionInfo(resolveDueDate("tomorrow", NOW), NOW).urgency).toBe("tomorrow");
    expect(getNextActionInfo(resolveDueDate("thisWeek", NOW), NOW).urgency).toBe("future");
    expect(daysOverdue(resolveDueDate("thisWeek", NOW), NOW)).toBe(-7);
  });

  it("zera a hora — a ação vence no dia, não no minuto", () => {
    const morning = resolveDueDate("today", new Date(2026, 7, 8, 8, 0));
    const evening = resolveDueDate("today", new Date(2026, 7, 8, 23, 0));
    expect(morning).toBe(evening);
  });
});

describe("daysOverdue", () => {
  it("conta dias inteiros de atraso", () => {
    const due = resolveDueDate("today", new Date(2026, 7, 1, 9, 0));
    expect(daysOverdue(due, NOW)).toBe(7);
  });
});

describe("NEXT_ACTION_PRESETS", () => {
  it("cobre os quatro tipos sem repetir nenhum", () => {
    const kinds = NEXT_ACTION_PRESETS.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(["ligar", "orcamento", "retomar", "visita"]);
  });
});
