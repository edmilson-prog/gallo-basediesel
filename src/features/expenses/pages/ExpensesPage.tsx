import { useMemo, useState } from "react";
import type { IExpense } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { EXPENSES_STRINGS as S } from "../i18n/pt-BR";
import { buildMonthOptions } from "../utils/period";
import { useExpensesFilters } from "../hooks/useExpensesFilters";
import { useExpensesData } from "../hooks/useExpensesData";
import { useExpenseMutations } from "../hooks/useExpenseMutations";
import { useExpenseStatusTimer } from "../hooks/useExpenseStatusTimer";
import { ExpensesFilters } from "../components/ExpensesFilters";
import { ExpenseKpis } from "../components/ExpenseKpis";
import { ExpensesTable } from "../components/ExpensesTable";
import { ExpenseFormDialog } from "../components/ExpenseFormDialog";
import { MarkPaidDialog } from "../components/MarkPaidDialog";
import { CancelExpenseDialog } from "../components/CancelExpenseDialog";

/**
 * Expenses management page (`/app/gestao/despesas`) — PRD-054.
 *
 * Owner / Financeiro get full CRUD; Gestor sees a read-only view. The route
 * guard blocks everyone else.
 */
export function ExpensesPage() {
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";
  const canWrite = userRole === "Owner" || userRole === "Financeiro";
  const createdBy = currentUser?.id ?? "system";

  const ctl = useExpensesFilters();
  const { expenses, kpis, isLoading, refetch } = useExpensesData({ storeId, filters: ctl.filters });
  const mutations = useExpenseMutations();
  useExpenseStatusTimer();

  const monthOptions = useMemo(() => buildMonthOptions(12), []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IExpense | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<IExpense | null>(null);
  const [cancelTarget, setCancelTarget] = useState<IExpense | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (expense: IExpense) => {
    setEditing(expense);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <ExpensesFilters ctl={ctl} monthOptions={monthOptions} canCreate={canWrite} onNew={openNew} />

      {!canWrite && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Icon icon="mdi:eye-outline" size={14} />
          {S.readOnlyBanner}
        </div>
      )}

      <ExpenseKpis kpis={kpis} />

      {isLoading ? (
        <Card className="p-5">
          <Skeleton className="h-80 w-full" />
        </Card>
      ) : expenses.length === 0 ? (
        <Card className="p-12 text-center">
          <Icon icon="mdi:cash-remove" size={36} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{S.empty}</p>
        </Card>
      ) : (
        <ExpensesTable
          expenses={expenses}
          canWrite={canWrite}
          onEdit={openEdit}
          onMarkPaid={setMarkPaidTarget}
          onDuplicate={(e) => void mutations.duplicate(e, createdBy).then(() => refetch())}
          onCancel={setCancelTarget}
        />
      )}

      {canWrite && (
        <>
          <ExpenseFormDialog
            open={formOpen}
            expense={editing}
            storeId={storeId}
            createdBy={createdBy}
            onOpenChange={setFormOpen}
            onCreate={mutations.create}
            onUpdate={mutations.update}
            onUpdateSeries={mutations.updateSeries}
            onSaved={refetch}
          />
          <MarkPaidDialog
            expense={markPaidTarget}
            onOpenChange={(open) => !open && setMarkPaidTarget(null)}
            onConfirm={async (input) => {
              if (!markPaidTarget) return;
              await mutations.markPaid({ id: markPaidTarget.id, ...input });
              refetch();
            }}
          />
          <CancelExpenseDialog
            expense={cancelTarget}
            onOpenChange={(open) => !open && setCancelTarget(null)}
            onConfirm={async (input) => {
              if (!cancelTarget) return;
              await mutations.cancelSeries({ id: cancelTarget.id, ...input });
              refetch();
            }}
          />
        </>
      )}
    </div>
  );
}
