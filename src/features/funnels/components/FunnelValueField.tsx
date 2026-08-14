import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { COPY } from "../i18n/pt-BR";

export interface IFunnelValueFieldProps {
  value: number | undefined;
  /** Accessible label — the caller names the funnel, which this cannot see. */
  label: string;
  canEdit: boolean;
  disabled: boolean;
  onSave: (value: number | undefined) => void;
  /** `sm` for the lead detail card, `xs` for the 360px Atendimento panel. */
  size?: "sm" | "xs";
}

/**
 * The participation's own value, edited in place. Empty is an invitation.
 *
 * Lifted out of `leads/components/detail/LeadFunnelsCard` when the Atendimento
 * panel needed the same control: the value belongs to a
 * `lead_funnel_entry`, so a lead in two funnels is two distinct revenues, and a
 * second editor would be a second place to get that parsing wrong.
 * (`ILead.estimatedValue` is the deprecated aggregate — never edit it here.)
 */
export function FunnelValueField({
  value,
  label,
  canEdit,
  disabled,
  onSave,
  size = "sm",
}: IFunnelValueFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== undefined ? String(value) : "");
  const ref = useRef<HTMLInputElement>(null);
  const textSize = size === "xs" ? "text-xs" : "text-sm";

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!canEdit) {
    return (
      <span
        className={cn(
          textSize,
          "tabular-nums",
          value !== undefined ? "font-semibold text-foreground" : "text-muted-foreground/60",
        )}
      >
        {value !== undefined ? formatBRL(value) : COPY.value.none}
      </span>
    );
  }

  if (editing) {
    const commit = () => {
      setEditing(false);
      const trimmed = draft.trim();
      const parsed = trimmed ? Number(trimmed.replace(/\./g, "").replace(",", ".")) : undefined;
      // An unparsable string is not a request to wipe the value — only an
      // emptied field is.
      if (trimmed && !Number.isFinite(parsed)) return;
      if (parsed !== value) onSave(parsed);
    };
    return (
      <Input
        ref={ref}
        value={draft}
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value !== undefined ? String(value) : "");
            setEditing(false);
          }
        }}
        className={cn("h-7 text-right tabular-nums", textSize, size === "xs" ? "w-24" : "w-28")}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={() => {
        setDraft(value !== undefined ? String(value) : "");
        setEditing(true);
      }}
      className={cn(
        "rounded px-1.5 py-0.5 tabular-nums transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        textSize,
        value !== undefined ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      {value !== undefined ? (
        formatBRL(value)
      ) : (
        <span className="inline-flex items-center gap-1 text-xs">
          <Icon icon="mdi:plus" size={11} aria-hidden />
          {COPY.value.add}
        </span>
      )}
    </button>
  );
}
