import { afterEach, describe, expect, it } from "vitest";
import type { IRole } from "@/shared/types";
import { buildRoleSeed } from "@/features/rbac/permissions/seed";
import { hydrateRbac, invalidateRbac } from "@/features/rbac/store/rbacConfig";
import { APP_NAV_GROUPS, isNavItemVisible, type INavItem } from "./navigation";

function seedRoles(): IRole[] {
  return buildRoleSeed().map((r) => ({
    ...r,
    id: r.slug,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

function navItem(label: string): INavItem {
  const found = APP_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === label);
  if (!found) throw new Error(`nav item not found: ${label}`);
  return found;
}

describe("isNavItemVisible — hybrid nav gating", () => {
  afterEach(() => invalidateRbac());

  it("matrix-driven items follow the permission, not a hardcoded role list", () => {
    hydrateRbac(seedRoles());
    // Atendimento is gated by `conversation` view.
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Owner" })).toBe(true);
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Vendedor" })).toBe(true);
    // Gestor gains Atendimento (has conversation view) — the reported gap.
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Gestor" })).toBe(true);
    // Financeiro has no conversation permission → hidden.
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Financeiro" })).toBe(false);
  });

  it("role-gated structural items keep their allowlist", () => {
    hydrateRbac(seedRoles());
    expect(isNavItemVisible(navItem("Início"), { role: "Owner" })).toBe(true);
    // Comissões is kept on roles (Gestor has `approve`, not `view`).
    expect(isNavItemVisible(navItem("Comissões"), { role: "Gestor" })).toBe(true);
    // DRE stays Owner-only despite the matrix granting Gestor view.
    expect(isNavItemVisible(navItem("DRE Gerencial"), { role: "Gestor" })).toBe(false);
  });

  /**
   * Regression guard: every structural (`roles`) item must list Gestor whenever
   * the route's own `requireAuth` allowlist already admits Gestor. Drifting apart
   * produces pages that are reachable but unreachable *through the UI* — the
   * class of bug that left the Gestor without "Início" (the Manager Dashboard,
   * which is also their post-login redirect target).
   */
  it("Gestor sees the structural items whose routes already admit Gestor", () => {
    hydrateRbac(seedRoles());
    // /app/inicio renders ManagerDashboardPage and is defaultRedirectForRole("Gestor").
    expect(isNavItemVisible(navItem("Início"), { role: "Gestor" })).toBe(true);
    // requireAuth(["Owner", "Gestor"]) on /app/carteira and /app/sdr.
    expect(isNavItemVisible(navItem("Carteira"), { role: "Gestor" })).toBe(true);
    expect(isNavItemVisible(navItem("Painel SDR"), { role: "Gestor" })).toBe(true);
    // requireAuth(["Owner", "Gestor", "Vendedor", "Financeiro"]) on /app/gestao/ranking.
    expect(isNavItemVisible(navItem("Ranking"), { role: "Gestor" })).toBe(true);
  });

  /**
   * "Admin" points at /app/configuracoes, which carries no guard at all — it
   * just redirects to /app/configuracoes/perfil (plain requireAuth). The
   * SettingsLayout then filters its own sidebar per role, and a Gestor holds 18
   * of those screens (Papéis, Lojas, Templates WhatsApp, Tags, Auditoria, …).
   * Gating the entry point on Owner left the Gestor with no labelled door to any
   * of them.
   */
  it("Gestor reaches the settings area entry point", () => {
    hydrateRbac(seedRoles());
    expect(isNavItemVisible(navItem("Admin"), { role: "Gestor" })).toBe(true);
    expect(isNavItemVisible(navItem("Admin"), { role: "Owner" })).toBe(true);
  });

  it("personal settings entries are visible to every staff role", () => {
    hydrateRbac(seedRoles());
    // Mirrors SettingsLayout's own allowlist — the two must not disagree.
    for (const role of ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno", "Financeiro"] as const) {
      expect(isNavItemVisible(navItem("Perfil"), { role })).toBe(true);
      expect(isNavItemVisible(navItem("Aparência"), { role })).toBe(true);
    }
  });

  it("custom roles drive matrix-gated items via roleKey", () => {
    const customNoConversation: IRole = {
      id: "role-noconv",
      slug: "role-noconv",
      name: "Vendedor sem inbox",
      isSystem: false,
      isOwnerImmutable: false,
      baseRole: "Vendedor",
      storeId: null,
      permissions: [{ resource: "customer", actions: ["view"], scope: "own" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    hydrateRbac([...seedRoles(), customNoConversation]);

    const customUser = { role: "Vendedor" as const, roleKey: "role-noconv" };
    // The custom role drops conversation → Atendimento hidden, even though the
    // base Vendedor would see it.
    expect(isNavItemVisible(navItem("Atendimento"), customUser)).toBe(false);
    expect(isNavItemVisible(navItem("Atendimento"), { role: "Vendedor" })).toBe(true);
    // ...but it keeps customer → Clientes stays visible.
    expect(isNavItemVisible(navItem("Clientes"), customUser)).toBe(true);
  });

  it("returns false for a missing user", () => {
    hydrateRbac(seedRoles());
    expect(isNavItemVisible(navItem("Atendimento"), null)).toBe(false);
    expect(isNavItemVisible(navItem("Início"), null)).toBe(false);
  });

  // Regression: the RBAC cache used to be hydrated at app boot — above
  // <AuthProvider>, so it also ran on the login screen. Unauthenticated,
  // `roles.list()` resolves with `[]` (RLS grants SELECT to `anon` but has no
  // policy for it), and hydrating that empty array flipped every
  // matrix-driven nav item to hidden until the user reloaded the page.
  it("keeps matrix-driven items visible after an unauthenticated empty load", () => {
    hydrateRbac([]);
    const owner = { role: "Owner" as const };
    for (const label of [
      "Atendimento",
      "Clientes",
      "Leads",
      "Veículos",
      "Catálogo",
      "Orçamentos",
      "Pedidos",
      "Metas",
      "Indicadores",
    ]) {
      expect(isNavItemVisible(navItem(label), owner), `${label} must stay visible`).toBe(true);
    }
  });
});

describe("grupo SUPRIMENTOS (PRD-216)", () => {
  afterEach(() => invalidateRbac());

  function suprimentos() {
    const group = APP_NAV_GROUPS.find((g) => g.label === "Suprimentos");
    if (!group) throw new Error("grupo Suprimentos não encontrado");
    return group;
  }

  it("traz as QUATRO telas do kit, nesta ordem", () => {
    expect(suprimentos().items.map((i) => i.label)).toEqual([
      "Notas de entrada",
      "Importar XML",
      "Entrada de nota",
      "Análise IA",
    ]);
  });

  it("aparece para quem tem supplies.view", () => {
    hydrateRbac(seedRoles());
    for (const item of suprimentos().items) {
      expect(isNavItemVisible(item, { role: "Owner", roleKey: "Owner" })).toBe(true);
      expect(isNavItemVisible(item, { role: "Gestor", roleKey: "Gestor" })).toBe(true);
      expect(isNavItemVisible(item, { role: "Financeiro", roleKey: "Financeiro" })).toBe(true);
    }
  });

  it("some para quem vende — custo de compra não é do time comercial", () => {
    hydrateRbac(seedRoles());
    for (const item of suprimentos().items) {
      expect(isNavItemVisible(item, { role: "Vendedor", roleKey: "Vendedor" })).toBe(false);
      expect(isNavItemVisible(item, { role: "VendedorExterno", roleKey: "VendedorExterno" })).toBe(
        false,
      );
      expect(isNavItemVisible(item, { role: "SDR", roleKey: "SDR" })).toBe(false);
    }
  });

  it("é gateado pela matriz, nunca por lista de papéis", () => {
    // `roles` e `permission` são AND no requireAuth, e uma lista de papéis
    // anularia o Editor de Papéis para papéis customizados.
    for (const item of suprimentos().items) {
      expect(item.permission?.resource).toBe("supplies");
      expect(item.roles).toBeUndefined();
    }
  });
});
