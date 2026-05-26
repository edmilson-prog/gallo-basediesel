export interface IHsmTemplate {
  id: string;
  name: string;
  category: "atendimento" | "vendas" | "pós-venda";
  body: string;
  variables: string[];
  quickReplies?: string[];
}

/**
 * Static catalog of mock HSM templates. In Fase 2 this becomes a Supabase
 * query against the templates approved on the customer's Meta account.
 */
export const HSM_TEMPLATES: IHsmTemplate[] = [
  {
    id: "tpl-followup-orcamento",
    name: "Follow-up de orçamento",
    category: "vendas",
    body: "Olá {{nome}}! Tudo bem? Passando para saber se conseguiu avaliar o orçamento da peça {{produto}}. Posso te ajudar com alguma dúvida?",
    variables: ["nome", "produto"],
    quickReplies: ["Sim, fechar", "Tenho dúvidas", "Não tenho interesse"],
  },
  {
    id: "tpl-cobranca-gentil",
    name: "Cobrança gentil",
    category: "pós-venda",
    body: "Oi {{nome}}, conforme combinado, o pagamento da NF {{numero_nf}} vence em {{data_vencimento}}. Posso te enviar o boleto novamente?",
    variables: ["nome", "numero_nf", "data_vencimento"],
    quickReplies: ["Reenviar boleto", "Já paguei"],
  },
  {
    id: "tpl-confirmacao-entrega",
    name: "Confirmação de entrega",
    category: "pós-venda",
    body: "Olá {{nome}}, sua peça {{produto}} foi entregue com sucesso? Qualquer coisa estou à disposição.",
    variables: ["nome", "produto"],
    quickReplies: ["Recebi tudo certo", "Tive um problema"],
  },
  {
    id: "tpl-novo-contato",
    name: "Saudação inicial",
    category: "atendimento",
    body: "Bom dia! Aqui é a GALLO Base Diesel, especialista em peças para linha pesada. Como posso te ajudar hoje?",
    variables: [],
  },
];

/** Substitute `{{var}}` placeholders by the values provided. */
export function renderTemplate(template: IHsmTemplate, values: Record<string, string>): string {
  return template.body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

/** True only when every variable has a non-empty value. */
export function templateReady(template: IHsmTemplate, values: Record<string, string>): boolean {
  return template.variables.every((v) => Boolean(values[v]?.trim()));
}
