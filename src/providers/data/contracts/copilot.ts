import type { ID, ICopilotPanelData } from "@/shared/types";

/**
 * Contrato do Copiloto de Vendas (PRD-025).
 *
 * Fase 1: `mockCopilotProvider` (regras determinísticas).
 * Fase 2: `AICopilotProvider` (Supabase + LLM) habilita `generateReply` sem
 * alterar a superfície consumidora.
 */
export interface ICopilotProvider {
  /** Compõe briefing + resumo + sugestões para a conversa. */
  getPanelData(conversationId: ID): Promise<ICopilotPanelData>;
  /** Marca uma sugestão como dispensada (Fase 1: no-op + gancho de auditoria). */
  dismissSuggestion(id: ID): Promise<void>;
  // Fase 2: generateReply(conversationId: ID): Promise<string>;
}
