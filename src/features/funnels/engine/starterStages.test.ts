import { describe, expect, it } from "vitest";
import { buildStarterStages } from "./starterStages";

const NAMES = {
  entrada: "Novo",
  aberta: "Em andamento",
  ganho: "Ganho",
  perda: "Perdido",
} as const;

const NOW = "2026-08-06T12:30:00.000Z";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function build(overrides: Partial<Parameters<typeof buildStarterStages>[0]> = {}) {
  return buildStarterStages({ accent: 3, names: NAMES, now: NOW, ...overrides });
}

describe("buildStarterStages", () => {
  it("carries the four kinds the deferred terminal-stage trigger requires", () => {
    expect(build().map((s) => s.kind)).toEqual(["entrada", "aberta", "ganho", "perda"]);
  });

  it("numbers positions from zero in board order", () => {
    expect(build().map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it("gives every stage an id that is a real UUID", () => {
    // The regression: ids used to be `${funnelId}-${kind}`, which mock mode
    // accepted and the `uuid` column rejected with 22P02.
    for (const stage of build()) expect(stage.id).toMatch(UUID);
  });

  it("never repeats an id across the four stages", () => {
    expect(new Set(build().map((s) => s.id)).size).toBe(4);
  });

  it("takes ids from the injected generator, one call per stage", () => {
    let n = 0;
    expect(build({ newId: () => `id-${++n}` }).map((s) => s.id)).toEqual([
      "id-1",
      "id-2",
      "id-3",
      "id-4",
    ]);
  });

  it("stamps the accent and both timestamps on every stage", () => {
    for (const stage of build({ accent: 7 })) {
      expect(stage.accent).toBe(7);
      expect(stage.createdAt).toBe(NOW);
      expect(stage.updatedAt).toBe(NOW);
    }
  });

  it("uses the names it is handed, so the engine stays free of i18n", () => {
    const stages = build({
      names: { entrada: "In", aberta: "Open", ganho: "Won", perda: "Lost" },
    });
    expect(stages.map((s) => s.name)).toEqual(["In", "Open", "Won", "Lost"]);
  });

  it("keeps every name inside the 24-char limit the column enforces", () => {
    for (const stage of build()) expect(stage.name.length).toBeLessThanOrEqual(24);
  });
});
