import type { ID, IMessageTemplate } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type {
  ICreateMessageTemplateInput,
  IListMessageTemplatesParams,
  IMessageTemplatesProvider,
  IUpdateMessageTemplateInput,
} from "../../contracts/messageTemplates";

/**
 * Supabase implementation of {@link IMessageTemplatesProvider} (PRD-116).
 * RLS scopes reads to the caller's store (+ global rows) and restricts writes
 * to staff — the provider stays a thin mapper.
 */

interface IRow {
  id: string;
  store_id: string | null;
  whatsapp_account_id: string | null;
  meta_template_name: string;
  meta_language_code: string;
  meta_category: IMessageTemplate["metaCategory"];
  meta_status: IMessageTemplate["metaStatus"];
  display_name: string;
  description: string | null;
  is_active: boolean;
  body_template: string;
  variable_count: number;
  variable_labels: string[] | null;
  header_type: IMessageTemplate["headerType"] | null;
  header_text_template: string | null;
  buttons: IMessageTemplate["buttons"] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

function rowToTemplate(row: IRow): IMessageTemplate {
  return {
    id: row.id,
    storeId: row.store_id ?? undefined,
    whatsappAccountId: row.whatsapp_account_id ?? undefined,
    metaTemplateName: row.meta_template_name,
    metaLanguageCode: row.meta_language_code,
    metaCategory: row.meta_category,
    metaStatus: row.meta_status,
    displayName: row.display_name,
    description: row.description ?? undefined,
    isActive: row.is_active,
    bodyTemplate: row.body_template,
    variableCount: row.variable_count,
    variableLabels: row.variable_labels ?? [],
    headerType: row.header_type ?? "none",
    headerTextTemplate: row.header_text_template ?? undefined,
    buttons: row.buttons ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

const COLUMNS =
  "id, store_id, whatsapp_account_id, meta_template_name, meta_language_code, meta_category, meta_status, display_name, description, is_active, body_template, variable_count, variable_labels, header_type, header_text_template, buttons, created_by, created_at, updated_at, last_synced_at";

export const supabaseMessageTemplatesProvider: IMessageTemplatesProvider = {
  async list(params?: IListMessageTemplatesParams): Promise<IMessageTemplate[]> {
    let query = getSupabaseClient().from("message_templates").select(COLUMNS).order("display_name");
    if (params?.usableOnly) {
      query = query.eq("is_active", true).eq("meta_status", "approved");
    }
    const { data, error } = await query;
    if (error) throw new Error(`messageTemplates.list: ${error.message}`);
    return ((data ?? []) as IRow[]).map(rowToTemplate);
  },

  async get(id: ID): Promise<IMessageTemplate> {
    const { data, error } = await getSupabaseClient()
      .from("message_templates")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`messageTemplates.get: ${error.message}`);
    if (!data) throw new Error(`Template não encontrado: ${id}`);
    return rowToTemplate(data as IRow);
  },

  async create(input: ICreateMessageTemplateInput): Promise<IMessageTemplate> {
    const { data, error } = await getSupabaseClient()
      .from("message_templates")
      .insert({
        store_id: input.storeId ?? null,
        whatsapp_account_id: input.whatsappAccountId ?? null,
        meta_template_name: input.metaTemplateName,
        meta_language_code: input.metaLanguageCode,
        meta_category: input.metaCategory,
        meta_status: input.metaStatus,
        display_name: input.displayName,
        description: input.description ?? null,
        body_template: input.bodyTemplate,
        variable_count: input.variableLabels.length,
        variable_labels: input.variableLabels,
        header_type: input.headerType ?? "none",
        header_text_template: input.headerTextTemplate ?? null,
        created_by: input.createdBy ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`messageTemplates.create: ${error.message}`);
    return rowToTemplate(data as IRow);
  },

  async update(id: ID, input: IUpdateMessageTemplateInput): Promise<IMessageTemplate> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.description !== undefined) patch.description = input.description;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (input.metaStatus !== undefined) patch.meta_status = input.metaStatus;
    if (input.variableLabels !== undefined) patch.variable_labels = input.variableLabels;
    const { data, error } = await getSupabaseClient()
      .from("message_templates")
      .update(patch)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`messageTemplates.update: ${error.message}`);
    return rowToTemplate(data as IRow);
  },

  async deactivate(id: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("message_templates")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw new Error(`messageTemplates.deactivate: ${error.message}`);
  },
};
