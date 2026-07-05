import type { ISeller } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export interface ICollaboratorRowProps {
  seller: ISeller;
  source: "manual" | "mention";
  /** True when this collaborator currently has the conversation open (presence). */
  viewing: boolean;
  canRemove: boolean;
  onRemove: () => void;
}

/** One row in the "Colaboradores" section (AtendimentoTab, Option C). */
export function CollaboratorRow({ seller, source, viewing, canRemove, onRemove }: ICollaboratorRowProps) {
  const initials = initialsOf(seller.fullName);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="relative">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="bg-secondary text-[9px] font-semibold text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {viewing && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-severity-success"
            />
          )}
        </span>
        <span className="truncate text-foreground">{seller.fullName}</span>
        {source === "mention" && (
          <span className="shrink-0 text-[10px] text-muted-foreground">via @menção</span>
        )}
      </span>
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          aria-label={`Remover ${seller.fullName} da conversa`}
          onClick={onRemove}
        >
          <Icon icon="mdi:close" size={12} />
        </Button>
      )}
    </div>
  );
}
