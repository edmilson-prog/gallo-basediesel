import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ICommission } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useCommissionsProvider } from "@/providers/data";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";
import { DisputeDialog } from "./DisputeDialog";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

interface IProps {
  commissions: ICommission[];
  canContest: boolean;
  onContestDone: () => void;
}

export function CommissionsMyOrdersTable({ commissions, canContest, onContestDone }: IProps) {
  const provider = useCommissionsProvider();
  const { currentUser } = useAuth();
  const [disputing, setDisputing] = useState<ICommission | null>(null);

  const handleSubmitDispute = async (reason: string) => {
    if (!disputing || !currentUser) return;
    try {
      const updated = await provider.openDispute({
        commissionId: disputing.id,
        reason,
        actorId: currentUser.id,
      });
      auditLog({
        action: "commission.dispute_open",
        resource: "commission",
        resourceId: disputing.id,
        before: { status: disputing.status },
        after: { status: updated.status, reason },
        storeId: disputing.storeId,
      });
      toast.success("Contestação registrada", {
        icon: <Icon icon="mdi:flag-outline" size={14} />,
      });
      setDisputing(null);
      onContestDone();
    } catch {
      toast.error("Não foi possível registrar a contestação.");
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-foreground">{S.drillTitle}</h2>
          <span className="text-xs text-muted-foreground">
            {commissions.length} {commissions.length === 1 ? "comissão" : "comissões"}
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left">{S.tableHeaders.order}</th>
                <th className="px-3 py-2 text-left">{S.tableHeaders.paidAt}</th>
                <th className="px-3 py-2 text-right">{S.tableHeaders.base}</th>
                <th className="px-3 py-2 text-right">{S.tableHeaders.rate}</th>
                <th className="px-3 py-2 text-right">{S.tableHeaders.goalBonus}</th>
                <th className="px-3 py-2 text-right">{S.tableHeaders.total}</th>
                <th className="px-3 py-2 text-left">{S.tableHeaders.status}</th>
                <th className="px-5 py-2 text-right">{S.tableHeaders.actions}</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-5 py-3 text-foreground">
                    <Link
                      to="/app/pedidos/$id"
                      params={{ id: c.orderId }}
                      className="font-medium text-primary hover:underline"
                    >
                      #{c.orderId.replace(/^order-/, "PD-")}
                    </Link>
                    {c.isSplit && (
                      <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning-foreground">
                        Split
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    {c.paidAt
                      ? dateFmt.format(new Date(c.paidAt))
                      : dateFmt.format(new Date(c.calculatedAt))}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {money.format(c.baseValue)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {(c.rate * 100).toFixed(2)}%
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {c.goalBonus > 0 ? money.format(c.goalBonus) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-foreground">
                    {money.format(c.totalCommission)}
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {canContest &&
                    (c.status === "calculated" || c.status === "approved") &&
                    !c.disputeReason ? (
                      <Button size="sm" variant="ghost" onClick={() => setDisputing(c)}>
                        <Icon icon="mdi:flag-outline" size={14} />
                        <span className="ml-1.5">{S.disputeButton}</span>
                      </Button>
                    ) : c.status === "disputed" ? (
                      <span className="text-xs text-warning-foreground">
                        <Icon icon="mdi:flag" size={12} className="mr-1 inline align-text-bottom" />
                        Aguardando análise
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <DisputeDialog
        open={Boolean(disputing)}
        onClose={() => setDisputing(null)}
        onSubmit={handleSubmitDispute}
      />
    </>
  );
}

function StatusPill({ status }: { status: ICommission["status"] }) {
  const label = S.statusLabels[status];
  const cls =
    status === "paid"
      ? "bg-success/15 text-success-foreground"
      : status === "approved"
        ? "bg-info/15 text-info"
        : status === "disputed"
          ? "bg-warning/15 text-warning-foreground"
          : status === "canceled"
            ? "bg-muted text-muted-foreground line-through"
            : "bg-muted text-foreground";
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{label}</span>;
}
