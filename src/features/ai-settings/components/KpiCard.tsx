import { Icon } from "@/components/Icon";

interface KpiCardProps {
  icon: string;
  label: string;
  value: string;
  delta?: { text: string; positive: boolean };
  progressPct?: number;
}

export function KpiCard({ icon, label, value, delta, progressPct }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon={icon} className="size-4" aria-hidden /> {label}
      </p>
      <p className="mt-2 text-2xl font-semibold leading-none">{value}</p>
      {delta && (
        <p
          className={`mt-2 text-xs ${delta.positive ? "text-severity-success" : "text-severity-critical"}`}
        >
          {delta.text}
        </p>
      )}
      {typeof progressPct === "number" && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(100, Math.round(progressPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}
