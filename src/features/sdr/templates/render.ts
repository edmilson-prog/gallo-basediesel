import type { ISdrTemplate, SdrTemplateTrigger } from "@/shared/types";
import { FALLBACK_SDR_MESSAGE } from "./defaults";

/** Variables fed into `renderTemplate()`. Missing keys fall back to `'amigo'`. */
export type SdrTemplateVariables = Record<string, string | undefined>;

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const DEFAULT_FALLBACK = "amigo";

/**
 * Substitute every `{{var}}` placeholder in a template body. Missing variables
 * are replaced by `fallback` (default `'amigo'`) so we never emit half-rendered
 * strings like "Olá {{nome}}".
 */
export function renderTemplate(
  template: ISdrTemplate,
  variables: SdrTemplateVariables,
  fallback: string = DEFAULT_FALLBACK,
): { text: string; variablesUsed: Record<string, string> } {
  const used: Record<string, string> = {};
  const text = template.text.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = variables[key];
    const resolved = value && value.trim().length > 0 ? value : fallback;
    used[key] = resolved;
    return resolved;
  });
  return { text, variablesUsed: used };
}

/** Pick a template by trigger; returns `undefined` if none exists. */
export function findTemplate(
  templates: readonly ISdrTemplate[],
  trigger: SdrTemplateTrigger,
): ISdrTemplate | undefined {
  return templates.find((t) => t.trigger === trigger);
}

/**
 * Render a template by trigger with a safe fallback. When the template is
 * missing entirely we emit `FALLBACK_SDR_MESSAGE` so the engine never returns
 * an empty message. Callers receive the trigger that actually fired.
 */
export function renderByTrigger(
  templates: readonly ISdrTemplate[],
  trigger: SdrTemplateTrigger,
  variables: SdrTemplateVariables,
): {
  text: string;
  trigger: SdrTemplateTrigger | "fallback";
  variablesUsed: Record<string, string>;
} {
  const template = findTemplate(templates, trigger);
  if (!template) {
    return { text: FALLBACK_SDR_MESSAGE, trigger: "fallback", variablesUsed: {} };
  }
  const rendered = renderTemplate(template, variables);
  return { text: rendered.text, trigger, variablesUsed: rendered.variablesUsed };
}
