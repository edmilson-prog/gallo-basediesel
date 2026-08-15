import type { ConversationStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PWA_STATUS_META } from "./statusMeta";

export function PwaStatusDot({ status, size = 8 }: { status: ConversationStatus; size?: number }) {
  const meta = PWA_STATUS_META[status];
  if (meta.dot === "outline") {
    return (
      <span
        className={cn("inline-block shrink-0 rounded-full border-2 border-current", meta.toneClass)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  if (meta.dot === "check") {
    return <Icon icon="mdi:check" size={size + 4} className={meta.toneClass} />;
  }
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full bg-current", meta.toneClass)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

interface IPwaStatusPillProps {
  status: ConversationStatus;
  onClick?: () => void;
}

/** Status chip; when it can be tapped it grows to a 44px target and shows a caret. */
export function PwaStatusPill({ status, onClick }: IPwaStatusPillProps) {
  const meta = PWA_STATUS_META[status];
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 text-[11.5px] font-bold uppercase tracking-[0.04em]",
        "ring-1 ring-inset ring-border disabled:pointer-events-none",
        interactive ? "min-h-[44px]" : "py-[5px]",
        meta.toneClass,
      )}
    >
      <PwaStatusDot status={status} size={7} />
      {meta.label}
      {interactive && <Icon icon="mdi:chevron-down" size={13} className="text-muted-foreground" />}
    </button>
  );
}
