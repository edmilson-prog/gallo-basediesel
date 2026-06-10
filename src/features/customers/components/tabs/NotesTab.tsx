import { useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, ICustomerNote } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { hashHue, initialsFrom, avatarColors } from "@/shared/utils/avatar";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabSkeleton } from "../TabSkeleton";
import { TabEmptyState } from "../TabEmptyState";

const COPY = CUSTOMER_STRINGS.notes;

export interface INotesTabProps {
  customer: ICustomer;
}

export function NotesTab({ customer }: INotesTabProps) {
  const provider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const notesQuery = useQuery({
    queryKey: ["customer-notes", customer.id] as const,
    staleTime: 30 * 1000,
    queryFn: () => provider.listNotes(customer.id),
  });

  const sellersQuery = useQuery({
    queryKey: ["sellers"] as const,
    staleTime: 5 * 60 * 1000,
    queryFn: () => sellersProvider.list(),
  });

  const sellersById = new Map((sellersQuery.data ?? []).map((s) => [s.id, s]));
  const notes = notesQuery.data ?? [];

  const handleSubmit = async () => {
    const content = draft.trim();
    if (!content) return;
    // `customer_notes.author_id` is a FK to sellers(id): the note's author is
    // the acting *seller*, not the auth user. currentUser.id (auth uuid) would
    // violate that FK on Supabase and render a raw id in the UI on mock.
    const authorId = currentUser?.sellerId;
    if (!authorId) {
      toast.error(COPY.noSellerError);
      return;
    }
    setSubmitting(true);
    try {
      const created = await provider.addNote(customer.id, content, authorId);
      auditLog({
        action: "customer.note_added",
        resource: "customer",
        resourceId: customer.id,
        after: { noteId: created.id, contentLength: content.length },
      });
      toast.success(COPY.addedToast);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["customer-notes", customer.id] });
    } catch {
      toast.error("Não foi possível adicionar a nota.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex shrink-0 items-center gap-2">
        <Icon icon="mdi:note-text-outline" size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
      </header>

      <div className="flex-1 space-y-2">
        {notesQuery.isLoading ? (
          <TabSkeleton rows={3} rowHeight="h-16" />
        ) : notes.length === 0 ? (
          <TabEmptyState icon="mdi:note-off-outline" message={COPY.empty} />
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                author={sellersById.get(note.authorId)?.fullName ?? note.authorId}
                authorLoading={sellersQuery.isLoading}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 shrink-0 space-y-1.5 border-t border-border pt-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={COPY.placeholder}
          className="min-h-[72px] text-xs"
          disabled={submitting}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{COPY.submitHint}</span>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !draft.trim()}>
            {submitting ? (
              <Icon icon="mdi:loading" size={14} className="animate-spin" />
            ) : (
              <Icon icon="mdi:plus" size={14} />
            )}
            {COPY.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  author,
  authorLoading,
}: {
  note: ICustomerNote;
  author: string;
  authorLoading: boolean;
}) {
  const hue = hashHue(note.authorId);
  const colors = avatarColors(hue);
  return (
    <li className="rounded-md border border-border bg-background p-2.5">
      <div className="flex items-start gap-2">
        <Avatar className="h-6 w-6 text-[10px]">
          <AvatarFallback style={{ backgroundColor: colors.bg, color: colors.fg }} aria-hidden>
            {initialsFrom(author)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-medium text-foreground">
              {authorLoading ? <Skeleton className="inline-block h-3 w-16" /> : author}
            </span>
            <span className="text-muted-foreground">{formatRelativeTimeBR(note.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{note.content}</p>
        </div>
      </div>
    </li>
  );
}
