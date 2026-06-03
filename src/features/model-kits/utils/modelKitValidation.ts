import { z } from "zod";

export const kitItemSchema = z.object({
  partId: z.string().min(1),
  defaultQuantity: z.number().int().min(1, "Quantidade mínima é 1."),
  isOptional: z.boolean(),
  note: z.string().trim().max(140).optional(),
});

export const modelKitFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do kit."),
  category: z.enum(["filtros", "freios", "correia", "revisao", "custom"]),
  items: z.array(kitItemSchema).min(1, "Adicione ao menos uma peça ao kit."),
});

export type ModelKitFormValues = z.infer<typeof modelKitFormSchema>;
