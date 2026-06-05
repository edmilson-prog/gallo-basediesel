import { describe, expect, it } from "vitest";
import { createSession } from "../../engine/sessionStore";
import { groupSessionsByDate } from "../sessionGrouping";

const NOW = new Date("2026-05-20T12:00:00.000Z");

function at(iso: string) {
  const s = createSession(iso, iso);
  return { ...s, updatedAt: iso };
}

describe("groupSessionsByDate", () => {
  it("separa Hoje / Ontem / Anteriores e ordena desc dentro do grupo", () => {
    const sessions = [
      at("2026-05-20T08:00:00.000Z"), // hoje
      at("2026-05-20T11:00:00.000Z"), // hoje (mais recente)
      at("2026-05-19T10:00:00.000Z"), // ontem
      at("2026-05-10T10:00:00.000Z"), // anteriores
    ];
    const groups = groupSessionsByDate(sessions, NOW);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.sessions]));
    expect(byLabel["Hoje"]?.map((s) => s.updatedAt)).toEqual([
      "2026-05-20T11:00:00.000Z",
      "2026-05-20T08:00:00.000Z",
    ]);
    expect(byLabel["Ontem"]).toHaveLength(1);
    expect(byLabel["Anteriores"]).toHaveLength(1);
  });

  it("omite grupos vazios", () => {
    const groups = groupSessionsByDate([at("2026-05-20T08:00:00.000Z")], NOW);
    expect(groups.map((g) => g.label)).toEqual(["Hoje"]);
  });

  it("lista vazia → sem grupos", () => {
    expect(groupSessionsByDate([], NOW)).toEqual([]);
  });
});
