export const ATTENDANCE_HISTORY_STRINGS = {
  loading: "Carregando histórico…",
  error: "Não foi possível carregar o histórico.",
  empty: "Nenhum atendimento registrado ainda.",
  system: "Sistema",
  unknownActor: "Atendente",
  eventCreated: "Conversa criada",
  eventAssignment: "Atribuição alterada",
  eventReopen: "Reaberta",
  assumedFromQueue: "assumiu da fila",
  transferredFrom: (name: string) => `transferida de ${name}`,
  returnedToQueue: "devolvida à fila",
  participantAdded: (name: string) => `adicionou ${name} como colaborador`,
  participantRemoved: (name: string) => `removeu ${name} da conversa`,
  participantLeft: "saiu da conversa",
  reopenTag: "↻ reabriu no contato",
  summaryWithOwner: (n: number, duration: string, owner: string) =>
    `${n} evento${n === 1 ? "" : "s"} · ${duration} · com ${owner}`,
  summaryClosedNoOwner: (n: number, duration: string) =>
    `${n} evento${n === 1 ? "" : "s"} · ${duration} · encerrada · sem dono`,
  summaryNoOwner: (n: number, duration: string) =>
    `${n} evento${n === 1 ? "" : "s"} · ${duration} · sem atendente`,
  filters: {
    all: "Tudo",
    conversation: "Conversas",
    note: "Notas",
    history: "Histórico",
  },
  emptyFilter: "Nada registrado neste filtro.",
  preRegistroWarning: "Anterior ao registro — só a abertura",
  messageCount: (n: number) => `${n} ${n === 1 ? "mensagem" : "mensagens"}`,
  cardSummary: (n: number, duration: string) =>
    `${n} ${n === 1 ? "evento" : "eventos"} · ${duration}`,
  dealLabel: (total: number) =>
    `Negócio no valor de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}`,
} as const;
