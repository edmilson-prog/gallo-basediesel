import { z } from "zod";

const currentYear = new Date().getFullYear();

export const modelFormSchema = z
  .object({
    brand: z.string().trim().min(1, "A marca é obrigatória."),
    model: z.string().trim().min(1, "O modelo é obrigatório."),
    engine: z.string().trim().min(1, "O motor é obrigatório."),
    yearStart: z
      .number({ invalid_type_error: "Ano inválido." })
      .int()
      .min(1980)
      .max(currentYear + 1)
      .optional(),
    yearEnd: z
      .number({ invalid_type_error: "Ano inválido." })
      .int()
      .min(1980)
      .max(currentYear + 1)
      .optional(),
  })
  .refine((v) => v.yearStart == null || v.yearEnd == null || v.yearStart <= v.yearEnd, {
    message: "Ano inicial não pode ser maior que o final.",
    path: ["yearStart"],
  });

export type ModelFormValues = z.infer<typeof modelFormSchema>;
