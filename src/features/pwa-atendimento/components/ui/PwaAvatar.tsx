import { cn } from "@/lib/utils";

interface IPwaAvatarProps {
  initials: string;
  size?: number;
  /** Draws the gold hairline used on the account button. */
  accent?: boolean;
  /** Slightly lifted background — marks a row with unread messages. */
  highlighted?: boolean;
  className?: string;
}

/**
 * Square monogram, radius 4 — the kit deliberately avoids circles so the avatar
 * echoes the brand's rectangular marks.
 */
export function PwaAvatar({
  initials,
  size = 44,
  accent = false,
  highlighted = false,
  className,
}: IPwaAvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded font-display font-extrabold tracking-[0.02em] text-foreground",
        highlighted ? "bg-muted" : "bg-muted/60",
        accent ? "ring-1 ring-inset ring-primary/60" : "ring-1 ring-inset ring-border",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
