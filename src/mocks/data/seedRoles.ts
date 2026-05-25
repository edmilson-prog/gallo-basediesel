import type { IRole, RoleName } from "@/shared/types";

/**
 * Canonical 7 roles of the RBAC layer (PRD-006).
 *
 * Permissions modelled here are coherent defaults — the management screen of
 * PRD-006 may refine them per-role. Resource names follow the entity glossary
 * (PRD-002): "customer", "lead", "order", etc., always singular.
 */
export const SEED_ROLES: IRole[] = [
  {
    id: "role-owner",
    name: "Owner",
    description:
      "Fundador e dono da operação. Tem acesso irrestrito a todos os recursos da plataforma.",
    permissions: [
      { resource: "*", actions: ["view", "create", "edit", "delete", "approve"], scope: "all" },
    ],
  },
  {
    id: "role-gestor",
    name: "Gestor",
    description:
      "Gerente comercial. Acompanha equipe, ajusta metas, faz transferências de carteira.",
    permissions: [
      { resource: "customer", actions: ["view", "create", "edit"], scope: "store" },
      { resource: "lead", actions: ["view", "create", "edit"], scope: "store" },
      { resource: "order", actions: ["view", "edit", "approve"], scope: "store" },
      { resource: "quote", actions: ["view", "edit", "approve"], scope: "store" },
      { resource: "conversation", actions: ["view", "edit"], scope: "store" },
      { resource: "goal", actions: ["view", "create", "edit"], scope: "store" },
      { resource: "transfer", actions: ["view", "create", "edit"], scope: "store" },
      { resource: "report", actions: ["view"], scope: "store" },
    ],
  },
  {
    id: "role-vendedor",
    name: "Vendedor",
    description: "Vendedor interno. Atende clientes da sua carteira via Central de Atendimento.",
    permissions: [
      { resource: "customer", actions: ["view", "create", "edit"], scope: "own" },
      { resource: "lead", actions: ["view", "create", "edit"], scope: "own" },
      { resource: "order", actions: ["view", "create", "edit"], scope: "own" },
      { resource: "quote", actions: ["view", "create", "edit"], scope: "own" },
      { resource: "conversation", actions: ["view", "edit"], scope: "own" },
      { resource: "vehicle", actions: ["view", "create", "edit"], scope: "own" },
    ],
  },
  {
    id: "role-sdr",
    name: "SDR",
    description:
      "Agente de pré-vendas (IA). Atende 24/7, qualifica leads e escala para vendedor humano.",
    permissions: [
      { resource: "lead", actions: ["view", "create", "edit"], scope: "store" },
      { resource: "conversation", actions: ["view", "edit"], scope: "store" },
      { resource: "quote", actions: ["view", "create"], scope: "store" },
      { resource: "customer", actions: ["view"], scope: "store" },
    ],
  },
  {
    id: "role-cliente",
    name: "Cliente",
    description: "Comprador B2B ou B2C. Acessa apenas a vitrine pública e portal do cliente.",
    permissions: [
      { resource: "catalog", actions: ["view"], scope: "all" },
      { resource: "order", actions: ["view", "create"], scope: "own" },
      { resource: "quote", actions: ["view", "approve"], scope: "own" },
    ],
  },
  {
    id: "role-vendedor-externo",
    name: "VendedorExterno",
    description: "Representante externo / vendedor de campo. Opera via PWA (PRD-070).",
    permissions: [
      { resource: "customer", actions: ["view", "create", "edit"], scope: "own" },
      { resource: "order", actions: ["view", "create"], scope: "own" },
      { resource: "quote", actions: ["view", "create"], scope: "own" },
      { resource: "commission", actions: ["view"], scope: "own" },
    ],
  },
  {
    id: "role-financeiro",
    name: "Financeiro",
    description: "Acompanha pedidos, comissões e DRE gerencial.",
    permissions: [
      { resource: "order", actions: ["view", "edit"], scope: "store" },
      { resource: "commission", actions: ["view", "edit", "approve"], scope: "store" },
      { resource: "report", actions: ["view"], scope: "store" },
    ],
  },
];

export const SEED_ROLE_BY_NAME = new Map<RoleName, IRole>(SEED_ROLES.map((r) => [r.name, r]));
