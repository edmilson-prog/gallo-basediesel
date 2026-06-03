import { z } from "zod";

export const kitItemSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().min(1, "Quantidade mínima é 1."),
});

export const kitFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do kit."),
  description: z.string().trim().optional(),
  vehicleBrand: z.string().trim().optional(),
  vehicleModel: z.string().trim().optional(),
  category: z.string().trim().optional(),
  items: z.array(kitItemSchema).min(1, "Adicione ao menos uma peça."),
});

export type KitFormValues = z.infer<typeof kitFormSchema>;
