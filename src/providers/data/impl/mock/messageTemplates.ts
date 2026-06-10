import type { ID, IMessageTemplate } from "@/shared/types";
import type {
  ICreateMessageTemplateInput,
  IListMessageTemplatesParams,
  IMessageTemplatesProvider,
  IUpdateMessageTemplateInput,
} from "../../contracts/messageTemplates";

/**
 * Mock implementation of {@link IMessageTemplatesProvider} (PRD-116).
 *
 * Self-contained in-memory catalog (same rationale as systemHealth): the HSM
 * catalog has no Fase-1 domain entity behind it — it mirrors Meta Business
 * Manager approvals, which only exist in Fase 2. Seeded with the three
 * examples from the PRD so the picker/config screens are demoable.
 */

/** Matriz sentinel store id — same fixed uuid used across mock and DB seeds. */
const SEED_STORE_ID = "00000000-0000-0000-0000-000000000001";

const MOCK_LATENCY_MS = 120;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

function seedTemplate(
  partial: Pick<
    IMessageTemplate,
    "id" | "metaTemplateName" | "displayName" | "description" | "bodyTemplate" | "variableLabels"
  > &
    Partial<IMessageTemplate>,
): IMessageTemplate {
  return {
    storeId: SEED_STORE_ID,
    metaLanguageCode: "pt_BR",
    metaCategory: "utility",
    metaStatus: "approved",
    isActive: true,
    variableCount: partial.variableLabels.length,
    headerType: "none",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    ...partial,
  };
}

const templates: IMessageTemplate[] = [
  seedTemplate({
    id: "tpl-boas-vindas",
    metaTemplateName: "boas_vindas_v1",
    displayName: "Boas-vindas",
    description: "Primeiro contato após interesse em peça",
    bodyTemplate:
      "Olá {{1}}! Recebemos seu interesse na peça {{2}}. Um vendedor entrará em contato em breve.",
    variableLabels: ["Nome do cliente", "Peça de interesse"],
  }),
  seedTemplate({
    id: "tpl-pedido-pronto",
    metaTemplateName: "aviso_pedido_pronto",
    displayName: "Pedido pronto para retirada",
    description: "Aviso de pedido disponível na loja",
    bodyTemplate: "Pedido #{{1}} pronto para retirada na loja {{2}}. Endereço: {{3}}",
    variableLabels: ["Número do pedido", "Nome da loja", "Endereço"],
  }),
  seedTemplate({
    id: "tpl-cobranca",
    metaTemplateName: "cobranca_amigavel",
    displayName: "Cobrança amigável",
    description: "Lembrete de vencimento de pedido",
    bodyTemplate: "Olá {{1}}, seu pedido #{{2}} no valor de R$ {{3}} vence em {{4}}.",
    variableLabels: ["Nome do cliente", "Número do pedido", "Valor", "Data de vencimento"],
  }),
];

export const mockMessageTemplatesProvider: IMessageTemplatesProvider = {
  async list(params?: IListMessageTemplatesParams): Promise<IMessageTemplate[]> {
    await delay();
    return templates.filter((template) => {
      if (params?.storeId && template.storeId && template.storeId !== params.storeId) {
        return false;
      }
      if (params?.usableOnly && !(template.isActive && template.metaStatus === "approved")) {
        return false;
      }
      return true;
    });
  },

  async get(id: ID): Promise<IMessageTemplate> {
    await delay();
    const found = templates.find((template) => template.id === id);
    if (!found) throw new Error(`Template não encontrado: ${id}`);
    return found;
  },

  async create(input: ICreateMessageTemplateInput): Promise<IMessageTemplate> {
    await delay();
    const now = new Date().toISOString();
    const template: IMessageTemplate = {
      id: `tpl-${crypto.randomUUID()}`,
      storeId: input.storeId,
      whatsappAccountId: input.whatsappAccountId,
      metaTemplateName: input.metaTemplateName,
      metaLanguageCode: input.metaLanguageCode,
      metaCategory: input.metaCategory,
      metaStatus: input.metaStatus,
      displayName: input.displayName,
      description: input.description,
      isActive: true,
      bodyTemplate: input.bodyTemplate,
      variableCount: input.variableLabels.length,
      variableLabels: input.variableLabels,
      headerType: input.headerType ?? "none",
      headerTextTemplate: input.headerTextTemplate,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    templates.push(template);
    return template;
  },

  async update(id: ID, input: IUpdateMessageTemplateInput): Promise<IMessageTemplate> {
    await delay();
    const found = templates.find((template) => template.id === id);
    if (!found) throw new Error(`Template não encontrado: ${id}`);
    if (input.displayName !== undefined) found.displayName = input.displayName;
    if (input.description !== undefined) found.description = input.description;
    if (input.isActive !== undefined) found.isActive = input.isActive;
    if (input.metaStatus !== undefined) found.metaStatus = input.metaStatus;
    if (input.variableLabels !== undefined) found.variableLabels = input.variableLabels;
    found.updatedAt = new Date().toISOString();
    return found;
  },

  async deactivate(id: ID): Promise<void> {
    await this.update(id, { isActive: false });
  },
};
