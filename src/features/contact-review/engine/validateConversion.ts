import { isValidCpf, isValidCnpj, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import type { ID } from "@/shared/types";
import type { IConvertPendingContactInput } from "@/providers/data";

export interface IConversionFormValues {
  type: "B2C" | "B2B";
  fullName: string;
  cpf: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  contactName: string;
}

export interface IConversionValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof IConversionFormValues, string>>;
}

/** Validate the quick-conversion form. Document is optional; when present it must pass check-digit validation. */
export function validateConversion(values: IConversionFormValues): IConversionValidationResult {
  const errors: IConversionValidationResult["errors"] = {};
  if (values.type === "B2C") {
    if (!values.fullName.trim()) errors.fullName = "Informe o nome completo.";
    if (values.cpf.trim() && !isValidCpf(values.cpf)) errors.cpf = "CPF inválido.";
  } else {
    if (!values.nomeFantasia.trim()) errors.nomeFantasia = "Informe o nome fantasia.";
    if (values.cnpj.trim() && !isValidCnpj(values.cnpj)) errors.cnpj = "CNPJ inválido.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Map validated form values to the provider input (only the chosen type's fields). Normalizes document to digits-only. */
export function toConvertInput(
  customerId: ID,
  values: IConversionFormValues,
  sellerId?: ID | null,
): IConvertPendingContactInput {
  const owner = sellerId === undefined ? {} : { sellerId };
  if (values.type === "B2B") {
    return {
      customerId,
      type: "B2B",
      razaoSocial: values.razaoSocial.trim() || undefined,
      nomeFantasia: values.nomeFantasia.trim(),
      cnpj: values.cnpj.trim() ? onlyDigits(values.cnpj) : undefined,
      contactName: values.contactName.trim() || undefined,
      ...owner,
    };
  }
  return {
    customerId,
    type: "B2C",
    fullName: values.fullName.trim(),
    cpf: values.cpf.trim() ? onlyDigits(values.cpf) : undefined,
    ...owner,
  };
}
