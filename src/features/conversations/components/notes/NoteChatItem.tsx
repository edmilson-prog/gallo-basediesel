import { useMemo, useState } from "react";
import type { ID, IConversationNote, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { initialsFrom } from "@/shared/utils/avatar";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { segmentNote, type IMentionCandidate } from "../../engine/mentions";
import { canEditNote, canManageNote, sellerDisplay } from "../../engine/conversationNotes";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { NoteComposer } from "./NoteComposer";

const S = CONVERSATION_STRINGS.conversationNotes;

export interface INoteChatItemProps {
  note: IConversationNote;
  sellers: ISeller[];
  currentSellerId: ID | undefined;
  isStaff: boolean;
  busy: boolean;
  /** Brief flash after jumping to this note from the index. */
  flash?: boolean;
  /** Persistent ring while it matches the active search (highlight mode). */
  matched?: boolean;
  onUpdate: (
    id: ID,
    patch: Partial<Pick<IConversationNote, "content" | "mentions" | "pinned">>,
  ) => Promise<unknown>;
  onRemove: (id: ID) => Promise<void>;
}

/**
 * An internal note rendered inline in the conversation thread — visually
 * distinct from message bubbles (amber "sticky-note" card, lock badge) so it
 * reads as team-only context. It never leaves for the customer.
 */
export function NoteChatItem({
  note,
  sellers,
  currentSellerId,
  isStaff,
  busy,
  flash,
  matched,
  onUpdate,
  onRemove,
}: INoteChatItemProps) {
  const [editing, setEditing] = useState(false);

  const candidates: IMentionCandidate[] = useMemo(
    () => sellers.map((s) => ({ id: s.id, display: sellerDisplay(s) })),
    [sellers],
  );

  const author = sellers.find((s) => s.id === note.authorId);
  const authorName = author ? sellerDisplay(author) : "Atendente";
  const isAuthor = note.authorId === currentSellerId;
  const canEdit = canEditNote(note, currentSellerId);
  const canManage = canManageNote(note, currentSellerId, isStaff);
  const edited = note.updatedAt !== note.createdAt;
  const segments = useMemo(() => segmentNote(note.content, candidates), [note.content, candidates]);

  return (
    <div className="my-1.5 flex justify-center" data-note-id={note.id}>
      <div
        className={cn(
          "group w-full max-w-[88%] rounded-lg border border-severity-warning/40 bg-severity-warning/10 px-3 py-2 shadow-sm transition-shadow",
          (flash || matched) && "ring-2 ring-severity-warning ring-offset-1 ring-offset-background",
          flash && "motion-safe:animate-pulse",
        )}
      >
        {/* Header: internal badge + actions */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-severity-warning">
          <Icon icon="mdi:lock-outline" size={12} aria-hidden />
          <span className="uppercase tracking-wide">{S.internalBadge}</span>
          {note.pinned && (
            <Icon icon="mdi:pin" size={12} className="text-severity-warning" aria-label={S.unpin} />
          )}
          {(canEdit || canManage) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 w-6 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  aria-label="Ações da anotação"
                >
                  <Icon icon="mdi:dots-vertical" size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {canManage && (
                  <DropdownMenuItem
                    onClick={() => void onUpdate(note.id, { pinned: !note.pinned })}
                    className="gap-2"
                  >
                    <Icon
                      icon={note.pinned ? "mdi:pin-off-outline" : "mdi:pin-outline"}
                      size={15}
                    />
                    {note.pinned ? S.unpin : S.pin}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem onClick={() => setEditing(true)} className="gap-2">
                    <Icon icon="mdi:pencil-outline" size={15} />
                    {S.edit}
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem
                    onClick={() => void onRemove(note.id)}
                    className="gap-2 text-severity-critical focus:text-severity-critical"
                  >
                    <Icon icon="mdi:trash-can-outline" size={15} />
                    {S.delete}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5">
            <NoteComposer
              sellers={sellers}
              initialValue={note.content}
              submitLabel={S.saveEdit}
              autoFocus
              busy={busy}
              onSubmit={async (content, mentions) => {
                await onUpdate(note.id, { content, mentions });
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <div className="mt-1 flex items-start gap-2">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-severity-warning/20 text-[10px] font-semibold text-severity-warning"
              aria-hidden
            >
              {initialsFrom(authorName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <span className="max-w-[150px] truncate font-semibold text-foreground">
                  {authorName}
                </span>
                {isAuthor && <span>· {S.authorYou}</span>}
                <span>· {formatRelativeTime(note.createdAt)}</span>
                {edited && <span title={formatRelativeTime(note.updatedAt)}>· {S.edited}</span>}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
                {segments.map((seg, i) =>
                  seg.type === "mention" ? (
                    <span key={i} className="font-medium text-primary">
                      {seg.value}
                    </span>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  ),
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
