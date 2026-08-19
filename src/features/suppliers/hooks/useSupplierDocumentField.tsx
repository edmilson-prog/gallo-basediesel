import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSuppliersProvider } from "@/providers/data";
import { useMinhaReceita, type ICnpjCompany } from "@/features/customers/hooks/useMinhaReceita";
import { formatCnpj, isValidCnpj, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { Icon } from "@/components/Icon";
import {
  isSupplierDocLookupPending,
  resolveSupplierDocState,
  type SupplierDocState,
} from "../engine/supplierForm";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.form;

/** Keystroke settle time before the Receita and duplicate lookups fire. */
const LOOKUP_DEBOUNCE_MS = 380;

const ADORNMENTS: Record<SupplierDocState, ReactNode> = {
  loading: (
    <span
      aria-hidden="true"
      className="size-[15px] animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
    />
  ),
  done: <Icon icon="mdi:check-decagram" size={16} className="text-severity-success" />,
  invalid: <Icon icon="mdi:alert-circle" size={16} className="text-severity-critical" />,
  duplicate: <Icon icon="mdi:alert-circle" size={16} className="text-severity-critical" />,
  notfound: <Icon icon="mdi:alert-circle" size={16} className="text-severity-warning" />,
  error: <Icon icon="mdi:alert-circle" size={16} className="text-severity-info" />,
  idle: null,
  typing: null,
};

export interface IUseSupplierDocumentFieldOptions {
  /** Whether the owning dialog is open — the field resets whenever this becomes `true`. */
  open: boolean;
  /** Saved document (digits, unmasked) when editing; `""` for cadastro. Read the instant `open` becomes `true`. */
  savedDigits: string;
  /**
   * Fired with a freshly resolved, STILL-LIVE company on a successful
   * lookup. The caller decides which (empty) fields to fill — this hook only
   * guarantees the callback never fires for a document the user has since
   * moved past.
   */
  onResolved: (company: ICnpjCompany) => void;
}

export interface IUseSupplierDocumentFieldResult {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Formatted value for the `Input`. */
  value: string;
  /** Pass the raw input event value — formats and stores internally. */
  onChange: (raw: string) => void;
  /** Unmasked digits of `value`. */
  digits: string;
  docState: SupplierDocState;
  /** Status line under the field. */
  message: string;
  /** Right-side adornment for the field. */
  adornment: ReactNode;
}

/**
 * Owns the whole CNPJ field of `SupplierFormDialog`: debounce, Receita
 * lookup, duplicate guard, and the derived state/copy/icon the dialog
 * renders. Extracted out of the dialog component so the race between a
 * settled debounce and the lookup effects actually dispatching —
 * `isSupplierDocLookupPending`, in the engine — is unit-testable without a
 * DOM, and so the dialog itself stays about layout, not orchestration.
 *
 * In edit mode the field opens holding the saved CNPJ WITHOUT re-querying
 * the Receita or the duplicate guard — both would be pure waste (the value
 * is already confirmed). The moment the user changes so much as one digit it
 * stops being "the saved value" and falls through to the exact same flow as
 * a brand-new CNPJ, including a fresh duplicate check against every OTHER
 * supplier — no self-exclusion needed, since the guard only ever fires once
 * the digits differ from what THIS record already has saved.
 */
export function useSupplierDocumentField({
  open,
  savedDigits,
  onResolved,
}: IUseSupplierDocumentFieldOptions): IUseSupplierDocumentFieldResult {
  const provider = useSuppliersProvider();
  const inputRef = useRef<HTMLInputElement>(null);
  /** The document the field was opened with — the edit-mode "don't re-query" baseline. */
  const savedDigitsRef = useRef("");
  /**
   * Debounced target the lookup effects below have actually run for
   * (dispatched a request, or reset because the document went invalid).
   * `null` until they catch up with the live `debouncedDigits`. This is what
   * closes the one-render gap `isSupplierDocLookupPending` guards against —
   * see that function's doc comment for the full race.
   */
  const dispatchedForRef = useRef<string | null>(null);
  /** What's live RIGHT NOW — read from async resolutions to discard superseded ones. */
  const liveDigitsRef = useRef("");

  const [documentValue, setDocumentValue] = useState("");
  const [duplicateFound, setDuplicateFound] = useState(false);
  const [duplicateChecking, setDuplicateChecking] = useState(false);

  const { lookup: lookupCnpj, reset: resetCnpj, status: cnpjStatus } = useMinhaReceita();
  const debouncedDocument = useDebounce(documentValue, LOOKUP_DEBOUNCE_MS);

  const digits = onlyDigits(documentValue);
  liveDigitsRef.current = digits;
  const debouncedDigits = onlyDigits(debouncedDocument);
  const unchangedSavedDocument = savedDigitsRef.current !== "" && digits === savedDigitsRef.current;

  const pending = isSupplierDocLookupPending({
    digits,
    debouncedDigits,
    dispatchedForDigits: dispatchedForRef.current,
    cnpjStatus,
    duplicateChecking,
  });

  const docState: SupplierDocState = unchangedSavedDocument
    ? "done"
    : resolveSupplierDocState({ digits, pending, cnpjStatus, duplicateFound });

  const message = unchangedSavedDocument ? COPY.savedDocumentHint : COPY.docMessages[docState];
  const adornment = ADORNMENTS[docState];

  // Reset every time the dialog opens — for a saved document (edit) or ""
  // (cadastro).
  useEffect(() => {
    if (!open) return;
    savedDigitsRef.current = savedDigits;
    dispatchedForRef.current = null;
    setDocumentValue(savedDigits ? formatCnpj(savedDigits) : "");
    setDuplicateFound(false);
    setDuplicateChecking(false);
    resetCnpj();
  }, [open, savedDigits, resetCnpj]);

  // The document field is where the cursor starts — deferred a tick so the
  // dialog's own initial focus (Radix moves it to the content) lands first.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Marks that the effects below have caught up with `debouncedDigits`. Runs
  // in the SAME passive-effects flush as the two effects below (same
  // dependency), so by the time either of them has processed a target, this
  // has too — closing the gap for the render that happens BEFORE any of them
  // have run at all.
  useEffect(() => {
    dispatchedForRef.current = debouncedDigits;
  }, [debouncedDigits]);

  // Receita lookup — skipped entirely while the field still holds the saved,
  // already-confirmed document.
  useEffect(() => {
    if (unchangedSavedDocument) {
      resetCnpj();
      return;
    }
    const target = debouncedDigits;
    if (target.length !== 14 || !isValidCnpj(target)) {
      resetCnpj();
      return;
    }
    let active = true;
    void lookupCnpj(target).then((company) => {
      // Reopening the dialog doesn't remount this hook, so a lookup fired
      // for a previous document could otherwise autofill the freshly reset
      // form. `useMinhaReceita` already discards superseded responses at its
      // own level (aborted fetch); this is the second, target-based guard.
      if (active && company && liveDigitsRef.current === target) onResolved(company);
    });
    return () => {
      active = false;
    };
    // `onResolved` is expected to be a stable callback (`useCallback`) from
    // the caller — see `SupplierFormDialog`'s `applyCompany`.
  }, [debouncedDigits, unchangedSavedDocument, lookupCnpj, resetCnpj, onResolved]);

  // Duplicate guard — same "don't re-query the saved value" skip, plus a
  // staleness guard mirroring the Receita effect's `liveDigitsRef` check:
  // even though the closure's own `active` flag already discards a response
  // from an effect instance that has been torn down, this makes "these
  // results are for THIS target" true by construction at the write site,
  // not just by indirect reasoning about effect-cleanup timing.
  useEffect(() => {
    if (unchangedSavedDocument) {
      setDuplicateFound(false);
      setDuplicateChecking(false);
      return;
    }
    const target = debouncedDigits;
    if (target.length !== 14 || !isValidCnpj(target)) {
      setDuplicateFound(false);
      setDuplicateChecking(false);
      return;
    }
    let active = true;
    setDuplicateChecking(true);
    void provider
      .list({ search: target, pageSize: 1 })
      .then((result) => {
        if (active && liveDigitsRef.current === target) {
          setDuplicateFound(result.data.length > 0);
        }
      })
      .catch(() => {
        // Fail open: a guard outage must not block a legitimate cadastro.
        if (active && liveDigitsRef.current === target) setDuplicateFound(false);
      })
      .finally(() => {
        if (active) setDuplicateChecking(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedDigits, unchangedSavedDocument, provider]);

  return {
    inputRef,
    value: documentValue,
    onChange: (raw: string) => setDocumentValue(formatCnpj(raw)),
    digits,
    docState,
    message,
    adornment,
  };
}
