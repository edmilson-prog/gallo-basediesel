import { describe, expect, it } from "vitest";
import type { RoleName } from "@/shared/types";
import { defaultRedirectForRole, mapDbRoleToRoleName } from "./roleMap";

const ALL_ROLES: RoleName[] = [
  "Owner",
  "Gestor",
  "Vendedor",
  "VendedorExterno",
  "SDR",
  "Financeiro",
  "Cliente",
];

describe("roleMap", () => {
  it("traduz o vocabulário do banco para o do RBAC", () => {
    expect(mapDbRoleToRoleName("owner")).toBe("Owner");
    expect(mapDbRoleToRoleName("manager")).toBe("Gestor");
    expect(mapDbRoleToRoleName("seller_internal")).toBe("Vendedor");
    expect(mapDbRoleToRoleName("seller_external")).toBe("VendedorExterno");
    expect(mapDbRoleToRoleName("sdr")).toBe("SDR");
    expect(mapDbRoleToRoleName("financeiro")).toBe("Financeiro");
  });

  it("cai no papel menos privilegiado quando o papel do banco é desconhecido", () => {
    expect(mapDbRoleToRoleName(null)).toBe("Cliente");
    expect(mapDbRoleToRoleName("")).toBe("Cliente");
    expect(mapDbRoleToRoleName("papel_que_nao_existe")).toBe("Cliente");
  });

  /**
   * Regressão: a rota raiz decidia o destino com a sua própria lista de papéis —
   * mandava Owner e Vendedor para /app/inicio, Cliente para /loja e TODO o resto
   * (Gestor, SDR, VendedorExterno, Financeiro) para /sem-permissao. Um Gestor que
   * abrisse o domínio sem caminho — favorito, atalho, digitando — batia numa tela
   * de bloqueio mesmo logado.
   *
   * A rota agora usa `defaultRedirectForRole`, a mesma função que decide o
   * destino pós-login, então as duas não podem mais divergir. Este teste fixa a
   * propriedade que importa: nenhum papel é despejado em /sem-permissao.
   */
  it("todo papel tem um destino real — nenhum cai em /sem-permissao", () => {
    for (const role of ALL_ROLES) {
      const to = defaultRedirectForRole(role);
      expect(to, `${role} não pode cair em /sem-permissao`).not.toBe("/sem-permissao");
      expect(to.startsWith("/"), `${role} deve ter destino absoluto`).toBe(true);
    }
  });

  it("manda cada papel para a sua casa", () => {
    expect(defaultRedirectForRole("Owner")).toBe("/app/inicio");
    expect(defaultRedirectForRole("Gestor")).toBe("/app/inicio");
    expect(defaultRedirectForRole("Financeiro")).toBe("/app/inicio");
    // Vendedor tem painel pessoal em /app/inicio desde o PR do seller-dashboard;
    // antes disso a rota renderizava um bloqueio para este papel, e o destino
    // pós-login desviava para a Central.
    expect(defaultRedirectForRole("Vendedor")).toBe("/app/inicio");
    // SDR e VendedorExterno seguem na Central: /app/inicio renderiza o painel
    // do gestor para eles, cujos dados são restritos a Owner/Gestor.
    expect(defaultRedirectForRole("SDR")).toBe("/app/atendimento");
    expect(defaultRedirectForRole("VendedorExterno")).toBe("/app/atendimento");
    expect(defaultRedirectForRole("Cliente")).toBe("/loja");
  });
});
