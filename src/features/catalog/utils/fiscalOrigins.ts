export interface IFiscalOrigin {
  code: string;
  label: string;
}

/** Origin codes from the NF-e "Origem da Mercadoria" table (Convênio ICMS 38/2013). */
export const FISCAL_ORIGINS: IFiscalOrigin[] = [
  { code: "0", label: "0 — Nacional" },
  { code: "1", label: "1 — Estrangeira, importação direta" },
  { code: "2", label: "2 — Estrangeira, adquirida no mercado interno" },
  { code: "3", label: "3 — Nacional, conteúdo importado > 40%" },
  { code: "4", label: "4 — Nacional, produção conforme processos produtivos básicos" },
  { code: "5", label: "5 — Nacional, conteúdo importado ≤ 40%" },
  { code: "6", label: "6 — Estrangeira, importação direta, sem similar nacional" },
  { code: "7", label: "7 — Estrangeira, mercado interno, sem similar nacional" },
  { code: "8", label: "8 — Nacional, conteúdo importado > 70%" },
];

export function getFiscalOriginLabel(code: string | undefined): string {
  if (!code) return "—";
  return FISCAL_ORIGINS.find((o) => o.code === code)?.label ?? code;
}
