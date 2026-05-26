import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { daysUntil, validityBucket } from "../utils/quoteTotals";

export function ValidityIndicator({
  validUntil,
  className,
}: {
  validUntil: string;
  className?: string;
}) {
  const bucket = validityBucket(validUntil);
  const days = daysUntil(validUntil);

  if (bucket === "expired") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-300",
          className,
        )}
      >
        <Icon icon="mdi:clock-alert-outline" size={14} />
        Expirado
      </span>
    );
  }

  const label = days === 0 ? "hoje" : days === 1 ? "1 dia" : `${days} dias`;

  const colorClass =
    bucket === "critical"
      ? "text-rose-600 dark:text-rose-300"
      : bucket === "warning"
        ? "text-orange-600 dark:text-orange-300"
        : "text-emerald-600 dark:text-emerald-300";

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-medium", colorClass, className)}
    >
      <Icon icon="mdi:clock-outline" size={14} />
      {label}
    </span>
  );
}
