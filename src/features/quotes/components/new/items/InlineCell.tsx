// src/features/quotes/components/new/items/InlineCell.tsx
import { useEffect, useState } from "react";

export interface IInlineCellProps {
  /** Formatted value shown when the cell is not focused. */
  value: string;
  /** Called on blur / Enter with the raw text the seller typed. */
  onCommit: (raw: string) => void;
  prefix?: string;
  suffix?: string;
  /** Extra classes for the input — used to tint a non-zero discount. */
  inputClassName?: string;
  ariaLabel: string;
}

/**
 * Editable table cell that only looks like a field once focused — the table
 * stays readable as a document, but every number is one click from editing.
 */
export function InlineCell({
  value,
  onCommit,
  prefix,
  suffix,
  inputClassName = "",
  ariaLabel,
}: IInlineCellProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  // Outside of editing, the cell mirrors the committed value.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <div
      className={`flex items-center justify-end gap-1 rounded-md px-1.5 py-1 transition-colors motion-reduce:transition-none ${
        focused ? "bg-background ring-1 ring-primary/50" : "hover:ring-1 hover:ring-border"
      }`}
    >
      {prefix && <span className="shrink-0 text-[11px] text-muted-foreground">{prefix}</span>}
      <input
        value={draft}
        aria-label={ariaLabel}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        className={`w-full min-w-0 border-0 bg-transparent p-0 text-right text-[13px] font-medium tabular-nums outline-none ${
          inputClassName || "text-foreground"
        }`}
      />
      {suffix && <span className="shrink-0 text-[11px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}
