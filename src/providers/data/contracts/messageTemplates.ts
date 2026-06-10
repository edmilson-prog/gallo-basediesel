import type { ID, IMessageTemplate } from "@/shared/types";

export interface IListMessageTemplatesParams {
  storeId?: ID;
  /** When true, returns only `isActive && metaStatus === 'approved'` (picker). */
  usableOnly?: boolean;
}

export interface ICreateMessageTemplateInput {
  storeId?: ID;
  whatsappAccountId?: ID;
  metaTemplateName: string;
  metaLanguageCode: string;
  metaCategory: IMessageTemplate["metaCategory"];
  metaStatus: IMessageTemplate["metaStatus"];
  displayName: string;
  description?: string;
  bodyTemplate: string;
  variableLabels: string[];
  headerType?: IMessageTemplate["headerType"];
  headerTextTemplate?: string;
  createdBy?: ID;
}

export interface IUpdateMessageTemplateInput {
  displayName?: string;
  description?: string;
  isActive?: boolean;
  metaStatus?: IMessageTemplate["metaStatus"];
  variableLabels?: string[];
}

/**
 * Contract for the HSM template catalog (PRD-116).
 *
 * Reading is store-scoped (RLS in supabase); writes are staff-only.
 * `meta*` fields and `bodyTemplate` are immutable after creation — changing
 * them means a NEW template approved in the Business Manager.
 *
 * @see ../../../../docs/dev/whatsapp-templates.md
 */
export interface IMessageTemplatesProvider {
  list(params?: IListMessageTemplatesParams): Promise<IMessageTemplate[]>;
  get(id: ID): Promise<IMessageTemplate>;
  create(input: ICreateMessageTemplateInput): Promise<IMessageTemplate>;
  update(id: ID, input: IUpdateMessageTemplateInput): Promise<IMessageTemplate>;
  /** Soft delete: `isActive = false` — disappears from the picker. */
  deactivate(id: ID): Promise<void>;
}
