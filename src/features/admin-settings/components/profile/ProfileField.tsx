import { useId } from "react";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface IProfileFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** Iconify name rendered inside the field, on the left. */
  icon?: string;
  /** Helper line under the field. */
  hint?: string;
  /** Renders the hint as an error (used by the confirm-password field). */
  hintTone?: "muted" | "critical";
  /** Small badge rendered next to the label (e.g. "verificado"). */
  badge?: React.ReactNode;
  readOnly?: boolean;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "password";
  autoComplete?: string;
}

/**
 * Labelled input used across "Meu perfil": uppercase micro-label, optional
 * leading icon, badge slot and helper line.
 */
export function ProfileField({
  label,
  value,
  onChange,
  icon,
  hint,
  hintTone = "muted",
  badge,
  readOnly = false,
  placeholder,
  type = "text",
  autoComplete,
}: IProfileFieldProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label
          htmlFor={id}
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
        >
          {label}
        </Label>
        {badge}
      </div>
      <div className="relative flex items-center">
        {icon && (
          <Icon
            icon={icon}
            aria-hidden
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
          />
        )}
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(
            "h-11",
            icon && "pl-10",
            readOnly && "cursor-default bg-muted/40 text-muted-foreground",
          )}
        />
      </div>
      {hint && (
        <p
          className={cn(
            "text-xs leading-snug",
            hintTone === "critical" ? "text-severity-critical" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
