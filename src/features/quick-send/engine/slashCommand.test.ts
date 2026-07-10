import { describe, expect, it } from "vitest";
import type { IQuickReply } from "@/shared/types";
import {
  isKnownSlashAssetCommand,
  matchQuickRepliesByCommand,
  resolveSlashCommandCategory,
} from "./slashCommand";

describe("resolveSlashCommandCategory", () => {
  it("maps the four RF-007 commands to their category", () => {
    expect(resolveSlashCommandCategory("catalogo")).toBe("catalogo");
    expect(resolveSlashCommandCategory("tabela")).toBe("tabela_preco");
    expect(resolveSlashCommandCategory("garantia")).toBe("garantia");
    expect(resolveSlashCommandCategory("loja")).toBe("link");
  });

  it("is case-insensitive", () => {
    expect(resolveSlashCommandCategory("CATALOGO")).toBe("catalogo");
  });

  it("returns undefined for an unrecognized command", () => {
    expect(resolveSlashCommandCategory("xyz")).toBeUndefined();
  });

  it("returns undefined for an empty command", () => {
    expect(resolveSlashCommandCategory("")).toBeUndefined();
  });
});

describe("isKnownSlashAssetCommand", () => {
  it("is true for an empty command (bare '/' browse)", () => {
    expect(isKnownSlashAssetCommand("")).toBe(true);
  });

  it("is true for a recognized category command", () => {
    expect(isKnownSlashAssetCommand("garantia")).toBe(true);
  });

  it("is false for an unrecognized command (RF-007 '/xyz' scenario)", () => {
    expect(isKnownSlashAssetCommand("xyz")).toBe(false);
  });
});

describe("matchQuickRepliesByCommand", () => {
  function reply(over: Partial<IQuickReply>): IQuickReply {
    return {
      id: "r1",
      storeId: "00000000-0000-0000-0000-000000000001",
      shortcut: "/garantia",
      title: "Política de garantia",
      body: "Nossa garantia é de 90 dias.",
      scope: "shared",
      ownerId: "seller-1",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      ...over,
    };
  }

  const replies: IQuickReply[] = [
    reply({ id: "r1", shortcut: "/garantia", title: "Política de garantia" }),
    reply({ id: "r2", shortcut: "/prazo", title: "Prazo de entrega" }),
    reply({ id: "r3", shortcut: "/frete", title: "Prazo de frete" }),
  ];

  it("returns every reply when command is empty (browse)", () => {
    expect(matchQuickRepliesByCommand(replies, "").map((r) => r.id)).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
  });

  it("matches by exact shortcut", () => {
    expect(matchQuickRepliesByCommand(replies, "garantia").map((r) => r.id)).toEqual(["r1"]);
  });

  it("matches by shortcut prefix while typing", () => {
    expect(matchQuickRepliesByCommand(replies, "gar").map((r) => r.id)).toEqual(["r1"]);
  });

  it("is case-insensitive", () => {
    expect(matchQuickRepliesByCommand(replies, "GARANTIA").map((r) => r.id)).toEqual(["r1"]);
  });

  it("returns empty when no shortcut matches", () => {
    expect(matchQuickRepliesByCommand(replies, "xyz")).toEqual([]);
  });
});
