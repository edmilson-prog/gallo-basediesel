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
} as const;
