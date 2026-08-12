import { describe, expect, it } from "vitest";
import {
  TITLE_MAX_CHARS,
  buildUpdateNotification,
  decideBroadcast,
  isQuietHour,
  saoPauloHour,
} from "./broadcastGate";

/** UTC instant for a given São Paulo hour (fixed UTC-3). */
const atSaoPaulo = (hour: number) => new Date(Date.UTC(2026, 7, 12, (hour + 3) % 24, 30, 0));

describe("saoPauloHour", () => {
  it("shifts three hours back from UTC", () => {
    expect(saoPauloHour(new Date("2026-08-12T12:00:00Z"))).toBe(9);
  });

  it("wraps around midnight instead of going negative", () => {
    expect(saoPauloHour(new Date("2026-08-12T01:00:00Z"))).toBe(22);
    expect(saoPauloHour(new Date("2026-08-12T00:30:00Z"))).toBe(21);
  });
});

describe("isQuietHour", () => {
  it.each([
    [6, true],
    [7, false],
    [12, false],
    [20, false],
    [21, true],
    [23, true],
    [3, true],
  ])("hora %i em São Paulo → silencioso=%s", (hour, quiet) => {
    expect(isQuietHour(atSaoPaulo(hour))).toBe(quiet);
  });
});

describe("decideBroadcast", () => {
  const noon = atSaoPaulo(12);
  const night = atSaoPaulo(23);

  it("sends for a build nobody announced yet", () => {
    expect(
      decideBroadcast({
        liveBuildId: "abc.1",
        alreadyNotified: false,
        isFirstRun: false,
        now: noon,
      }),
    ).toBe("send");
  });

  it("never announces the same build twice", () => {
    // The dedupe key is the build id, and the row is written before the sends —
    // two workers racing cannot both win.
    expect(
      decideBroadcast({
        liveBuildId: "abc.1",
        alreadyNotified: true,
        isFirstRun: false,
        now: noon,
      }),
    ).toBe("already-notified");
  });

  it("records the live build silently on the very first run", () => {
    // Sem isto, o primeiro tique anunciaria "nova versão" para um build que todo
    // mundo já está rodando — estreia da feature avisando coisa nenhuma.
    expect(
      decideBroadcast({
        liveBuildId: "abc.1",
        alreadyNotified: false,
        isFirstRun: true,
        now: noon,
      }),
    ).toBe("bootstrap");
  });

  it("bootstraps even at night, because recording is not announcing", () => {
    expect(
      decideBroadcast({
        liveBuildId: "abc.1",
        alreadyNotified: false,
        isFirstRun: true,
        now: night,
      }),
    ).toBe("bootstrap");
  });

  it("stays silent at night", () => {
    expect(
      decideBroadcast({
        liveBuildId: "abc.1",
        alreadyNotified: false,
        isFirstRun: false,
        now: night,
      }),
    ).toBe("quiet-hours");
  });

  it("prefers 'already-notified' over the clock, so a repeat never looks deferred", () => {
    expect(
      decideBroadcast({
        liveBuildId: "abc.1",
        alreadyNotified: true,
        isFirstRun: false,
        now: night,
      }),
    ).toBe("already-notified");
  });

  it.each([[null], [undefined], [""]])("never guesses when version.json reads %s", (build) => {
    expect(
      decideBroadcast({ liveBuildId: build, alreadyNotified: false, isFirstRun: false, now: noon }),
    ).toBe("unknown-build");
  });
});

describe("buildUpdateNotification", () => {
  it("names the version, so the second push is not a mystery", () => {
    const notice = buildUpdateNotification("0.175.0");
    expect(notice.body).toContain("0.175.0");
    expect(notice.title).toBe("Nova versão disponível");
    expect(notice.url).toBe("/atendimento");
  });

  it("nunca nomeia o app no título — o iOS já acrescenta 'from <app>'", () => {
    // Regressão real: com o título "GALLO Atendimento", a tela de bloqueio saiu
    // "GALLO Atendimento from Atendimento" — o nome duas vezes, e nada sobre o
    // que aconteceu. O sufixo vem do manifest e não é editável por mensagem, então
    // a única defesa é o título não repeti-lo.
    for (const version of ["0.175.0", null, undefined, "  "]) {
      expect(buildUpdateNotification(version).title).not.toMatch(/atendimento|gallo/i);
    }
  });

  it("cabe na tela de bloqueio sem ser cortado", () => {
    for (const version of ["0.175.0", null]) {
      expect(buildUpdateNotification(version).title.length).toBeLessThanOrEqual(TITLE_MAX_CHARS);
    }
  });

  it("collapses repeats under one tag", () => {
    expect(buildUpdateNotification("0.175.0").tag).toBe("app-update");
    expect(buildUpdateNotification("0.176.0").tag).toBe("app-update");
  });

  it("still says something useful without a version", () => {
    for (const missing of [null, undefined, "  "]) {
      expect(buildUpdateNotification(missing).body).toBe("Toque para atualizar o app.");
    }
  });
});
