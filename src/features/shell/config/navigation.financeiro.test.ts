import { describe, expect, it } from "vitest";
import { APP_NAV_GROUPS, isNavItemVisible } from "./navigation";
import { ROUTES } from "./routes";

const groups = () => APP_NAV_GROUPS.map((g) => g.label);
const financeiro = () => APP_NAV_GROUPS.find((g) => g.label === "Financeiro");
const gestao = () => APP_NAV_GROUPS.find((g) => g.label === "Gestão");

describe("FINANCEIRO nav group", () => {
  it("sits between Comercial and SDR, as the kit lays it out", () => {
    const labels = groups();
    expect(labels.indexOf("Financeiro")).toBe(labels.indexOf("Comercial") + 1);
    expect(labels.indexOf("Financeiro")).toBeLessThan(labels.indexOf("SDR"));
  });

  it("opens with Fornecedores plus the four items moved out of Gestão", () => {
    expect(financeiro()?.items.map((i) => i.label)).toEqual([
      "Fornecedores",
      "Fluxo de Caixa",
      "Despesas",
      "Comissões",
      "DRE Gerencial",
    ]);
  });

  it("leaves no financial item behind in Gestão", () => {
    const left = gestao()?.items.map((i) => i.label) ?? [];
    expect(left).not.toContain("Despesas");
    expect(left).not.toContain("Fluxo de Caixa");
    expect(left).not.toContain("Comissões");
    expect(left).not.toContain("DRE Gerencial");
  });

  it("keeps the moved items on their original URLs", () => {
    const byLabel = (label: string) => financeiro()?.items.find((i) => i.label === label);
    expect(byLabel("Despesas")?.to).toBe(ROUTES.GESTAO_DESPESAS);
    expect(byLabel("Fluxo de Caixa")?.to).toBe(ROUTES.GESTAO_CAIXA);
    expect(byLabel("Comissões")?.to).toBe(ROUTES.GESTAO_COMISSOES);
    expect(byLabel("DRE Gerencial")?.to).toBe(ROUTES.GESTAO_DRE);
  });

  it("gates Fornecedores on the supplier resource, not on a role allowlist", () => {
    const item = financeiro()?.items.find((i) => i.label === "Fornecedores");
    expect(item?.permission).toEqual({ resource: "supplier" });
    expect(item?.roles).toBeUndefined();
    expect(item?.to).toBe(ROUTES.FINANCEIRO_FORNECEDORES);
  });

  it("hides Fornecedores from a user without the permission", () => {
    const item = financeiro()!.items.find((i) => i.label === "Fornecedores")!;
    expect(isNavItemVisible(item, null)).toBe(false);
  });
});
