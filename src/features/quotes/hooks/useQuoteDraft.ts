// src/features/quotes/hooks/useQuoteDraft.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { IQuoteItem } from "@/shared/types";

const STORAGE_KEY = "gallo-quote-draft";
const DEBOUNCE_MS = 800;

/** Serializable snapshot of an in-progress quote (single draft slot). */
export interface IQuoteDraft {
  customerId?: string;
  items: IQuoteItem[];
  discountInput: string;
  shipping: number;
  paymentMethod: string;
  paymentTerms: string;
  notes: string;
  /** ISO timestamp of when the snapshot was written. */
  savedAt: string;
}

/** What the editor feeds in to be persisted (everything except savedAt). */
export type QuoteDraftInput = Omit<IQuoteDraft, "savedAt">;

function readDraft(): IQuoteDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IQuoteDraft;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface IUseQuoteDraft {
  /** ISO timestamp of the last persisted snapshot, or null. */
  savedAt: string | null;
  /** Read the persisted draft (e.g. to offer restore on mount). */
  loadDraft: () => IQuoteDraft | null;
  /** Remove the persisted draft (after save or explicit discard). */
  clearDraft: () => void;
}

/**
 * Debounced localStorage auto-save for the quote editor. Persists `input`
 * whenever it changes (after DEBOUNCE_MS) while `enabled` is true. Does NOT
 * restore on its own — the editor calls `loadDraft()` and decides.
 */
export function useQuoteDraft(input: QuoteDraftInput, enabled: boolean): IUseQuoteDraft {
  const [savedAt, setSavedAt] = useState<string | null>(() => readDraft()?.savedAt ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const now = new Date().toISOString();
      const draft: IQuoteDraft = { ...input, savedAt: now };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        setSavedAt(now);
      } catch {
        // localStorage indisponível — rascunho só em memória.
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input, enabled]);

  const loadDraft = useCallback(() => readDraft(), []);
  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSavedAt(null);
  }, []);

  return { savedAt, loadDraft, clearDraft };
}
