import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

interface IPwaFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  icon?: string;
  /** Trailing control (e.g. the show/hide password toggle). */
  right?: ReactNode;
}

/** Labelled text field in the kit's shape: 52px tall, gold ring on focus. */
export function PwaField({ label, icon, right, id, ...input }: IPwaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="mb-[7px] block text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex h-[52px] items-center gap-2.5 rounded bg-foreground/[0.05] px-3 transition-shadow",
          focused ? "ring-2 ring-inset ring-primary" : "ring-1 ring-inset ring-border",
        )}
      >
        {icon && (
          <Icon
            icon={icon}
            size={17}
            className={focused ? "text-primary" : "text-muted-foreground"}
          />
        )}
        <input
          id={fieldId}
          {...input}
          onFocus={(event) => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            input.onBlur?.(event);
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15.5px] font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {right}
      </div>
    </div>
  );
}
