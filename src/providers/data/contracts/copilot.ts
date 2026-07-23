import type { ID, ICopilotPanelData } from "@/shared/types";

/** Options resolved by the caller from the store's assistant settings. Passing
 *  them keeps the provider free of settings I/O. */
export interface ICopilotPanelOptions {
  /** How many recent messages to read. Falls back to the provider's own floor. */
  messageWindow?: number;
}

/**
 * Contrato do Copiloto de Vendas (PRD-025).
 *
 * Fase 1: `mockCopilotProvider` (regras determinísticas).
 * Fase 2: `AICopilotProvider` (Supabase + LLM) habilita `generateReply` sem
 * alterar a superfície consumidora.
 */
export interface ICopilotProvider {
  /** Compõe briefing + resumo + sugestões para a conversa. */
  getPanelData(conversationId: ID, options?: ICopilotPanelOptions): Promise<ICopilotPanelData>;
  /** Marca uma sugestão como dispensada (Fase 1: no-op + gancho de auditoria). */
  dismissSuggestion(id: ID): Promise<void>;
  /**
   * Gera um rascunho de resposta com IA a partir do contexto da conversa
   * (sob demanda). Lança em erro de geração — o consumidor degrada na UI.
   */
  generateReply(conversationId: ID): Promise<string>;
  /** Se a geração de resposta com IA está habilitada (gating do botão). */
  isReplyGenerationEnabled(): Promise<boolean>;
}
