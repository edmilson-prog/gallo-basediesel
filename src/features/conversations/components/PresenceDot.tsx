import { cn } from "@/lib/utils";

/**
 * The "currently viewing this conversation" green dot, overlaid on the
 * bottom-right of an avatar. Shared by CollaboratorRow and AssigneeChip so the
 * live-presence cue is visually identical on the responsável and collaborator
 * rows (spec §5). Render inside a `relative`-positioned avatar wrapper.
 */
export function PresenceDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-severity-success",
        className,
      )}
    />
  );
}
