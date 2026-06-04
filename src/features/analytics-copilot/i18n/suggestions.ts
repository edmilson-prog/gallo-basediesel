import type { RoleName } from "@/shared/types/people";

/** Suggested questions shown in the copilot empty state / chips, per role (RF-016). */
const GESTOR_SUGGESTIONS: string[] = [
  "Quanto faturei esse mês?",
  "Faturamento de filtro Volvo esse mês",
  "Qual a margem esse mês?",
  "Quantos clientes em risco?",
];

const VENDEDOR_SUGGESTIONS: string[] = [
  "Quanto faturei esse mês?",
  "Meu ticket médio",
  "Minha positivação",
];

/**
 * Returns role-appropriate example questions. Gestor/Owner see manager-scope
 * phrasings; Vendedor sees own-scope phrasings. Defaults to the Gestor list.
 */
export function suggestionsForRole(role: RoleName | null): string[] {
  if (role === "Vendedor") return VENDEDOR_SUGGESTIONS;
  return GESTOR_SUGGESTIONS;
}
