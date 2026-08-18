import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import type { ICustomerCredit } from "../../engine/customerCredit";

const COPY = CUSTOMER_STRINGS.detail.credit;

export interface ICustomerCreditCellProps {
  customer: ICustomer;
  /** Null when no limit was ever defined — the cell offers to define one. */
  credit: ICustomerCredit | null;
}

/**
 * Credit limit cell of the commercial band.
 *
 * The limit is stored (`customers.credit_limit`); the consumed portion is
 * derived from orders whose payment is still open. There is no accounts
 * receivable module, so the usage bar only appears once a limit exists — an
 * empty gauge would imply a number the platform does not have.
 */
export function CustomerCreditCell({ customer, credit }: ICustomerCreditCellProps) {
  const provider = useCustomersProvider();
  const queryClient = useQueryClient();
  const { currentUser, hasRole } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Same predicate the overflow menu uses for "Editar dados", which mirrors the
  // RLS `customers_update` policy: staff, or the wallet owner.
  const canEdit = usePermission("customer", "edit");
  const isWalletOwner = currentUser?.sellerId != null && customer.sellerId === currentUser.sellerId;
  const canEditCredit = canEdit && (hasRole(["Owner", "Gestor"]) || isWalletOwner);

  const startEditing = () => {
    setDraft(credit ? String(credit.limit) : "");
    setEditing(true);
  };

  const save = async (nextLimit: number | undefined) => {
    setSaving(true);
    const before = { creditLimit: customer.creditLimit };
    try {
      await provider.update(customer.id, { creditLimit: nextLimit });
      auditLog({
        action: "customer.set_credit_limit",
        resource: "customer",
        resourceId: customer.id,
        before,
        after: { creditLimit: nextLimit },
      });
      await queryClient.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
      toast.success(COPY.savedToast);
      setEditing(false);
    } catch {
      toast.error(COPY.errorToast);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    const normalized = draft.trim().replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);
    if (normalized === "" || !Number.isFinite(value) || value < 0) {
      toast.error(COPY.invalid);
      return;
    }
    void save(value);
  };

  if (editing) {
    return (
      <div className="min-w-[210px]">
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
          {COPY.label}
        </span>
        <div className="mt-1 flex items-center gap-1">
          <Input
            autoFocus
            inputMode="decimal"
            value={draft}
            placeholder={COPY.placeholder}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-7 w-28 text-sm"
            aria-label={COPY.edit}
          />
          <Button
            size="icon"
            className="h-7 w-7"
            disabled={saving}
            onClick={handleSubmit}
            aria-label={COPY.save}
          >
            <Icon icon="mdi:check" size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={saving}
            onClick={() => setEditing(false)}
            aria-label={COPY.cancel}
          >
            <Icon icon="mdi:close" size={14} />
          </Button>
          {credit && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              disabled={saving}
              onClick={() => void save(undefined)}
              aria-label={COPY.remove}
              title={COPY.remove}
            >
              <Icon icon="mdi:delete-outline" size={14} />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!credit) {
    return (
      <div className="min-w-0">
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
          {COPY.label}
        </span>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-xl font-bold leading-none text-muted-foreground/70">
            {COPY.none}
          </span>
          {canEditCredit && (
            <button
              type="button"
              onClick={startEditing}
              className="rounded text-[11px] font-semibold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {COPY.define} →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-[200px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
          {COPY.label}
        </span>
        <div className="flex items-center gap-1">
          {credit.source === "erp" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="rounded border border-border px-1 text-[8.5px] font-bold tracking-wider text-muted-foreground">
                  ERP
                </span>
              </TooltipTrigger>
              <TooltipContent>{COPY.erpHint}</TooltipContent>
            </Tooltip>
          )}
          {canEditCredit && (
            <button
              type="button"
              onClick={startEditing}
              aria-label={COPY.edit}
              title={COPY.edit}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Icon icon="mdi:pencil-outline" size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-xl font-bold leading-none tabular-nums text-foreground">
          {formatBRL(credit.free)}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {COPY.free(formatBRL(credit.limit))}
        </span>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  credit.usedPct > 85 ? "bg-severity-critical" : "bg-primary",
                )}
                style={{ width: `${credit.usedPct}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {COPY.usedPct(credit.usedPct)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{COPY.usedHint}</TooltipContent>
      </Tooltip>
    </div>
  );
}
