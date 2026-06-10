/**
 * HSM template rendering (PRD-116 RF-010..014).
 *
 * Pure domain logic: substitutes positional variables ({{1}}, {{2}}, …) for
 * the UI preview and builds the Meta `components` payload consumed by
 * `provider.sendTemplate` (PRD-112). Rendering is CRM domain — never the
 * provider's job.
 */

import type { IMessageTemplate } from "@/shared/types";

/** Meta template component (body/header) in the Cloud API send format. */
export interface IMetaTemplateComponent {
  type: "header" | "body";
  parameters: Array<{ type: "text"; text: string }>;
}

export interface IRenderedTemplate {
  /** Body with variables substituted — used by the live preview. */
  text: string;
  /** Meta components payload for sendTemplate. */
  components: IMetaTemplateComponent[];
}

/** Counts distinct positional variables ({{N}}) in a body template (RF-031). */
export function countTemplateVariables(bodyTemplate: string): number {
  const indices = new Set<number>();
  for (const match of bodyTemplate.matchAll(/\{\{(\d+)\}\}/g)) {
    indices.add(Number(match[1]));
  }
  return indices.size;
}

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRenderError";
  }
}

export function renderTemplate(template: IMessageTemplate, variables: string[]): IRenderedTemplate {
  if (variables.length !== template.variableCount) {
    throw new TemplateRenderError(
      `Template ${template.metaTemplateName} requer ${template.variableCount} variáveis, recebeu ${variables.length}`,
    );
  }
  if (variables.some((value) => value.trim().length === 0)) {
    throw new TemplateRenderError("Todas as variáveis devem ser preenchidas");
  }

  let text = template.bodyTemplate;
  variables.forEach((value, i) => {
    text = text.replaceAll(`{{${i + 1}}}`, value);
  });

  const components: IMetaTemplateComponent[] = [];
  if (template.headerType === "text" && template.headerTextTemplate) {
    components.push({
      type: "header",
      parameters: [{ type: "text", text: template.headerTextTemplate }],
    });
  }
  if (variables.length > 0) {
    components.push({
      type: "body",
      parameters: variables.map((value) => ({ type: "text", text: value })),
    });
  }

  return { text, components };
}
