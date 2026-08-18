import { afterEach, describe, expect, it } from "vitest";
import type { RoleName } from "@/shared/types";
import { buildRoleSeed } from "@/features/rbac/permissions/seed";
import { hydrateRbac, invalidateRbac } from "@/features/rbac/store/rbacConfig";
import { SETTINGS_GROUPS, isSettingsItemVisible, type ISettingsItem } from "./SettingsLayout";

function seedRoles() {
  return buildRoleSeed().map((r) => ({
    ...r,
    id: r.slug,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

function item(label: string): ISettingsItem {
  const found = SETTINGS_GROUPS.flatMap((g) => g.items).find((i) => i.label === label);
  if (!found) throw new Error(`settings item not found: ${label}`);
  return found;
}

/** Labels visible to `role`, in production (not the Demonstração data source). */
function visibleFor(role: RoleName): string[] {
  return SETTINGS_GROUPS.flatMap((g) => g.items)
    .filter((it) => isSettingsItemVisible(it, { role }, role, false))
    .map((it) => it.label);
}

/**
 * Owner-only by explicit decision (2026-08-07): infrastructure screens where a
 * mistake leaks a credential or takes the platform down, plus the P&L. Everything
 * else in Configurações is open to the Gestor.
 */
const OWNER_ONLY = [
  "Chaves & API",
  "WhatsApp",
  "Inteligência artificial",
  "Ambiente & Dados",
  "Segurança da sessão",
  "Portal do cliente",
  "Financeiro / DRE",
];

describe("SettingsLayout — visibilidade por papel", () => {
  afterEach(() => invalidateRbac());

  it("o Owner vê todas as telas de Configurações", () => {
    hydrateRbac(seedRoles());
    const all = SETTINGS_GROUPS.flatMap((g) => g.items).filter((it) => !it.demoOnly);
    const visible = new Set(visibleFor("Owner"));
    for (const it of all) {
      expect(visible.has(it.label), `Owner deve ver "${it.label}"`).toBe(true);
    }
  });

  it("o Gestor vê tudo menos as telas sensíveis de infraestrutura e o DRE", () => {
    hydrateRbac(seedRoles());
    const visible = new Set(visibleFor("Gestor"));
    for (const label of OWNER_ONLY) {
      expect(visible.has(label), `"${label}" deve seguir Dono-only`).toBe(false);
    }
    const all = SETTINGS_GROUPS.flatMap((g) => g.items).filter((it) => !it.demoOnly);
    for (const it of all) {
      if (OWNER_ONLY.includes(it.label)) continue;
      expect(visible.has(it.label), `Gestor deve ver "${it.label}"`).toBe(true);
    }
  });

  /**
   * These four used to be gated on `roles: ["Owner"]` while their routes carried
   * BOTH a role ceiling and `settings.edit`. Since `requireAuth` demands both,
   * the matrix grant was inert — the Role Editor could only restrict, never
   * widen. The routes dropped the ceiling, so the matrix governs them for real;
   * this pins that the menu follows the same gate.
   */
  it("as telas operacionais passaram a ser governadas pela matriz", () => {
    hydrateRbac(seedRoles());
    for (const label of [
      "Distribuição",
      "Ciclo de vida",
      "Horário comercial",
      "Cadastro de veículos",
      "Alertas de ociosidade",
      "Resgate de conversas",
      "Continuidade de conversas",
      "Sons de notificação",
    ]) {
      expect(item(label).permission, `"${label}" deve ter gate de permissão`).toBeDefined();
      expect(isSettingsItemVisible(item(label), { role: "Gestor" }, "Gestor", false)).toBe(true);
    }
  });

  it("um Vendedor continua restrito às telas pessoais", () => {
    hydrateRbac(seedRoles());
    const visible = visibleFor("Vendedor");
    expect(visible).toContain("Perfil");
    expect(visible).toContain("Aparência");
    expect(visible).not.toContain("Usuários");
    expect(visible).not.toContain("Distribuição");
    expect(visible).not.toContain("Chaves & API");
  });

  // Mesma regressão coberta em navigation.test.ts: antes da hidratação (e num
  // boot sem sessão) o snapshot cai no fallback estático — nunca em "nega tudo".
  it("mantém as telas do Owner após uma hidratação vazia", () => {
    hydrateRbac([]);
    const visible = visibleFor("Owner");
    expect(visible).toContain("Papéis");
    expect(visible).toContain("Distribuição");
  });
});
