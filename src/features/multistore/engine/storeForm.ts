import { z } from "zod";
import type { Division } from "@/shared/types";
import { isValidCnpj } from "@/features/customers/utils/cnpjCpf";

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

export const storeFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja"),
  type: z.enum(["filial", "parceira"]),
  // Real check-digit validation (reuses the shared validator used on customers)
  // — accepts masked or unmasked input, rejects shape-only typos.
  cnpj: z.string().trim().refine(isValidCnpj, "CNPJ inválido"),
  address: z.string().trim().min(3, "Informe o endereço"),
  managerId: z.string().optional(),
  activeDivisions: z
    .array(z.enum(["parts", "service", "industrial"]))
    .min(1, "Selecione ao menos uma divisão"),
});

export type StoreFormValues = z.infer<typeof storeFormSchema>;
