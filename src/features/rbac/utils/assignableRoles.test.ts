import { describe, expect, it } from "vitest";
import type { IRole, RoleName } from "@/shared/types";
import {
  NON_ASSIGNABLE_BASE_ROLES,
  isAssignableBaseRole,
  isAssignableRole,
} from "./assignableRoles";

const STORE = "store-1";

function role(patch: Partial<IRole> & { baseRole: RoleName }): IRole {
  return {
    id: patch.id ?? "role-x",
    slug: patch.slug ?? "role-x",
    name: patch.name ?? "Papel",
    description: undefined,
    isSystem: patch.isSystem ?? false,
    isOwnerImmutable: patch.isOwnerImmutable ?? false,
    baseRole: patch.baseRole,
    storeId: patch.storeId ?? null,
    permissions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("assignableRoles — espelha o guard da Edge set-seller-role", () => {
  it("recusa as bases que a Edge recusa", () => {
    expect(NON_ASSIGNABLE_BASE_ROLES).toEqual(["Owner", "Cliente"]);
    expect(isAssignableBaseRole("Owner")).toBe(false);
    expect(isAssignableBaseRole("Cliente")).toBe(false);
  });

  it("aceita as cinco bases de equipe", () => {
    for (const base of ["Gestor", "Vendedor", "VendedorExterno", "SDR", "Financeiro"] as const) {
      expect(isAssignableBaseRole(base), base).toBe(true);
    }
  });

  /**
   * Regressão real: um papel customizado criado com base `Owner` passava no
   * filtro do dropdown de atribuição (não é `isOwnerImmutable`, não é base
   * `Cliente`) e só era recusado pela Edge, com 403 e sem explicação. Agora o
   * formulário de criação não oferece essa base — e, se um papel assim já
   * existir no banco, ele fica fora da lista de atribuíveis.
   */
  it("um papel customizado com base Owner não é atribuível", () => {
    const natimorto = role({ baseRole: "Owner", name: "TestePapel" });
    expect(natimorto.isOwnerImmutable).toBe(false); // passaria no filtro antigo
    expect(isAssignableRole(natimorto, STORE)).toBe(false);
  });

  it("o papel Dono imutável nunca é atribuível", () => {
    expect(isAssignableRole(role({ baseRole: "Owner", isOwnerImmutable: true }), STORE)).toBe(false);
  });

  it("papel global vale em qualquer loja; papel de loja só na dele", () => {
    expect(isAssignableRole(role({ baseRole: "Vendedor", storeId: null }), STORE)).toBe(true);
    expect(isAssignableRole(role({ baseRole: "Vendedor", storeId: STORE }), STORE)).toBe(true);
    expect(isAssignableRole(role({ baseRole: "Vendedor", storeId: "outra" }), STORE)).toBe(false);
  });
});
