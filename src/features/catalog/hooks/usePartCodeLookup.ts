import { useQuery } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import {
  MIN_CODE_LENGTH,
  derivePartCodeState,
  type PartCodeLookupStatus,
  type PartCodeState,
} from "../engine/newPart";
import { findDuplicateByCode } from "../engine/partCodeMatch";

/**
 * Long enough that a counter typist doesn't fire a query per keystroke, short
 * enough that the verdict lands before they reach the next field.
 */
const DEBOUNCE_MS = 400;

export interface IPartCodeLookup {
  state: PartCodeState;
  /** The part already carrying this code, when there is one. */
  duplicate: IPart | null;
}

/**
 * Ask the catalog, while the person types, whether the code on the box is
 * already in the base.
 *
 * Reach: SKU, OEM codes, the raw imported name and — among the rows the search
 * happens to return — competitor cross-references. `cross_references` is jsonb
 * with no generated text column, so it is not part of the server-side `ilike`;
 * a code that exists *only* as a cross-reference can still slip through until
 * that column exists.
 */
export function usePartCodeLookup(code: string, excludeId?: ID): IPartCodeLookup {
  const provider = usePartsProvider();
  const trimmed = code.trim();
  const debounced = useDebounce(trimmed, DEBOUNCE_MS);
  const longEnough = debounced.length >= MIN_CODE_LENGTH;

  const query = useQuery({
    queryKey: ["part-code-lookup", debounced] as const,
    queryFn: () => provider.list({ search: debounced, pageSize: 10 }),
    enabled: longEnough,
    staleTime: 30_000,
    retry: false,
  });

  const status: PartCodeLookupStatus = !longEnough
    ? "idle"
    : query.isError
      ? "error"
      : query.isSuccess
        ? "success"
        : "loading";

  const duplicate = query.isSuccess
    ? findDuplicateByCode(query.data.data, debounced, excludeId)
    : null;

  const state = derivePartCodeState({
    code: trimmed,
    // The debounce still points at the previous code: whatever the query holds
    // describes a code the person has already moved on from.
    pending: debounced !== trimmed,
    status,
    duplicateFound: duplicate !== null,
  });

  return { state, duplicate: state === "duplicate" ? duplicate : null };
}
