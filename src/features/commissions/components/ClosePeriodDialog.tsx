import { useState } from "react";
import { toast } from "sonner";
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useCommissionsProvider } from "@/providers/data";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";
import { labelForPeriod } from "../utils/periods";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface IProps {
  storeId: ID;
  period: string;
  totalToPay: number;
  eligibleCount: number;
  onClosed: () => void;
}

export function ClosePeriodDialog({
  storeId,
  period,
  totalToPay,
  eligibleCount,
  onClosed,
}: IProps) {
  const provider = useCommissionsProvider();
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!currentUser) return;
    setBusy(true);
    try {
      const updated = await provider.closeMonthlyPeriod({
        storeId,
        period,
        approvedBy: currentUser.id,
      });
      auditLog({
        action: "commission.close_period",
        resource: "commission",
        resourceId: storeId,
        after: { period, count: updated.length, totalApproved: totalToPay },
        storeId,
      });
      toast.success(`Período ${labelForPeriod(period)} fechado.`, {
        icon: <Icon icon="mdi:lock" size={14} />,
      });
      onClosed();
      setOpen(false);
    } catch {
      toast.error("Não foi possível fechar o período.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Icon icon="mdi:lock-outline" size={14} />
          <span className="ml-1.5">{S.closePeriodButton}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.closePeriodConfirmTitle}</DialogTitle>
          <DialogDescription>{S.closePeriodConfirmDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Período</span>
            <span className="font-medium text-foreground">{labelForPeriod(period)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Comissões em apuração</span>
            <span className="font-medium text-foreground">{eligibleCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total a aprovar</span>
            <span className="text-base font-semibold text-foreground">
              {money.format(totalToPay)}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {S.closePeriodCancel}
          </Button>
          <Button onClick={handleConfirm} disabled={busy || eligibleCount === 0}>
            {busy ? "Fechando…" : S.closePeriodCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
