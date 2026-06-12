import { z } from "zod";
import type { ISeller } from "@/shared/types";

/** Form schema shared by the create and edit flows of SellerFormDialog. */
export const sellerFormSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo (mínimo 3 letras)."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  phone: z.string().trim().optional().or(z.literal("")),
  type: z.enum(["internal", "external", "representative"], {
    message: "Selecione o tipo do usuário.",
  }),
  region: z.string().trim().optional().or(z.literal("")),
});

export type SellerFormValues = z.infer<typeof sellerFormSchema>;

/** Region only applies to field roles (PRD model: reserved for external). */
export function showRegionField(type: ISeller["type"]): boolean {
  return type !== "internal";
}

export const SELLER_TYPE_OPTIONS: { value: ISeller["type"]; label: string }[] = [
  { value: "internal", label: "Vendedor interno" },
  { value: "external", label: "Vendedor externo" },
  { value: "representative", label: "Representante" },
];
