import type { SdrTemplateTrigger } from "@/shared/types";

export interface ISdrTemplateGroup {
  id: string;
  label: string;
  description: string;
  icon: string;
  /** Triggers handled inside the SDR core templates (PRD-020). */
  triggers: SdrTemplateTrigger[];
}

/**
 * Logical grouping of all SDR templates surfaced on the painel (Aba 4). PRD-024
 * RF-022. The actual extended set (PRD-021/022/023 templates) is composed at the
 * page level since those live on dedicated settings fields, not on
 * `IPlatformSettings.sdrTemplates`.
 */
export const SDR_TEMPLATE_GROUPS: ISdrTemplateGroup[] = [
  {
    id: "greeting",
    label: "Saudação",
    description: "Primeira mensagem e coleta de identificação básica.",
    icon: "mdi:hand-wave",
    triggers: ["saudacao", "identificacao_nome", "identificacao_empresa"],
  },
  {
    id: "qualification",
    label: "Qualificação",
    description: "Captura a necessidade do cliente.",
    icon: "mdi:account-question-outline",
    triggers: ["pergunta_necessidade"],
  },
  {
    id: "faq",
    label: "FAQ",
    description: "Respostas rápidas para perguntas frequentes.",
    icon: "mdi:help-circle-outline",
    triggers: ["faq_horario", "faq_entrega"],
  },
  {
    id: "handoff-core",
    label: "Despedida e escalação",
    description: "Encerramento e transição para vendedor humano.",
    icon: "mdi:account-arrow-right-outline",
    triggers: ["escalacao_humano", "despedida"],
  },
];

export const SDR_TEMPLATE_VARIABLES_REGISTRY: Record<string, string> = {
  nome: "Primeiro nome do cliente (quando capturado).",
  empresa: "Empresa do cliente (B2B) — vazio quando ausente.",
  saudacao_nome: "Vírgula + nome, ou string vazia quando nome ainda não foi capturado.",
  resumo_curto: "Resumo em bullets do contexto coletado (peça, veículo, orçamento).",
  cliente_nome: "Nome do cliente para mensagens de orçamento.",
  cliente_nome_separador: "Vírgula automática inserida antes do nome.",
  peca_nome: "Nome da peça identificada.",
  peca_codigo: "Código OEM da peça.",
  peca_tipo: "Tipo (original / equivalente).",
  quantidade: "Quantidade solicitada.",
  valor_unitario: "Valor unitário (BRL).",
  subtotal: "Subtotal antes do frete e descontos.",
  desconto: "Desconto aplicado (BRL).",
  frete_formatado: "Frete formatado (valor ou 'a combinar').",
  total: "Total final do orçamento.",
  validade: "Data de validade (DD/MM/AAAA).",
};
