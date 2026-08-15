import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IContact, IContactDuplicatePair, ID, ITriageSuggestion } from "@/shared/types";
import { useContactsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { TriageHeader, type TriageTab } from "../components/triage/TriageHeader";
import { TriageRail } from "../components/triage/TriageRail";
import { TriageDecisionCard } from "../components/triage/TriageDecisionCard";
import { TriageQueueDone } from "../components/triage/TriageQueueDone";
import { TriageDuplicates } from "../components/triage/TriageDuplicates";
import { TriageIgnoredList } from "../components/triage/TriageIgnoredList";
import { MergeContactDialog } from "../components/triage/MergeContactDialog";
import { LinkCustomerDialog } from "../components/modals/LinkCustomerDialog";
import { useTriageActions } from "../hooks/useTriageActions";

/**
 * How much of the queue the rail holds at once.
 *
 * Triage is a one-at-a-time screen, so loading the full 3.4k loose contacts
 * would pay for a list nobody scrolls. The header still reports the real
 * server total.
 */
const QUEUE_PAGE_SIZE = 50;

/** Ignored contacts are reviewed, not worked through — one page is plenty. */
const IGNORED_PAGE_SIZE = 100;

/**
 * Triage — the queue of contacts with no customer, one decision at a time.
 *
 * Three queues share the screen: loose contacts, probable duplicates, and the
 * contacts already ignored. Only the first has keyboard shortcuts, because
 * only it is a repetitive pass where hands never need to leave the keyboard.
 */
export function TriagePage() {
  const provider = useContactsProvider();
  const navigate = useNavigate();
  const { currentStoreId } = useCurrentStore();
  const actions = useTriageActions();

  const [tab, setTab] = useState<TriageTab>("soltos");
  const [index, setIndex] = useState(0);
  const [resolved, setResolved] = useState(0);
  const [ignoreReason, setIgnoreReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [settledPairs, setSettledPairs] = useState<Set<string>>(() => new Set());
  const [mergeTarget, setMergeTarget] = useState<IContact | null>(null);
  const [linkTarget, setLinkTarget] = useState<IContact | null>(null);
  // Grows as the attendant walks the queue: a contact whose lookup came back
  // with something gets the dot on the rail. Computing it for the whole
  // window up front would mean a handful of queries per contact, for a hint.
  const [withSuggestion, setWithSuggestion] = useState<Set<ID>>(() => new Set());

  const storeId = currentStoreId ?? undefined;

  const queueQuery = useQuery({
    queryKey: ["contacts-triage-queue", storeId] as const,
    queryFn: () =>
      provider.list({
        scope: "soltos",
        storeId,
        page: 1,
        pageSize: QUEUE_PAGE_SIZE,
        // Most recently heard from first — a number that wrote today is worth
        // deciding on before one that went quiet a year ago.
        orderBy: "lastContactAt",
        orderDir: "desc",
      }),
    staleTime: 30_000,
  });

  const ignoredQuery = useQuery({
    queryKey: ["contacts-triage-ignored", storeId] as const,
    queryFn: () =>
      provider.list({
        scope: "ignorados",
        storeId,
        page: 1,
        pageSize: IGNORED_PAGE_SIZE,
        orderBy: "lastContactAt",
        orderDir: "desc",
      }),
    staleTime: 30_000,
  });

  const duplicatesQuery = useQuery({
    queryKey: ["contacts-triage-duplicates", storeId] as const,
    queryFn: () => provider.duplicatePairs({ storeId }),
    // Sweeping the base is the most expensive read on this screen; it only
    // runs once the tab is actually opened.
    enabled: tab === "duplicados",
    staleTime: 5 * 60_000,
  });

  const queue = useMemo(() => queueQuery.data?.data ?? [], [queueQuery.data]);
  const current = queue.length > 0 ? (queue[Math.min(index, queue.length - 1)] ?? null) : null;

  const contextQuery = useQuery({
    queryKey: ["contacts-triage-context", current?.id] as const,
    queryFn: () => provider.triageContext(current as IContact),
    enabled: current !== null,
    staleTime: 5 * 60_000,
  });

  const suggestionsQuery = useQuery({
    queryKey: ["contacts-triage-suggestions", current?.id] as const,
    queryFn: () => provider.triageSuggestions(current as IContact),
    enabled: current !== null,
    staleTime: 5 * 60_000,
  });

  const suggestions = useMemo<ITriageSuggestion[]>(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  );

  useEffect(() => {
    if (!current || suggestions.length === 0) return;
    setWithSuggestion((previous) => {
      if (previous.has(current.id)) return previous;
      const next = new Set(previous);
      next.add(current.id);
      return next;
    });
  }, [current, suggestions]);

  // Every verdict removes a contact from the queue, so the index can end up
  // past the end. The render clamps it anyway, but leaving the stored value
  // stale would make `j`/`k` wrap off the wrong position.
  useEffect(() => {
    setIndex((position) => {
      if (queue.length === 0) return 0;
      return position > queue.length - 1 ? queue.length - 1 : position;
    });
  }, [queue.length]);

  /** Runs a verdict and, when it sticks, counts it and resets the card. */
  const resolve = useCallback(async (run: () => Promise<boolean>) => {
    setBusy(true);
    try {
      const ok = await run();
      if (ok) {
        setResolved((count) => count + 1);
        setIgnoreReason("");
      }
      return ok;
    } finally {
      setBusy(false);
    }
  }, []);

  const skip = useCallback(() => {
    setIndex((current) => (queue.length === 0 ? 0 : (current + 1) % queue.length));
  }, [queue.length]);

  const previous = useCallback(() => {
    setIndex((current) => (queue.length === 0 ? 0 : (current - 1 + queue.length) % queue.length));
  }, [queue.length]);

  function openConversation(contact: IContact) {
    const digits = contact.phone?.replace(/\D/g, "") ?? "";
    void navigate({ to: "/app/atendimento", search: { q: digits || contact.name } });
  }

  const handleIgnore = useCallback(() => {
    if (!current) return;
    if (ignoreReason === "") {
      toast.error("Escolha o motivo antes de ignorar");
      return;
    }
    void resolve(() => actions.ignore(current, ignoreReason));
  }, [actions, current, ignoreReason, resolve]);

  // Keyboard shortcuts, only on the loose queue and never while a dialog or a
  // field has the focus — otherwise "p" would create a customer mid-typing.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (tab !== "soltos" || !current || busy) return;
      if (mergeTarget || linkTarget) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        skip();
      } else if (key === "k") {
        event.preventDefault();
        previous();
      } else if (key === "p") {
        event.preventDefault();
        void resolve(() => actions.createIndividual(current));
      } else if (key === "m") {
        event.preventDefault();
        setMergeTarget(current);
      } else if (key === "i") {
        event.preventDefault();
        handleIgnore();
      } else if (key === "1" || key === "2" || key === "3") {
        const suggestion = suggestions[Number(key) - 1];
        if (!suggestion) return;
        event.preventDefault();
        void resolve(() => actions.link(current, suggestion.customerId, suggestion.customerName));
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    actions,
    busy,
    current,
    handleIgnore,
    linkTarget,
    mergeTarget,
    previous,
    resolve,
    skip,
    suggestions,
    tab,
  ]);

  function handleMergePair(pair: IContactDuplicatePair) {
    void resolve(() => actions.merge(pair.primary, pair.duplicate)).then((ok) => {
      if (ok) setSettledPairs((current) => new Set(current).add(pair.id));
    });
  }

  function handleKeepBoth(pair: IContactDuplicatePair) {
    // Nothing is written: "not the same person" is a decision about THIS
    // session's list, not a fact the base can store — there is no column for
    // "these two are unrelated", and inventing one silently would be worse
    // than showing the pair again after a reload.
    setSettledPairs((current) => new Set(current).add(pair.id));
    toast.info("Par dispensado nesta sessão — volta a aparecer numa próxima varredura");
  }

  const counts: Record<TriageTab, number> = {
    soltos: queueQuery.data?.total ?? 0,
    duplicados: (duplicatesQuery.data ?? []).filter((pair) => !settledPairs.has(pair.id)).length,
    ignorados: ignoredQuery.data?.total ?? 0,
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0">
        <TriageHeader tab={tab} onTabChange={setTab} counts={counts} resolved={resolved} />
      </div>

      <div className="flex min-h-0 flex-1">
        {tab === "soltos" && (
          <>
            <TriageRail
              contacts={queue}
              total={queueQuery.data?.total ?? 0}
              currentId={current?.id ?? null}
              onPick={setIndex}
              withSuggestion={withSuggestion}
              isLoading={queueQuery.isLoading}
            />
            {queueQuery.isError ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <p className="max-w-sm text-sm text-severity-critical">
                  Não foi possível carregar a fila de triagem. Tente novamente.
                </p>
              </div>
            ) : current ? (
              <TriageDecisionCard
                contact={current}
                suggestions={suggestions}
                isLoadingSuggestions={suggestionsQuery.isLoading}
                context={contextQuery.data}
                ignoreReason={ignoreReason}
                onIgnoreReasonChange={setIgnoreReason}
                onLink={(suggestion) =>
                  void resolve(() =>
                    actions.link(current, suggestion.customerId, suggestion.customerName),
                  )
                }
                onPickCustomer={() => setLinkTarget(current)}
                onCreateIndividual={() => void resolve(() => actions.createIndividual(current))}
                onMerge={() => setMergeTarget(current)}
                onSkip={skip}
                onIgnore={handleIgnore}
                onOpenConversation={() => openConversation(current)}
                busy={busy}
              />
            ) : queueQuery.isLoading ? (
              <div className="grid flex-1 place-items-center p-8">
                <p className="text-sm text-muted-foreground">Carregando fila…</p>
              </div>
            ) : (
              <TriageQueueDone resolved={resolved} />
            )}
          </>
        )}

        {tab === "duplicados" && (
          <TriageDuplicates
            pairs={duplicatesQuery.data ?? []}
            isLoading={duplicatesQuery.isLoading}
            isError={duplicatesQuery.isError}
            settled={settledPairs}
            onMerge={handleMergePair}
            onKeepBoth={handleKeepBoth}
            busy={busy}
          />
        )}

        {tab === "ignorados" && (
          <TriageIgnoredList
            contacts={ignoredQuery.data?.data ?? []}
            isLoading={ignoredQuery.isLoading}
            isError={ignoredQuery.isError}
            onRestore={(contact) => void resolve(() => actions.unignore(contact))}
            busy={busy}
          />
        )}
      </div>

      <MergeContactDialog
        contact={mergeTarget}
        onClose={() => setMergeTarget(null)}
        onConfirm={(primary, duplicate) => {
          setMergeTarget(null);
          void resolve(() => actions.merge(primary, duplicate));
        }}
      />

      <LinkCustomerDialog
        contact={linkTarget}
        onClose={() => setLinkTarget(null)}
        onConfirm={(contact, customerId) => {
          setLinkTarget(null);
          void resolve(() => actions.link(contact, customerId, "cliente selecionado"));
        }}
      />
    </div>
  );
}
