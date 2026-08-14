import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface INewPartFieldProps {
  id: string;
  label: string;
  /** Lowercase aside next to the label ("opcional", "da nota do fornecedor"). */
  note?: string | null;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Codes and numbers carry the condensed display face, like the kit. */
  mono?: boolean;
  /** `id` of a `<datalist>` offering known values. */
  list?: string;
  /** Bigger type and padding — the code field leads the page. */
  size?: "md" | "lg";
  type?: string;
  inputMode?: "text" | "numeric" | "decimal";
  step?: string;
  min?: string;
  /** Adornment pinned to the right edge (status icon / spinner / unit). */
  adornment?: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  /** Rendered under the field — hint, error, status line. */
  children?: ReactNode;
  className?: string;
}

/**
 * Labelled input of the "Nova peça" form.
 *
 * Same shape as the "Novo cliente" field so the two creation forms read as one
 * product: micro-label above, status underneath, adornment inside the box.
 */
export const NewPartField = forwardRef<HTMLInputElement, INewPartFieldProps>(function NewPartField(
  {
    id,
    label,
    note,
    required,
    value,
    onChange,
    placeholder,
    mono,
    list,
    size = "md",
    type = "text",
    inputMode,
    step,
    min,
    adornment,
    invalid,
    disabled,
    autoFocus,
    describedBy,
    children,
    className,
  },
  ref,
) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline gap-[7px]">
        <label
          htmlFor={id}
          className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground"
        >
          {label}
          {required && <span className="ml-1 text-primary">*</span>}
        </label>
        {note && <span className="text-[10.5px] text-muted-foreground/70">{note}</span>}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={type}
          inputMode={inputMode}
          step={step}
          min={min}
          list={list}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-[7px] border bg-muted/40 text-foreground outline-none",
            "placeholder:font-normal placeholder:text-muted-foreground/60",
            "[transition:border-color_150ms,box-shadow_150ms]",
            "focus:border-primary focus:ring-[3px] focus:ring-primary/15",
            "disabled:cursor-not-allowed disabled:opacity-50",
            size === "lg" ? "px-3.5 py-3" : "px-3 py-2.5",
            mono
              ? cn(
                  "font-display font-bold tabular-nums tracking-[0.03em]",
                  size === "lg" ? "text-[19px]" : "text-base",
                )
              : cn("font-semibold", size === "lg" ? "text-[15px]" : "text-sm"),
            invalid ? "border-severity-critical" : "border-border",
            adornment ? "pr-10" : undefined,
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
});
