/**
 * PRD-027 — Quick Send & Asset Library i18n bundle (pt-BR).
 *
 * Created by Plan A as the namespace owner. Plans B and C append keys to the
 * existing groups (append-only — never rename or remove). All copy in
 * Brazilian Portuguese with correct accents.
 */
import type { LeadTemperature } from "@/shared/types";

export const QUICK_SEND_STRINGS = {
  picker: {
    title: "Biblioteca de ativos",
    searchPlaceholder: "Buscar catálogo, ficha, tabela...",
    tabRecents: "Recentes",
    tabFavorites: "Favoritos",
    tabAll: "Tudo",
    emptyState: "Nenhum ativo encontrado.",
    modePalette: "Paleta",
    modeGrid: "Grade",
    modeSheet: "Gaveta",
    // chaves novas do Plano B (não enumeradas em CONTRACT §J)
    contextPlaceholder: "Adicionar uma mensagem (opcional)…",
    sendStaged: "Enviar ativo",
    cancelStaged: "Cancelar",
  },
  slash: {
    emptyState: "Nenhum comando ou resposta rápida.",
    literalSlashHint: "Use // para inserir uma barra literal.",
    // chaves novas do Plano B (não enumeradas em CONTRACT §J)
    menuLabel: "Comandos rápidos",
    close: "Fechar",
  },
  snippet: {
    fieldsToFill: (n: number) => `${n} campo${n === 1 ? "" : "s"} a preencher`,
    sendBlockedHint: "Preencha os campos destacados antes de enviar.",
  },
  productCard: {
    sendProduct: "Enviar produto",
    consultPrice: "Consultar valor",
    noImage: "Sem imagem",
    searchPlaceholder: "Buscar peça por nome, OE ou equivalência...",
    stockOk: "Em estoque",
    stockWarning: "Estoque baixo",
    stockCritical: "Sem estoque",
    // dentro do grupo productCard: {...} — chave nova do Plano B (não enumerada em CONTRACT §J)
    cardFooter: "Valores sujeitos a confirmação.",
  },
  combo: {
    packageMode: "Modo pacote",
    tray: "Pacote",
    sendAll: "Enviar todos",
    sending: (i: number, n: number) => `Enviando ${i}/${n}`,
    // itemSkipped is a FUNCTION (Plan C ComboTray/useComboSend call it with a
    // title): keep this shape so consumers compile. Do NOT downgrade to a string.
    itemSkipped: (title: string) => `Ignorado: ${title} (sem permissão ou não publicado)`,
    addToCombo: "Adicionar ao pacote",
    moveUp: "Mover para cima",
    moveDown: "Mover para baixo",
    remove: "Remover do pacote",
    partialDone: (sent: number, skipped: number) =>
      `Pacote enviado: ${sent} item(ns)${skipped > 0 ? `, ${skipped} ignorado(s)` : ""}.`,
    moved: (title: string, pos: number, total: number) =>
      `${title} movido para posição ${pos} de ${total}`,
  },
  schedule: {
    scheduleSend: "Agendar envio",
    presetTodayEvening: "Hoje 18:00",
    presetTomorrowMorning: "Amanhã 09:00",
    presetMonday: "Segunda 08:00",
    custom: "Data e hora",
    scheduledCount: (n: number) => `Agendados (${n})`,
    edit: "Editar",
    cancel: "Cancelar",
    undo: "Desfazer",
    // Plan C additions (Task 2)
    scheduledToast: (when: string) => `Agendado para ${when} ✓ — não precisa clicar em "Enviar".`,
    pastRejected: "Escolha uma data e hora no futuro.",
    cancelled: "Agendamento cancelado.",
    emptyList: "Nenhum envio agendado para esta conversa.",
    listTitle: "Agendados",
    failedBadge: "Falhou",
    pendingBadge: "Pendente",
    sentBadge: "Enviado",
    payloadAsset: "Ativo",
    payloadSnippet: "Resposta rápida",
    payloadCombo: "Pacote",
    payloadProduct: "Produto",
  },
  link: {
    openedAgo: (label: string) => `Aberto há ${label}`,
    openCount: (n: number) => `${n} vez${n === 1 ? "" : "es"}`,
    trackableNote: "Link rastreável",
  },
  temperature: {
    // Re-pinned per CONTRACT §J (2026-06-06): two-arg cause→effect line consumed
    // by Plan C's useTrackableLinkSimulation, plus a toast(label). `label` is the
    // new LeadTemperature word; `what` is the link's UTM campaign or a fallback.
    roseUpTo: (label: LeadTemperature, what: string) => {
      const word = label === "quente" ? "Quente" : label === "morno" ? "Morno" : "Frio";
      const emoji = label === "quente" ? "🔥" : "🌤️";
      return `${emoji} Temperatura subiu para ${word} — cliente abriu ${what}`;
    },
    toast: (label: LeadTemperature) => {
      const word = label === "quente" ? "Quente" : label === "morno" ? "Morno" : "Frio";
      return `Temperatura do lead subiu para ${word}.`;
    },
  },
  library: {
    publish: "Publicar",
    unpublish: "Despublicar",
    version: "Versão",
    permission: "Permissão",
    draft: "Rascunho",
    archived: "Arquivado",
    sensitive: "Sensível",
    noPermission: "Sem permissão",
    manageSnippets: "Respostas rápidas compartilhadas",
    // Plan C Task 16 additions
    manageSnippetsDesc: "Crie e mantenha respostas rápidas visíveis para toda a equipe.",
    edit: "Editar",
    cancel: "Cancelar",
    confirmDelete: "Excluir",
    snippetNewTitle: "Nova resposta rápida",
    snippetEditTitle: "Editar resposta rápida",
    snippetTitlePlaceholder: "Ex.: Política de garantia",
    snippetBodyPlaceholder: "Use {{nome}}, {{peca}}, {{prazo}} para personalizar.",
    snippetVarsHint: "Variáveis: {{nome}}, {{peca}}, {{prazo}}. Lacunas viram pílulas no envio.",
    snippetCreate: "Criar",
    snippetSave: "Salvar",
    snippetCreated: "Resposta rápida criada.",
    snippetSaved: "Resposta rápida atualizada.",
    snippetDeleted: "Resposta rápida excluída.",
    snippetSaveFailed: "Não foi possível salvar.",
    snippetMissingFields: "Preencha atalho, título e conteúdo.",
    sharedSnippetsList: "Respostas compartilhadas",
    snippetsEmpty: "Nenhuma resposta compartilhada ainda.",
    snippetDeleteTitle: "Excluir resposta rápida?",
    snippetDeleteDesc: (title: string) =>
      `A resposta "${title}" deixará de aparecer para a equipe.`,
    // Plan C Task 17 additions
    managerTitle: "Biblioteca de ativos",
    managerDesc: "Publique, versione e defina a sensibilidade de cada ativo da equipe.",
    tabAssets: "Ativos",
    tabSnippets: "Respostas rápidas",
    tabUsage: "Uso",
    searchAssets: "Buscar ativo…",
    assetsEmpty: "Nenhum ativo encontrado.",
    statusPublished: "Publicado",
    actionFailed: "Não foi possível concluir a ação.",
    publishedToast: "Ativo publicado.",
    unpublishedToast: "Ativo despublicado.",
    versionBumpedToast: "Nova versão criada.",
    permissionUpdatedToast: "Permissão atualizada.",
  },
  stats: {
    title: "Estatística de uso da biblioteca",
    subtitle: "Ativos mais enviados e ranking por vendedor no período.",
    topAssets: "Ativos mais enviados",
    perSeller: "Ranking por vendedor",
    period: "Período",
    sendCount: (n: number) => (n === 1 ? "1 envio" : `${n} envios`),
    empty: "Nenhum envio registrado ainda.",
  },
  errors: {
    loadAssetFailed: "Não foi possível carregar a biblioteca.",
    sendFailed: "Falha ao enviar. Tente novamente.",
  },
} as const;
