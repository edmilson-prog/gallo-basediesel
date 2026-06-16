import type { ISeller } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export interface IAssigneeChipProps {
  /** The seller the conversation is assigned to, or null (renders nothing). */
  seller: ISeller | null;
  /** compact = inbox list row (first name, muted); full = header pill (full name). */
  variant?: "compact" | "full";
  className?: string;
}

/** Initials from a full name: first + last word initials, or first two letters. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Shows WHO is handling a conversation (PRD assignment oversight). A neutral
 * avatar (initials) keeps it distinct from the contact's colored avatar; color
 * is never the only cue — the name is always present (compact) or on hover.
 */
export function AssigneeChip({ seller, variant = "compact", className }: IAssigneeChipProps) {
  if (!seller) return null;
  const initials = initialsOf(seller.fullName);
  const firstName = seller.fullName.trim().split(/\s+/)[0] ?? seller.fullName;
  const title = `${CONVERSATION_STRINGS.assignee}: ${seller.fullName}`;

  if (variant === "full") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-foreground",
          className,
        )}
        title={title}
        aria-label={title}
      >
        <Icon icon="mdi:account-check" size={13} className="text-muted-foreground" />
        <Avatar className="h-4 w-4">
          <AvatarFallback className="bg-secondary text-[8px] font-semibold text-secondary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="max-w-[10rem] truncate">{seller.fullName}</span>
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px] text-muted-foreground", className)}
      title={title}
      aria-label={title}
    >
      <Avatar className="h-4 w-4">
        <AvatarFallback className="bg-secondary text-[8px] font-semibold text-secondary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-[7rem] truncate">{firstName}</span>
    </span>
  );
}
