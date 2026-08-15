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
  /** Main economic activity, already in plain text ("Comércio a varejo de peças…"). */
  cnae?: string;
  /** Activity start date as dd/mm/aaaa — the "Abertura" fact on the Receita panel. */
  openedAt?: string;
  /** Digits only, DDD included. Feeds the phone autofill when the field is empty. */
  phone?: string;
  email?: string;
  address?: ICnpjCompanyAddress;
}

export interface IMinhaReceitaRawResponse {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  /** ISO date, e.g. "1966-09-28". */
  data_inicio_atividade?: string;
  cnae_fiscal_descricao?: string;
  /** DDD + number, formatting varies between mirrors — always re-normalized here. */
  ddd_telefone_1?: string;
  email?: string;
  /** "AVENIDA", "RUA", … — Receita keeps the street type in its own field. */
  descricao_tipo_de_logradouro?: string;
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

/** "1966-09-28" -> "28/09/1966". Undefined for anything that isn't an ISO date. */
export function formatReceitaDate(isoDate: string | undefined): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((isoDate ?? "").trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * One-line address for the Receita panel: "Avenida Brasil, 65 — Centro · Rio de Janeiro/RJ".
 *
 * The panel is a confirmation surface, not a form — a single readable line beats
 * a grid of six fields the user cannot edit there anyway. The structured
 * {@link ICnpjCompanyAddress} is what actually reaches the ficha.
 */
export function formatReceitaAddressLine(address: ICnpjCompanyAddress | undefined): string | null {
  if (!address) return null;
  const street = [address.street, address.number].filter(Boolean).join(", ");
  const local = [street, address.district].filter(Boolean).join(" — ");
  const city = [address.city, address.state].filter(Boolean).join("/");
  return [local, city].filter(Boolean).join(" · ") || null;
}

export function mapMinhaReceitaResponse(
  digits: string,
  raw: IMinhaReceitaRawResponse,
): ICnpjCompany {
  const streetType = raw.descricao_tipo_de_logradouro?.trim();
  const logradouro = raw.logradouro?.trim();
  const municipio = raw.municipio?.trim();
  const uf = raw.uf?.trim();
  const phoneDigits = (raw.ddd_telefone_1 ?? "").replace(/\D/g, "");
  const email = raw.email?.trim();

  const address: ICnpjCompanyAddress | undefined =
    logradouro && municipio && uf
      ? {
          street: [streetType, logradouro].filter(Boolean).join(" "),
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
    cnae: raw.cnae_fiscal_descricao?.trim() || undefined,
    openedAt: formatReceitaDate(raw.data_inicio_atividade),
    // 10 or 11 digits only: the dataset carries landlines with missing DDDs and
    // stray extensions, and a half-number in the phone field is worse than none.
    phone: phoneDigits.length === 10 || phoneDigits.length === 11 ? phoneDigits : undefined,
    email: email ? email.toLowerCase() : undefined,
    address,
  };
}
