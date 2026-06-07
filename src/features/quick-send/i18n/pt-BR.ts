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
    manageSnippets: "Gerenciar respostas rápidas",
  },
  stats: {
    topAssets: "Ativos mais enviados",
    perSeller: "Ranking por vendedor",
    period: "Período",
  },
  errors: {
    loadAssetFailed: "Não foi possível carregar a biblioteca.",
    sendFailed: "Falha ao enviar. Tente novamente.",
  },
} as const;
