export const ATTENDANCE_HISTORY_STRINGS = {
  panelTitle: "Histórico de atendimento",
  panelDescription:
    "Linha do tempo de status e atribuições de todos os atendimentos deste cliente.",
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
} as const;
