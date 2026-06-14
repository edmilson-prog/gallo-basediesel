import type { ID, IConversationNote, ISeller } from "@/shared/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { initialsFrom } from "@/shared/utils/avatar";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { sellerDisplay } from "../../engine/conversationNotes";
import type { NotesConsultMode, NotesConsultScope } from "../../engine/notesConsult";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const S = CONVERSATION_STRINGS.conversationNotes.consult;

const MODES: { value: NotesConsultMode; icon: string; label: string }[] = [
  { value: "index", icon: "mdi:view-list-outline", label: S.modeIndex },
  { value: "only", icon: "mdi:note-text-outline", label: S.modeOnly },
  { value: "highlight", icon: "mdi:magnify", label: S.modeHighlight },
];

const SCOPES: { value: NotesConsultScope; label: string }[] = [
  { value: "all", label: S.scopeAll },
  { value: "mentions", label: S.scopeMentions },
  { value: "pinned", label: S.scopePinned },
];

export interface INotesConsultBarProps {
  total: number;
  matched: IConversationNote[];
  sellers: ISeller[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: NotesConsultMode;
  onModeChange: (mode: NotesConsultMode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  scope: NotesConsultScope;
  onScopeChange: (scope: NotesConsultScope) => void;
  /** Highlight mode: 0-based position within `matched`. */
  cursor: number;
  onPrev: () => void;
  onNext: () => void;
  /** Index mode: jump to a note in the thread. */
  onJump: (noteId: ID) => void;
}

/**
 * Sticky bar at the top of the chat for consulting the conversation's internal
 * notes. Shares one search + scope filter across three switchable modes:
 * an index (list + jump), only-notes (filters the thread), and highlight
 * (rings matches in the thread with prev/next navigation).
 */
export function NotesConsultBar({
  total,
  matched,
  sellers,
  open,
  onOpenChange,
  mode,
  onModeChange,
  query,
  onQueryChange,
  scope,
  onScopeChange,
  cursor,
  onPrev,
  onNext,
  onJump,
}: INotesConsultBarProps) {
  return (
    <div className="shrink-0 border-b border-border bg-card/60">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-muted/40"
        aria-expanded={open}
      >
        <Icon
          icon="mdi:note-text-outline"
          size={14}
          className="text-severity-warning"
          aria-hidden
        />
        <span className="font-medium text-foreground">{S.summary(total)}</span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          {!open && S.open}
          <Icon icon={open ? "mdi:chevron-up" : "mdi:chevron-down"} size={16} />
        </span>
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-3">
          {/* Search + mode switcher */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon
                icon="mdi:magnify"
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={S.searchPlaceholder}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && onModeChange(v as NotesConsultMode)}
              className="shrink-0 rounded-lg bg-muted/40 p-1"
              aria-label="Modo de consulta"
            >
              {MODES.map((m) => (
                <Tooltip key={m.value}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value={m.value}
                      aria-label={m.label}
                      className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                    >
                      <Icon icon={m.icon} size={16} />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>{m.label}</TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          </div>

          {/* Scope chips */}
          <div className="flex flex-wrap gap-1.5">
            {SCOPES.map((s) => (
              <Button
                key={s.value}
                type="button"
                variant={scope === s.value ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onScopeChange(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>

          {/* Mode-specific area */}
          {matched.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">{S.noMatches}</p>
          ) : mode === "index" ? (
            <ul className="max-h-52 space-y-0.5 overflow-y-auto">
              {matched.map((note) => {
                const author = sellers.find((s) => s.id === note.authorId);
                const name = author ? sellerDisplay(author) : "Atendente";
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => onJump(note.id)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-severity-warning/20 text-[9px] font-semibold text-severity-warning">
                        {initialsFrom(name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className="truncate font-medium text-foreground">{name}</span>·{" "}
                          {formatRelativeTime(note.createdAt)}
                          {note.pinned && (
                            <Icon icon="mdi:pin" size={10} className="text-severity-warning" />
                          )}
                        </span>
                        <span className="line-clamp-1 text-xs text-foreground">{note.content}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : mode === "highlight" ? (
            <div className="flex items-center justify-center gap-3 text-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onPrev}
                aria-label={S.prev}
              >
                <Icon icon="mdi:chevron-up" size={16} />
              </Button>
              <span className="tabular-nums text-muted-foreground">
                {S.counter(cursor + 1, matched.length)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onNext}
                aria-label={S.next}
              >
                <Icon icon="mdi:chevron-down" size={16} />
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
