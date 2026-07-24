import { cn } from "@/lib/utils";
import { greetingLabel } from "../engine/formatters";
import type { SellerPeriodKey } from "../engine/period";

interface ISellerGreetingProps {
  firstName: string;
  period: SellerPeriodKey;
  onPeriodChange: (period: SellerPeriodKey) => void;
  now?: Date;
}

const PERIOD_OPTIONS: { key: SellerPeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

export function SellerGreeting({
  firstName,
  period,
  onPeriodChange,
  now = new Date(),
}: ISellerGreetingProps) {
  const dateLabel = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-xs capitalize text-muted-foreground">{dateLabel}</p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
          {greetingLabel(now.getHours())}, {firstName}. <span className="text-primary">Seu painel.</span>
        </h1>
      </div>
      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onPeriodChange(opt.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              period === opt.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
