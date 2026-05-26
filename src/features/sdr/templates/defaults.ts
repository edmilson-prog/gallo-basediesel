import type { ISdrTemplate } from "@/shared/types";

/**
 * Default SDR message templates seeded into `IPlatformSettings.sdrTemplates`.
 * Owners can edit these from `/app/configuracoes/sdr/templates` (PRD-020 RF-012).
 * Each template owns a stable id so edits don't drop existing references.
 */
export const DEFAULT_SDR_TEMPLATES: ISdrTemplate[] = [
  {
    id: "sdr-tpl-saudacao",
    trigger: "saudacao",
    text: "Olá! 👋 Sou o assistente da GALLO BASE DIESEL. Atendemos 24/7 para te ajudar com peças e serviços para diesel pesado. Como posso te ajudar?",
    variables: [],
  },
  {
    id: "sdr-tpl-identificacao-nome",
    trigger: "identificacao_nome",
    text: "Pra começar, qual seu nome?",
    variables: [],
  },
  {
    id: "sdr-tpl-identificacao-empresa",
    trigger: "identificacao_empresa",
    text: "Prazer, {{nome}}! Você é cliente PJ ou pessoa física? Se PJ, qual a empresa?",
    variables: ["nome"],
  },
  {
    id: "sdr-tpl-pergunta-necessidade",
    trigger: "pergunta_necessidade",
    text: "Me conta o que você precisa hoje, {{nome}}. Qual peça ou serviço?",
    variables: ["nome"],
  },
  {
    id: "sdr-tpl-faq-horario",
    trigger: "faq_horario",
    text: "Nosso horário comercial é de segunda a sexta, 8h às 18h. Mas o atendimento aqui no WhatsApp é 24/7! 🚀",
    variables: [],
  },
  {
    id: "sdr-tpl-faq-entrega",
    trigger: "faq_entrega",
    text: "Atendemos toda a região Sul com entrega expressa em Frederico Westphalen e municípios próximos. Para outras localidades, me passa seu CEP que verifico prazo e frete.",
    variables: [],
  },
  {
    id: "sdr-tpl-escalacao-humano",
    trigger: "escalacao_humano",
    text: "Beleza, {{nome}}! Vou te conectar com um dos nossos vendedores especialistas. Aguarda só um instante.",
    variables: ["nome"],
  },
  {
    id: "sdr-tpl-despedida",
    trigger: "despedida",
    text: "Foi um prazer, {{nome}}! Qualquer coisa, é só mandar mensagem aqui. GALLO BASE DIESEL — sua peça pesada de confiança. 💪",
    variables: ["nome"],
  },
];

/** Last-resort message used when the configured template list is empty. */
export const FALLBACK_SDR_MESSAGE = "Olá! Como posso ajudar?";
