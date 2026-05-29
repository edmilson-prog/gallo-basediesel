import type { ExpenseStatus } from "@/shared/types";
import { cn } from "@/lib/utils";
import { EXPENSE_STATUS_LABELS } from "../i18n/pt-BR";

const STATUS_CLASSES: Record<ExpenseStatus, string> = {
  pago: "bg-success/10 text-success border-success/30",
  pendente: "bg-warning/10 text-warning border-warning/30",
  atrasado: "bg-destructive/10 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground border-border",
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status],
      )}
    >
      {EXPENSE_STATUS_LABELS[status]}
    </span>
  );
}
