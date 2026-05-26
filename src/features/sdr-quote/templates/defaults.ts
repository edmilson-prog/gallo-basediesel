import type { ISdrQuoteTemplates } from "@/shared/types";

/**
 * Default text snippets seeded on `IPlatformSettings.sdrQuoteTemplates`
 * (PRD-022 RF-011). Each template is plain text with `{{variavel}}`
 * placeholders rendered by `renderQuoteMessage()` and friends.
 *
 * Available variables:
 *  - `{{cliente_nome}}` — first name of the customer.
 *  - `{{peca_nome}}` / `{{peca_codigo}}` / `{{peca_tipo}}` — part snapshot.
 *  - `{{quantidade}}` / `{{valor_unitario}}` — line snapshot.
 *  - `{{subtotal}}` / `{{desconto}}` / `{{frete_formatado}}` / `{{total}}` — totals.
 *  - `{{validade}}` — DD/MM/YYYY validity date.
 */
export const DEFAULT_SDR_QUOTE_TEMPLATES: ISdrQuoteTemplates = {
  generation: [
    "🧾 *Orçamento GALLO BASE DIESEL*",
    "",
    "▫️ {{peca_nome}}",
    "   Cód. {{peca_codigo}} ({{peca_tipo}})",
    "   Quantidade: {{quantidade}} un",
    "   Valor unitário: R$ {{valor_unitario}}",
    "",
    "💰 *Resumo*",
    "   Subtotal: R$ {{subtotal}}",
    "   Frete: {{frete_formatado}}",
    "   *TOTAL: R$ {{total}}*",
    "",
    "📅 Válido até: {{validade}}",
    "",
    "✅ Para confirmar, responde: *1*",
    "❌ Para recusar: *2*",
    "👤 Para falar com vendedor: *3*",
  ].join("\n"),
  accept: [
    "Perfeito{{cliente_nome_separador}}{{cliente_nome}}! Pedido em andamento. 🎉",
    "",
    "Para finalizar, me ajuda com 2 informações:",
    "1. Você prefere pagar via *PIX* ou *boleto*?",
    "2. Quando você prefere receber?",
  ].join("\n"),
  reject: [
    "Sem problema{{cliente_nome_separador}}{{cliente_nome}}! Posso te mostrar outras opções dessa peça?",
    "Ou foi algum motivo específico que te fez recusar?",
  ].join("\n"),
  escalate: [
    "Beleza{{cliente_nome_separador}}{{cliente_nome}}! Vou te conectar com um vendedor especialista que pode te atender melhor. 🤝",
    "Aguarda só um instante.",
  ].join("\n"),
};
