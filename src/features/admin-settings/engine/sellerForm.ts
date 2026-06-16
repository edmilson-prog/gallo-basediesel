import { z } from "zod";
import type { ISeller } from "@/shared/types";

/** Form schema shared by the create and edit flows of SellerFormDialog. */
export const sellerFormSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo (mínimo 3 letras)."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  // RHF sends "" for empty inputs; callers map "" to undefined before persisting.
  phone: z.string().trim().optional(),
  type: z.enum(["internal", "external", "representative"], {
    message: "Selecione o tipo do usuário.",
  }),
  region: z.string().trim().optional(),
  // Short signature prepended to outbound messages; kept short for readability.
  attendantName: z.string().trim().max(40, "Use no máximo 40 caracteres.").optional(),
  // Department assignment (PRD-211); "" / undefined means "Sem departamento".
  departmentId: z.string().optional(),
});

export type SellerFormValues = z.infer<typeof sellerFormSchema>;

/** Region field is shown for field roles: external sellers and representatives. */
export function showRegionField(type: ISeller["type"]): boolean {
  return type !== "internal";
}

export const SELLER_TYPE_OPTIONS: { value: ISeller["type"]; label: string }[] = [
  { value: "internal", label: "Vendedor interno" },
  { value: "external", label: "Vendedor externo" },
  { value: "representative", label: "Representante" },
];
