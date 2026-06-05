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

export interface ICopilotSuggestionItem {
  question: string;
  icon: string;
}

export interface ICopilotSuggestionGroup {
  label: string;
  items: ICopilotSuggestionItem[];
}

const GESTOR_GROUPS: ICopilotSuggestionGroup[] = [
  {
    label: "Faturamento & Margem",
    items: [
      { question: "Quanto faturei esse mês?", icon: "mdi:cash-multiple" },
      { question: "Qual a margem esse mês?", icon: "mdi:scale-balance" },
      { question: "Faturamento de filtro Volvo esse mês", icon: "mdi:truck-outline" },
    ],
  },
  {
    label: "Clientes & Positivação",
    items: [
      { question: "Quantos clientes em risco?", icon: "mdi:account-alert" },
      { question: "Qual a positivação esse mês?", icon: "mdi:account-check" },
      { question: "Quem são os clientes classe A?", icon: "mdi:chart-arc" },
    ],
  },
  {
    label: "Projeção",
    items: [{ question: "Onde vou fechar o mês?", icon: "mdi:chart-timeline" }],
  },
];

const VENDEDOR_GROUPS: ICopilotSuggestionGroup[] = [
  {
    label: "Meus números",
    items: [
      { question: "Quanto faturei esse mês?", icon: "mdi:cash-multiple" },
      { question: "Meu ticket médio", icon: "mdi:receipt-text-outline" },
    ],
  },
  {
    label: "Meus clientes",
    items: [
      { question: "Minha positivação", icon: "mdi:account-check" },
      { question: "Meus clientes em risco", icon: "mdi:account-alert" },
    ],
  },
];

/** Hero suggestions grouped by category. Vendedor sees own-scope phrasings (RF-016). */
export function categorizedSuggestionsForRole(role: RoleName | null): ICopilotSuggestionGroup[] {
  if (role === "Vendedor") return VENDEDOR_GROUPS;
  return GESTOR_GROUPS;
}
