export const SOUND_SETTINGS_I18N = {
  title: "Sons de notificação",
  description:
    "Escolha o som, o volume e se está ligado para cada aviso sonoro da plataforma. Vale para toda a loja. Suba o volume ou use fones para testar.",
  templateLabel: "Som",
  volumeLabel: "Volume",
  test: "Testar",
  save: "Salvar alterações",
  saving: "Salvando…",
  discard: "Descartar",
  saved: "Configuração salva",
  saveError: "Não foi possível salvar.",
  enabledAria: (event: string) => `Ativar som: ${event}`,

  // Aviso na tela (toast) — só existe para "Mensagem na minha conversa".
  toastTitle: "Aviso na tela",
  toastDescription:
    "Mostra um aviso no canto da tela, com o nome do cliente e a mensagem. Clicar abre a conversa. Funciona junto com o som, mas é independente dele: desligar um não desliga o outro.",
  toastEnabledAria: "Ativar aviso na tela",
  toastPreviewLabel: "Mostrar a mensagem no aviso",
  toastPreviewHint: "Desligado, o aviso mostra apenas o nome do cliente.",
  toastPreviewAria: "Mostrar a mensagem no aviso",
  toastDurationLabel: (seconds: number) =>
    `Tempo na tela: ${seconds} ${seconds === 1 ? "segundo" : "segundos"}`,
  toastDurationAria: "Tempo do aviso na tela",
} as const;
