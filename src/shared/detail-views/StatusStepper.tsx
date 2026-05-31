import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

export interface IStepperStep {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
}

export interface IStepperTerminal {
  label: string;
  tone: "bad" | "warn";
}

export interface IStatusStepperProps {
  steps: IStepperStep[];
  /** Off-path terminal state (canceled/returned/rejected/expired) — replaces the track. */
  terminal?: IStepperTerminal | null;
  className?: string;
}

/** Horizontal status stepper. When `terminal` is set, shows a single off-path callout. */
export function StatusStepper({ steps, terminal, className }: IStatusStepperProps) {
  if (terminal) {
    const tone =
      terminal.tone === "bad"
        ? "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
        : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300";
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border p-3 text-sm font-medium",
          tone,
          className,
        )}
      >
        <Icon icon="mdi:flag-checkered" size={18} />
        {terminal.label}
      </div>
    );
  }
  return (
    <ol className={cn("flex items-center", className)}>
      {steps.map((step, i) => (
        <li key={step.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                step.state === "done" && "border-primary bg-primary text-primary-foreground",
                step.state === "current" && "border-primary text-primary ring-2 ring-primary/30",
                step.state === "todo" && "border-border text-muted-foreground",
              )}
            >
              {step.state === "done" ? <Icon icon="mdi:check" size={13} /> : i + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-xs font-medium",
                step.state === "todo" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span
              className={cn("mx-2 h-px flex-1", step.state === "done" ? "bg-primary" : "bg-border")}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
