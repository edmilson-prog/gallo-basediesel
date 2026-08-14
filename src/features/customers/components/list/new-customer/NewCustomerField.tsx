import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface INewCustomerFieldProps {
  id: string;
  label: string;
  /** Lowercase aside next to the label ("opcional", "consulta automática…"). */
  note?: string | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Documents and phones carry the condensed display face, like the kit. */
  mono?: boolean;
  /** Highlights the field for a moment after the Receita filled it in. */
  flash?: boolean;
  /** Adornment pinned to the right edge (status icon / spinner). */
  adornment?: ReactNode;
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email";
  type?: string;
  invalid?: boolean;
  describedBy?: string;
  /** Rendered under the field — error text, hints, the status line. */
  children?: ReactNode;
}

/**
 * Labelled input of the "Novo cliente" form.
 *
 * The flash is not decoration: autofill from the Receita writes into fields the
 * user can still edit, and a silent write is a write the user never reviews.
 * It only ever fires on fields that were empty, so nothing typed is overwritten.
 */
export const NewCustomerField = forwardRef<HTMLInputElement, INewCustomerFieldProps>(
  function NewCustomerField(
    {
      id,
      label,
      note,
      value,
      onChange,
      placeholder,
      mono,
      flash,
      adornment,
      disabled,
      inputMode,
      type = "text",
      invalid,
      describedBy,
      children,
    },
    ref,
  ) {
    return (
      <div className="min-w-0">
        <div className="mb-1.5 flex items-baseline gap-[7px]">
          <label
            htmlFor={id}
            className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground"
          >
            {label}
          </label>
          {note && <span className="text-[10.5px] text-muted-foreground/70">{note}</span>}
        </div>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={type}
            inputMode={inputMode}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "w-full rounded-[7px] border bg-muted/40 px-3 py-2.5 text-foreground outline-none",
              "placeholder:font-normal placeholder:text-muted-foreground/60",
              // The flash fades out slowly on purpose — long enough to be seen,
              // short enough not to look like a permanent state.
              "[transition:border-color_150ms,box-shadow_150ms,background-color_700ms]",
              "focus:border-primary focus:ring-[3px] focus:ring-primary/15",
              "disabled:cursor-not-allowed disabled:opacity-50",
              mono
                ? "font-display text-base font-bold tabular-nums tracking-[0.03em]"
                : "text-sm font-semibold",
              flash ? "border-primary/70 bg-primary/10" : "border-border",
              invalid && "border-severity-critical",
              adornment ? "pr-10" : "pr-3",
            )}
          />
          {adornment && (
            <span className="pointer-events-none absolute right-[11px] top-1/2 flex -translate-y-1/2">
              {adornment}
            </span>
          )}
        </div>
        {children}
      </div>
    );
  },
);
