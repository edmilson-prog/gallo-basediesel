import { z } from "zod";

const currentYear = new Date().getFullYear();

const yearSchema = z
  .number({ invalid_type_error: "Ano inválido." })
  .int()
  .min(1980)
  .max(currentYear + 1)
  .optional();

/**
 * A canonical record is brand + model + engine, so the form carries a list of
 * engines: registering an `FH 460` with three engines creates the three records
 * in one pass instead of making the operator type `FH 460` three times.
 */
export const modelFormSchema = z
  .object({
    brand: z.string().trim().min(1, "A marca é obrigatória."),
    model: z.string().trim().min(1, "O modelo é obrigatório."),
    engines: z.array(z.string()).refine((list) => list.some((engine) => engine.trim() !== ""), {
      message: "Informe ao menos um motor.",
    }),
    yearStart: yearSchema,
    yearEnd: yearSchema,
  })
  .refine((v) => v.yearStart == null || v.yearEnd == null || v.yearStart <= v.yearEnd, {
    message: "O ano final não pode ser antes do inicial.",
    path: ["yearEnd"],
  });

export type ModelFormValues = z.infer<typeof modelFormSchema>;

/**
 * Engines actually filled in, trimmed and de-duplicated case-insensitively.
 * Two rows reading `DC13` and `dc13 ` would otherwise create two records the
 * catalog cannot tell apart.
 */
export function usableEngines(engines: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of engines) {
    const engine = raw.trim();
    if (engine === "") continue;
    const key = engine.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(engine);
  }
  return out;
}

export interface IModelFormSummary {
  /** First blocking problem, in the order the form reads. Null when it can save. */
  error: string | null;
  /** The records the form would create. */
  engines: string[];
  /** What the save bar states once there is nothing to fix. */
  summary: string;
}

/**
 * What the save bar says, derived from the values on screen rather than from
 * submit-time validation — the bar has to explain why saving is blocked before
 * the user reaches for the button.
 */
export function describeModelForm(values: {
  brand: string;
  model: string;
  engines: readonly string[];
  yearStart?: number;
  yearEnd?: number;
}): IModelFormSummary {
  const brand = values.brand.trim();
  const model = values.model.trim();
  const engines = usableEngines(values.engines);

  const error =
    brand === ""
      ? "Selecione a marca."
      : model === ""
        ? "Informe o modelo."
        : engines.length === 0
          ? "Informe ao menos um motor."
          : values.yearStart != null && values.yearEnd != null && values.yearEnd < values.yearStart
            ? "O ano final não pode ser antes do inicial."
            : null;

  const summary =
    engines.length > 1
      ? `${engines.length} modelos de ${brand} ${model}`
      : `${brand} ${model} ${engines[0] ?? ""}`.trim();

  return { error, engines, summary };
}
