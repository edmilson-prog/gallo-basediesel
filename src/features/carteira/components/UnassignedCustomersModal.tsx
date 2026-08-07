import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { sellerShortName } from "../utils/sellerDisplay";

/** Rows rendered in the preview list before it says "and N more". */
const PREVIEW_LIMIT = 10;

/**
 * Customers updated per wave. There is no batch-assign endpoint, so this walks
 * `update()` one customer at a time; a small wave keeps the browser from firing
 * hundreds of parallel requests at PostgREST while still finishing quickly.
 */
const WAVE_SIZE = 8;

export interface IUnassignedCustomersModalProps {
  open: boolean;
  storeId: ID | undefined;
  sellers: ISeller[];
  onClose: () => void;
}

/**
 * Puts customers with no wallet owner back into a wallet.
 *
 * Only the "one seller takes all of them" mode is offered. Round-robin by city
 * proximity and one-by-one triage were both in the design, but neither has an
 * engine behind it — offering a button that quietly did something else would be
 * worse than not offering it at all.
 */
export function UnassignedCustomersModal({
  open,
  storeId,
  sellers,
  onClose,
}: IUnassignedCustomersModalProps) {
  const strings = CARTEIRA_STRINGS.unassignedModal;
  const provider = useCustomersProvider();
  const queryClient = useQueryClient();
  const [targetSellerId, setTargetSellerId] = useState<string>("");

  const query = useQuery({
    queryKey: ["carteira-unassigned-customers", storeId ?? null],
    queryFn: () => provider.list({ storeId, unassignedOnly: true, pageSize: FETCH_ALL_PAGE_SIZE }),
    enabled: open,
    staleTime: 30_000,
  });

  const customers: ICustomer[] = query.data?.data ?? [];
  const target = sellers.find((s) => s.id === targetSellerId);

  const distribute = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("no target seller");
      let ok = 0;
      let failed = 0;
      for (let i = 0; i < customers.length; i += WAVE_SIZE) {
        const wave = customers.slice(i, i + WAVE_SIZE);
        const results = await Promise.allSettled(
          wave.map((c) => provider.update(c.id, { sellerId: target.id })),
        );
        for (const r of results) {
          if (r.status === "fulfilled") ok += 1;
          else failed += 1;
        }
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      if (failed === 0) {
        toast.success(strings.successToast(ok, sellerShortName(target?.fullName ?? "")));
      } else if (ok > 0) {
        toast.warning(strings.partialToast(ok, failed));
      } else {
        toast.error(strings.failureToast);
      }
      void queryClient.invalidateQueries({ queryKey: ["carteira-wallet-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["carteira-unassigned-customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      onClose();
    },
    onError: () => toast.error(strings.failureToast),
  });

  const total = query.data?.total ?? customers.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:account-off-outline" size={18} className="text-severity-critical" />
            {strings.title}
          </DialogTitle>
          <DialogDescription>{strings.subtitle(total)}</DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Icon icon="mdi:loading" size={16} className="animate-spin" /> Carregando…
          </div>
        ) : customers.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{strings.empty}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="unassigned-target">{strings.pickSeller}</Label>
              <Select value={targetSellerId} onValueChange={setTargetSellerId}>
                <SelectTrigger id="unassigned-target">
                  <SelectValue placeholder={strings.pickSellerPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                {strings.preview}
              </div>
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {customers.slice(0, PREVIEW_LIMIT).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                    <Icon
                      icon="mdi:office-building-outline"
                      size={14}
                      className="shrink-0 text-muted-foreground/70"
                    />
                    <span className="truncate text-[12.5px] text-foreground/70">
                      {getCustomerName(c)}
                    </span>
                  </li>
                ))}
              </ul>
              {total > PREVIEW_LIMIT && (
                <div className="mt-1.5 text-xs text-muted-foreground/70">
                  {strings.previewMore(PREVIEW_LIMIT, total)}
                </div>
              )}
            </div>

            {target && (
              <div className="flex gap-2.5 rounded-lg border border-border bg-foreground/[0.03] px-3.5 py-3">
                <Icon
                  icon="mdi:information-outline"
                  size={15}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="text-[12.5px] leading-relaxed text-foreground/70">
                  {strings.explanation(customers.length, sellerShortName(target.fullName))}
                </span>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {CARTEIRA_STRINGS.modals.revert.cancel}
          </Button>
          <Button
            type="button"
            disabled={!target || customers.length === 0 || distribute.isPending}
            onClick={() => distribute.mutate()}
          >
            {distribute.isPending ? strings.submitting : strings.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
