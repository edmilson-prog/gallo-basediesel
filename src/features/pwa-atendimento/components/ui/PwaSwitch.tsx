import { cn } from "@/lib/utils";

interface IPwaSwitchProps {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Full-width preference row with the track/knob toggle from the kit. */
export function PwaSwitch({ on, onChange, label, hint, disabled = false }: IPwaSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "flex min-h-[60px] w-full items-center gap-3 border-b border-border py-3 text-left",
        disabled && "opacity-50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-[27px] w-[46px] shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-foreground/[0.09] ring-1 ring-inset ring-border",
        )}
      >
        <span
          className={cn(
            "absolute top-[3.5px] h-5 w-5 rounded-full transition-[left]",
            on ? "left-[22px] bg-primary-foreground" : "left-[3.5px] bg-muted-foreground",
          )}
        />
      </span>
    </button>
  );
}
