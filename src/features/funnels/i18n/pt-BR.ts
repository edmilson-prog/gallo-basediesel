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
  admin: {
    title: "Funis",
    description: "Os funis pelos quais um lead passa, e quem enxerga cada um.",
    railLabel: "Funis da loja",
    railMobileLabel: "Escolha um funil",
    archivedSection: "Arquivados",
    archivedWarning: (funis: number, leads: number) =>
      `${funis} ${funis === 1 ? "funil arquivado contém" : "funis arquivados contêm"} ${leads} ${leads === 1 ? "lead ativo" : "leads ativos"}.`,
    defaultBadge: "Padrão",
    tabs: { stages: "Etapas", access: "Acesso", general: "Geral" },
    save: "Salvar",
    saveWithoutAccess: "Salvar sem acesso",
    saving: "Salvando…",
    saved: "Funil salvo.",
    saveError: "Não foi possível salvar.",
    discard: "Descartar",
    unsavedTitle: "Descartar as alterações?",
    unsavedBody: "Você editou este funil e ainda não salvou. Trocar de funil descarta o que mudou.",
    unsavedKeepEditing: "Continuar editando",
    unsavedDiscard: "Descartar e trocar",
    emptyTitle: "Só existe o funil de triagem",
    emptyBody: "Crie um funil para separar as linhas de produto que têm ciclo de venda próprio.",
    templates: "Começar por um destes",
    stages: {
      add: "Adicionar etapa",
      reorder: "Reordenar etapa",
      namePlaceholder: "Nome da etapa",
      nameLabel: (n: string) => `Nome da etapa ${n}`,
      kindLabel: (n: string) => `Tipo da etapa ${n}`,
      accentLabel: (n: string) => `Cor da etapa ${n}`,
      kinds: { entrada: "Entrada", aberta: "Aberta", ganho: "Ganho", perda: "Perda" },
      remove: "Excluir etapa",
      leadCount: (n: number) => `${n} ${n === 1 ? "lead" : "leads"}`,
      blocked: {
        terminal: "Etapas de entrada, ganho e perda são obrigatórias e não podem ser excluídas.",
        has_leads: "Esta etapa tem leads. Escolha para onde eles vão.",
        last_open: "O funil precisa de ao menos uma etapa aberta.",
      },
      moveTitle: (n: string) => `Excluir a etapa ${n}?`,
      moveBody: (n: number) =>
        `${n} ${n === 1 ? "lead está" : "leads estão"} nesta etapa. Escolha para onde ${n === 1 ? "ele vai" : "eles vão"}.`,
      moveTarget: "Mover para",
      moveConfirm: "Mover e excluir",
      issues: {
        missing_entrada: "Falta a etapa de entrada.",
        missing_ganho: "Falta a etapa de ganho.",
        missing_perda: "Falta a etapa de perda.",
        too_many_terminals: "Só pode haver uma etapa de entrada, uma de ganho e uma de perda.",
        duplicate_name: "Há etapas com o mesmo nome.",
        empty_name: "Toda etapa precisa de um nome.",
        name_too_long: "O nome da etapa passa de 24 caracteres.",
      },
    },
    access: {
      // Conta vendedores, não "pessoas": o papel de dono/gestor vive no usuário,
      // não no vendedor, então a tela não sabe quem é staff. A linha informativa
      // logo abaixo cobre isso — o número seria mentira se dissesse "pessoas".
      reach: (n: number) =>
        n === 1 ? "1 vendedor enxerga este funil" : `${n} vendedores enxergam este funil`,
      staffNote: "Donos e gestores enxergam todos os funis.",
      openToStore: "Todos da loja",
      openToStoreHint: "Todo vendedor da loja enxerga este funil.",
      empty: "Ninguém enxerga este funil",
      emptyHint: "Sem acesso, o funil não aparece para vendedor nenhum na página de Leads.",
      defaultNote:
        "O funil de triagem é irrestrito por definição: ele recebe todo lead novo e é para onde um lead volta ao sair de outro funil. Restringi-lo trancaria a operação.",
      matrixTrigger: "Visão geral de acesso",
      matrixTitle: "Quem enxerga cada funil",
      matrixHint:
        "Somente leitura — para mudar, abra a aba Acesso do funil. Donos e gestores enxergam todos os funis, independentemente desta tabela.",
      matrixSeller: "Vendedor",
    },
    general: {
      name: "Nome",
      icon: "Ícone",
      accent: "Identidade",
      descriptionField: "Descrição",
      threshold: "Limite de acúmulo na entrada",
      thresholdHint:
        "Acima disso, a etapa de entrada avisa que virou depósito. Padrão: 50.",
      archive: "Arquivar funil",
      archiveTitle: (n: string) => `Arquivar o funil ${n}?`,
      archiveBody:
        "Ele sai do seletor da página de Leads, mas continua em relatórios e auditoria. Os leads ficam onde estão.",
      archiveConfirm: "Arquivar",
      archived: (n: string) => `Funil ${n} arquivado.`,
      archiveError: "Não foi possível arquivar o funil.",
      cannotArchiveDefault: "O funil de triagem não pode ser arquivado.",
    },
  },
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
