import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILead, IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useAuth } from "@/features/auth/useAuth";
import { buildLeadTimeline, type TimelineKind } from "../../engine/leadTimeline";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail.timeline;

type Filter = "tudo" | TimelineKind;

const FILTERS: { id: Filter; label: string; icon?: string }[] = [
  { id: "tudo", label: COPY.filters.all },
  { id: "conversa", label: COPY.filters.conversation, icon: "mdi:whatsapp" },
  { id: "nota", label: COPY.filters.note, icon: "mdi:note-text-outline" },
  { id: "historico", label: COPY.filters.history, icon: "mdi:history" },
];

export interface ILeadTimelineProps {
  lead: ILead;
  /** Conversation whose messages the card above already loaded. */
  conversationId?: ID;
  conversationAt?: string;
  messages: IMessage[];
  canEdit: boolean;
}

/**
 * One thread instead of three tabs.
 *
 * Conversas, Notas and Histórico were telling the same story in pieces: the
 * customer's question sat in one tab, the note somebody wrote about it in
 * another, and the temperature change it caused in a third, each sorted on its
 * own. The sequence — which IS the story — could not be read anywhere.
 *
 * Merged, the filters stay but now narrow one thread rather than switching
 * between three, and the note composer sits at the top of it: writing a note is
 * the most common thing anybody does here.
 */
export function LeadTimeline({
  lead,
  conversationId,
  conversationAt,
  messages,
  canEdit,
}: ILeadTimelineProps) {
  const [filter, setFilter] = useState<Filter>("tudo");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const leadsProvider = useLeadsProvider();
  const auditsProvider = useAuditsProvider();
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();

  const sellersQuery = useQuery({
    queryKey: ["sellers-min"] as const,
    queryFn: () => sellersProvider.list(),
    staleTime: 5 * 60_000,
  });

  const notesQuery = useQuery({
    queryKey: ["lead-notes", lead.id] as const,
    queryFn: () => leadsProvider.listNotes(lead.id),
    staleTime: 30_000,
    // The `lead_notes` migration is not yet applied in prod — retry: false
    // makes the absent-table path resolve to the empty state immediately
    // instead of retrying 3x with backoff.
    retry: false,
  });

  const auditsQuery = useQuery({
    queryKey: ["lead-audits", lead.id] as const,
    queryFn: () => auditsProvider.list({ resource: "lead", resourceId: lead.id, pageSize: 100 }),
    staleTime: 30_000,
  });

  const items = useMemo(
    () =>
      buildLeadTimeline({
        conversations:
          conversationId && conversationAt
            ? [
                {
                  id: conversationId,
                  at: conversationAt,
                  messageCount: messages.length,
                  preview: messages[messages.length - 1]?.text.trim() ?? "",
                },
              ]
            : [],
        notes: notesQuery.data ?? [],
        audits: auditsQuery.data?.data ?? [],
        nameOf: (id) => sellersQuery.data?.find((s) => s.id === id)?.fullName ?? "",
        conversationTitle: COPY.conversationTitle,
        noteTitle: COPY.noteTitle,
      }),
    [
      conversationId,
      conversationAt,
      messages,
      notesQuery.data,
      auditsQuery.data,
      sellersQuery.data,
    ],
  );

  const shown = filter === "tudo" ? items : items.filter((i) => i.kind === filter);

  const addNote = async () => {
    const body = draft.trim();
    const authorId = currentUser?.sellerId;
    if (!body || !authorId) return;
    setSaving(true);
    try {
      await leadsProvider.addNote(lead.id, body, authorId);
      setDraft("");
      toast.success(COPY.noteSaved);
      await queryClient.invalidateQueries({ queryKey: ["lead-notes", lead.id] });
    } catch {
      toast.error(LEADS_STRINGS.detail.noteSaveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon icon="mdi:history" size={14} className="text-muted-foreground" aria-hidden />
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {COPY.title}
        </h2>
        <div className="ml-auto flex flex-wrap gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.id
                  ? "bg-muted font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {f.icon && <Icon icon={f.icon} size={12} aria-hidden />}
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-3">
        {canEdit && (
          <div className="mb-4 flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addNote();
              }}
              placeholder={COPY.composerPlaceholder}
              aria-label={COPY.composerPlaceholder}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              className="h-9 shrink-0"
              disabled={saving || !draft.trim() || !currentUser?.sellerId}
              onClick={() => void addNote()}
            >
              <Icon
                icon={saving ? "svg-spinners:ring-resize" : "mdi:plus"}
                size={14}
                aria-hidden
              />
              {COPY.composerAction}
            </Button>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{COPY.empty}</p>
        ) : (
          <ol className="relative">
            {/* The rail behind the markers — decorative, hence aria-hidden. */}
            <span
              aria-hidden
              className="absolute bottom-3 left-[11px] top-2 w-px bg-border"
            />
            {shown.map((item, index) => (
              <li
                key={item.id}
                className={cn("relative flex gap-3", index < shown.length - 1 && "pb-4")}
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative z-[1] grid size-6 shrink-0 place-items-center rounded-full border border-border bg-card",
                    item.tone,
                  )}
                >
                  <Icon icon={item.icon} size={12} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground">{item.title}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTimeBR(item.at)}
                    </span>
                  </div>
                  {item.lines.map((line, i) => (
                    <p
                      key={i}
                      className={cn(
                        "mt-0.5 text-pretty text-xs leading-snug",
                        item.kind === "nota" ? "text-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {line}
                    </p>
                  ))}
                  {item.who && (
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{COPY.by(item.who)}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
