import { useQuery } from "@tanstack/react-query";
import type { ICarteiraTransfer, ICustomer } from "@/shared/types";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useTransfersProvider } from "@/providers/data/hooks/useTransfersProvider";
import { Icon } from "@/components/Icon";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { formatDate } from "../utils/formatters";

export interface ICoverageBannerProps {
  customer: ICustomer;
}

/**
 * Banner exibido na ficha do cliente quando há cobertura temporária ativa
 * sobre ele. Resolve a transferência em vigência consultando `transfers` com
 * `type='temporary'`, `status='active'` e `customerIds` contendo este cliente.
 */
export function CoverageBanner({ customer }: ICoverageBannerProps) {
  const transfersProvider = useTransfersProvider();
  const sellersProvider = useSellersProvider();

  const transfersQuery = useQuery({
    queryKey: ["coverage-banner", customer.id, customer.storeId],
    queryFn: async () => {
      const result = await transfersProvider.list({
        storeId: customer.storeId,
        statuses: ["active"],
        types: ["temporary"],
        pageSize: 100,
      });
      return result.data.filter((t: ICarteiraTransfer) => t.customerIds.includes(customer.id));
    },
    staleTime: 30_000,
  });

  const active = transfersQuery.data?.[0];

  const sellersQuery = useQuery({
    queryKey: ["coverage-banner-seller", active?.fromSellerId ?? null, customer.storeId],
    queryFn: async () => {
      if (!active) return null;
      const result = await sellersProvider.list({ storeId: customer.storeId });
      return result.find((s) => s.id === active.fromSellerId) ?? null;
    },
    enabled: Boolean(active),
    staleTime: 60_000,
  });

  if (!active) return null;

  const titular = sellersQuery.data?.fullName ?? active.fromSellerId;
  const message = active.endDate
    ? CARTEIRA_STRINGS.banner.coverage(titular, formatDate(active.endDate))
    : CARTEIRA_STRINGS.banner.coverageNoDate(titular);

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
    >
      <Icon icon="mdi:clock-time-five-outline" size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
