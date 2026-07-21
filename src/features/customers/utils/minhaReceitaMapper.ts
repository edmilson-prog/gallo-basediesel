/**
 * Pure mapping from the Minha Receita (minhareceita.org) raw JSON response
 * into the app's ICnpjCompany shape. Kept separate from useMinhaReceita.ts
 * so the parsing rules are testable without mocking fetch.
 */

export interface ICnpjCompanyAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface ICnpjCompany {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  /** e.g. "ATIVA" | "BAIXADA" | "SUSPENSA" | "INAPTA" | "NULA". */
  situacaoCadastral?: string;
  address?: ICnpjCompanyAddress;
}

export interface IMinhaReceitaRawResponse {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

/** "20031170" -> "20031-170". Returns the input unchanged if it isn't 8 digits. */
export function formatCep(rawCep: string): string {
  const digits = rawCep.replace(/\D/g, "");
  if (digits.length !== 8) return rawCep;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Only "ATIVA" (Receita's active status) counts as active — anything else, including undefined, doesn't. */
export function isSituacaoAtiva(situacao: string | undefined): boolean {
  return (situacao ?? "").trim().toUpperCase() === "ATIVA";
}

export function mapMinhaReceitaResponse(
  digits: string,
  raw: IMinhaReceitaRawResponse,
): ICnpjCompany {
  const logradouro = raw.logradouro?.trim();
  const municipio = raw.municipio?.trim();
  const uf = raw.uf?.trim();

  const address: ICnpjCompanyAddress | undefined =
    logradouro && municipio && uf
      ? {
          street: logradouro,
          number: raw.numero?.trim() || "S/N",
          complement: raw.complemento?.trim() || undefined,
          district: raw.bairro?.trim() ?? "",
          city: municipio,
          state: uf.toUpperCase(),
          zipCode: raw.cep ? formatCep(raw.cep) : "",
        }
      : undefined;

  return {
    cnpj: digits,
    razaoSocial: (raw.razao_social ?? "").trim(),
    nomeFantasia: (raw.nome_fantasia ?? "").trim(),
    situacaoCadastral: raw.descricao_situacao_cadastral?.trim() || undefined,
    address,
  };
}
