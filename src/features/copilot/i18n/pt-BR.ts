export const COPILOT_STRINGS = {
  title: "Copiloto",
  privacy: "só você vê",
  privacyAria: "Orientação privada — visível apenas para você",
  regionAria: "Copiloto — orientação privada ao vendedor",
  summaryLabel: "Resumo da conversa",
  suggestionsLabel: "Sugestões do Copiloto",
  empty: "Sem alertas no momento",
  loading: "Analisando a conversa…",
  replyLabel: "Resposta",
  replyInsert: "Inserir",
  generateReply: "Gerar resposta",
  generateReplySoon: "Em breve · IA Fase 2",
  dismiss: "Dispensar sugestão",
  moreCount: (n: number) => `+${n} ${n === 1 ? "sugestão" : "sugestões"}`,
  toneLabels: { alert: "Alerta", action: "Ação", opportunity: "Oportunidade" },
  expand: "Expandir o Copiloto",
  collapse: "Recolher o Copiloto",
  settings: {
    title: "Copiloto",
    description:
      "Escolha onde o Copiloto aparece na tela de atendimento. A preferência fica salva neste navegador e vale só para você.",
    placementLabel: "Posição na tela",
    saved: "Posição do Copiloto atualizada",
    placements: {
      strip: {
        label: "Faixa sobre o campo de digitação",
        description:
          "Faixa compacta logo acima da resposta. Fica recolhida no estado normal e expande sozinha quando há um alerta importante. Recomendada.",
      },
      card: {
        label: "Card no topo da conversa",
        description:
          "Card colapsável acima das mensagens. Máxima visibilidade, mas ocupa espaço vertical fixo no chat.",
      },
      tab: {
        label: "Aba na Ficha do cliente",
        description:
          "Aba dedicada “Copiloto” dentro da Ficha. Não disputa espaço com o chat, porém exige um clique para consultar.",
      },
    },
  },
} as const;
