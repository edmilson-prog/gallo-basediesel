// src/features/tour/i18n/pt-BR.ts
// UI chrome strings for the guided tour (pt-BR). Tour step content lives in
// config/tours.ts; this file holds buttons, the settings hub and a11y labels.

export const TOUR_STRINGS = {
  back: "Voltar",
  skip: "Pular",
  next: "Próximo",
  finish: "Concluir",
  gotIt: "Entendi",
  stepProgress: (current: number, total: number) => `${current} de ${total}`,
  helpButtonLabel: "Rever o tour desta tela",
  dialogLabel: "Tour guiado",
  nav: "Tours & Ajuda",
  settings: {
    title: "Tours & Ajuda",
    subtitle:
      "Reveja os tours guiados de cada tela ou desligue os avisos automáticos. As preferências ficam salvas neste navegador.",
    optOutLabel: "Tours automáticos",
    optOutOn: "Ligados — aparecem na primeira visita de cada tela",
    optOutOff: "Desligados — você ainda pode rever pelo ícone ?",
    enable: "Ligar",
    disable: "Desligar",
    resetTitle: "Resetar todos os tours",
    resetHint: "Faz todos os tours aparecerem de novo na próxima visita.",
    reset: "Resetar",
    listTitle: "Tours disponíveis",
    seen: "Visto",
    notSeen: "Novo",
    replay: "Rever",
  },
} as const;
