/**
 * Microcopy for the multi-funnel feature (spec 2026-07-23, §10).
 *
 * Vocabulary follows the Brazilian market (RD Station, Kommo): funil, etapa,
 * motivo de perda. Every string carrying a count has a singular and a plural.
 */
export const COPY = {
  switcherTrigger: (nome: string) => `Trocar de funil. Funil atual: ${nome}`,
  searchPlaceholder: "Buscar funil…",
  searchEmpty: "Nenhum funil encontrado.",
  allFunnels: "Todos os funis",
  allFunnelsNotice: "Cada funil tem etapas próprias, então a visão de todos abre em lista.",
  manage: "Gerenciar funis",
  sectionLabel: "Funis",

  layoutMenu: "Exibição dos funis",
  layoutOptions: {
    rail: "Barra lateral",
    header: "Seletor no cabeçalho",
    tabs: "Abas",
  },
  layoutSettingsTitle: "Exibição dos funis",
  layoutSettingsDescription: "Como você troca de funil na página de Leads.",

  count: (n: number) => (n === 1 ? "1 lead" : `${n.toLocaleString("pt-BR")} leads`),
  countWithOverdue: (n: number, m: number) =>
    `${n === 1 ? "1 lead" : `${n.toLocaleString("pt-BR")} leads`} · ${m} ${
      m === 1 ? "atrasado" : "atrasados"
    }`,

  defaultFunnelHint: "Todo lead novo entra aqui até ser direcionado.",
  invalidLink: (nome: string) => `Você não tem acesso ao funil desse link. Abrimos o ${nome}.`,
  noPermissionToCreate: "Apenas donos e gestores criam funis.",
  nnHint: "Um lead pode estar em vários funis, com etapa própria em cada um.",

  emptyTitle: "Nenhum funil disponível",
  emptyBody: "Você ainda não tem acesso a nenhum funil desta loja.",

  newFunnel: {
    trigger: "Novo funil",
    title: "Novo funil",
    name: "Nome",
    namePlaceholder: "Catalisador",
    icon: "Ícone",
    accent: "Identidade",
    description: "Descrição",
    descriptionPlaceholder: "Opcional — para que serve este funil.",
    cancel: "Cancelar",
    submit: "Criar funil",
    created: (nome: string) => `Funil ${nome} criado.`,
    nameRequired: "Dê um nome ao funil.",
    nameTaken: "Já existe um funil com esse nome.",
    failed: "Não foi possível criar o funil.",
  },

  /** Stage names a new funnel is born with — the DB rejects an incomplete one. */
  starterStages: {
    entrada: "Novo",
    aberta: "Em andamento",
    ganho: "Ganho",
    perda: "Perdido",
  },
} as const;
