import { describe, expect, it } from "vitest";
import type { RoleName } from "@/shared/types";
import { hasPermission } from "../utils/hasPermission";
import { RESOURCES } from "./resources";
import { buildResourceSeed, buildRoleSeed } from "./seed";

const user = (role: RoleName) => ({ role, roleKey: role });

describe("recurso RBAC supplies (PRD-216)", () => {
  it("está no catálogo de recursos", () => {
    expect(RESOURCES).toContain("supplies");
  });

  it("deixa Owner e Gestor conferirem e lançarem", () => {
    for (const role of ["Owner", "Gestor"] as const) {
      expect(hasPermission(user(role), "supplies", "view")).toBe(true);
      expect(hasPermission(user(role), "supplies", "create")).toBe(true);
      expect(hasPermission(user(role), "supplies", "edit")).toBe(true);
    }
  });

  it("deixa Financeiro ver, porque as duplicatas viram contas a pagar", () => {
    expect(hasPermission(user("Financeiro"), "supplies", "view")).toBe(true);
  });

  it("não deixa Financeiro lançar — lançar move estoque e recalcula custo", () => {
    expect(hasPermission(user("Financeiro"), "supplies", "create")).toBe(false);
    expect(hasPermission(user("Financeiro"), "supplies", "edit")).toBe(false);
  });

  it("esconde de quem vende: custo de compra não é do time comercial", () => {
    for (const role of ["Vendedor", "VendedorExterno", "SDR", "Cliente"] as const) {
      expect(hasPermission(user(role), "supplies", "view")).toBe(false);
    }
  });

  it("entra no seed com rótulo e grupo, senão o menu some para todos", () => {
    const resource = buildResourceSeed().find((r) => r.key === "supplies");
    expect(resource).toBeDefined();
    expect(resource!.label).toBe("Notas de entrada");
    expect(resource!.group).toBe("Suprimentos");
  });

  it("o grupo Suprimentos está na ordenação — grupo desconhecido cai no topo", () => {
    // GROUP_ORDER.indexOf() devolve -1 para grupo não listado, e -1 ordena
    // antes de tudo. Sem registrar o grupo, Suprimentos apareceria em primeiro
    // na tela de papéis por acidente, na frente de Comercial.
    const seed = buildResourceSeed();
    const supplies = seed.find((r) => r.key === "supplies");
    expect(supplies!.sortOrder).toBeGreaterThan(0);
    const firstGroup = seed[0]?.group;
    expect(firstGroup).not.toBe("Suprimentos");
  });

  it("tem linhas de permissão no seed exatamente para os três papéis que enxergam", () => {
    const roles = buildRoleSeed()
      .filter((role) => role.permissions.some((p) => p.resource === "supplies"))
      .map((role) => role.slug)
      .sort();
    expect(roles).toEqual(["Financeiro", "Gestor", "Owner"]);
  });
});
