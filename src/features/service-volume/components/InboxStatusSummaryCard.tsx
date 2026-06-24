import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAtendimentoMetricsProvider } from "@/providers/data";
import { StatusDistributionDonut } from "./StatusDistributionDonut";

export function InboxStatusSummaryCard() {
  const canView = usePermission("service_volume", "view");
  const navigate = useNavigate();
  const provider = useAtendimentoMetricsProvider();
  const { data } = useQuery({
    queryKey: ["sv", "status", "inbox-card"],
    queryFn: () => {
      // all-time window: the card shows a live status snapshot, not filtered by the dashboard period
      return provider.getStatusDistribution({
        from: "2000-01-01T00:00:00Z",
        to: "2100-01-01T00:00:00Z",
        granularity: "day",
      });
    },
    enabled: canView,
    staleTime: 60_000,
  });

  if (!canView || !data || data.total === 0) return null;

  return (
    <button
      type="button"
      onClick={() => void navigate({ to: "/app/inicio", search: { aba: "atendimento" } as never })}
      className="block w-full cursor-pointer border-b border-border px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      aria-label="Abrir painel de atendimento"
    >
      <StatusDistributionDonut data={data} compact />
    </button>
  );
}
