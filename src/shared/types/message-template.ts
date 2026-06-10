import type { ID, ISO8601 } from "./common";

/** Meta HSM template category (Business Manager taxonomy). */
export type MessageTemplateCategory = "utility" | "marketing" | "authentication";

/** Approval state as last seen in the Meta Business Manager (manual sync, MVP). */
export type MessageTemplateMetaStatus = "approved" | "pending" | "rejected" | "paused" | "unknown";

export type MessageTemplateHeaderType = "none" | "text" | "image" | "document" | "video";

/** One button of an HSM template (schema covers it; MVP UX uses quick_reply). */
export interface IMessageTemplateButton {
  type: "quick_reply" | "url" | "call";
  text: string;
  url?: string;
  phone?: string;
}

/**
 * HSM template (PRD-116) — local mirror of a template approved in the Meta
 * Business Manager. `bodyTemplate` carries positional variables `{{1}}`,
 * `{{2}}`, … rendered at send time.
 *
 * @see ../../features/templates/engine/render.ts
 */
export interface IMessageTemplate {
  id: ID;
  /** Store scope; undefined = global (visible to every store). */
  storeId?: ID;
  /** Account where the template was approved. */
  whatsappAccountId?: ID;

  metaTemplateName: string;
  metaLanguageCode: string;
  metaCategory: MessageTemplateCategory;
  metaStatus: MessageTemplateMetaStatus;

  displayName: string;
  description?: string;
  isActive: boolean;

  bodyTemplate: string;
  variableCount: number;
  /** UI labels per positional variable (index 0 = {{1}}). */
  variableLabels: string[];
  headerType?: MessageTemplateHeaderType;
  headerTextTemplate?: string;
  buttons?: IMessageTemplateButton[];

  createdBy?: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  lastSyncedAt?: ISO8601;
}
