import type { IPlaceholderContext } from "./placeholderResolver";

/** Canonical placeholder vocabulary (D3). Order drives the chip row. */
export const PLACEHOLDER_KEYS = ["nome", "loja", "vendedor", "peca", "prazo"] as const;

/** Illustrative example context for the live preview (NOT real send data). */
export function buildSampleContext(opts?: { loja?: string; vendedor?: string }): IPlaceholderContext {
  return {
    nome: "Carlos",
    loja: opts?.loja ?? "GALLO Matriz",
    vendedor: opts?.vendedor ?? "Vendedor",
    peca: "pastilha de freio",
    prazo: "3 dias úteis",
  };
}
