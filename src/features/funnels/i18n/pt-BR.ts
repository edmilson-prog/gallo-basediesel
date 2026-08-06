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
  fiche: {
    title: "Funis",
    add: "Adicionar a um funil",
    addEmpty: "Este lead já está em todos os funis que você acessa.",
    empty: "Este lead não está em nenhum funil.",
    emptyAction: "Adicionar a um funil",
    locked: (n: number) =>
      n === 1 ? "+1 funil que você não acessa" : `+${n} funis que você não acessa`,
    lockedHint: "Você não tem acesso a esse funil, então ele não aparece pelo nome.",
    seeAll: (n: number) => `Ver todas (+${n})`,
    seeLess: "Ver menos",
    noStagePermission: "Você não pode mover este lead de etapa.",
    wonBadge: "Ganho",
    lostBadge: "Perdido",
    stageLabel: (funil: string) => `Etapa no funil ${funil}`,
    rowMenu: (funil: string) => `Ações da participação em ${funil}`,
    moved: (funil: string, etapa: string) => `${funil}: movido para ${etapa}.`,
    moveError: "Não foi possível mudar a etapa.",
    undo: "Desfazer",
    undone: "Etapa restaurada.",
    added: (funil: string) => `Lead adicionado ao funil ${funil}.`,
    addError: "Não foi possível adicionar o lead ao funil.",
    remove: "Tirar deste funil",
    removeTitle: (funil: string) => `Tirar o lead do funil ${funil}?`,
    removeBody:
      "A etapa, o valor estimado e o histórico dessa participação são perdidos. As outras não mudam.",
    removeBodyLast:
      "Esta é a única participação do lead. Ele volta para o funil de triagem, e não fica sem nenhum.",
    removeCancel: "Cancelar",
    removeConfirm: "Tirar do funil",
    removed: (funil: string) => `Lead tirado do funil ${funil}.`,
    removedToDefault: (funil: string) =>
      `Lead tirado do funil ${funil} e devolvido para a triagem.`,
    removeError: "Não foi possível tirar o lead do funil.",
  },
  otherFunnels: {
    ariaLabel: (n: number) =>
      n === 1 ? "Também está em outro funil" : `Também está em ${n} outros funis`,
    goTo: (nome: string) => `Abrir este lead no funil ${nome}`,
  },
  noPermissionToCreate: "Apenas donos e gestores criam funis.",
  nnHint: "Um lead pode estar em vários funis, com etapa própria em cada um.",

  emptyTitle: "Nenhum funil disponível",
  emptyBody: "Você ainda não tem acesso a nenhum funil desta loja.",

  newFunnel: {
    trigger: "Novo funil",
    title: "Novo funil",
    subtitle: "Começa com as etapas Novo, Em andamento, Ganho e Perdido — dá para ajustar depois.",
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
