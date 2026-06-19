import { z } from "zod";
import type { Division } from "@/shared/types";

/** Store types creatable from the UI (matriz is seed-only). */
export const STORE_TYPE_OPTIONS = [
  { value: "filial", label: "Filial" },
  { value: "parceira", label: "Parceira" },
] as const;

/** Commercial divisions (service/industrial dormant on the MVP). */
export const DIVISION_OPTIONS: { value: Division; label: string }[] = [
  { value: "parts", label: "Peças" },
  { value: "service", label: "Serviço" },
  { value: "industrial", label: "Industrial" },
];

// 14 digits, with or without the usual CNPJ mask.
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

export const storeFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja"),
  type: z.enum(["filial", "parceira"]),
  cnpj: z.string().trim().regex(CNPJ_REGEX, "CNPJ inválido"),
  address: z.string().trim().min(3, "Informe o endereço"),
  managerId: z.string().optional(),
  activeDivisions: z
    .array(z.enum(["parts", "service", "industrial"]))
    .min(1, "Selecione ao menos uma divisão"),
});

export type StoreFormValues = z.infer<typeof storeFormSchema>;
