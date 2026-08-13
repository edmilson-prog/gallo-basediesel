import { useQuery } from "@tanstack/react-query";
import { useNpsProvider } from "@/providers/data";
import { classifyScore } from "../engine";
import { useNpsSettings } from "../hooks/useNpsSettings";

/**
 * "NPS 9 · Promotor" on the customer fiche header.
 *
 * Renders nothing when the customer has no answer in the last 12 months. An
 * older score says more about who the company was than about this
 * relationship, and a "sem NPS" chip would only add noise to a header that
 * already competes for attention.
 */

const TWELVE_MONTHS_MS = 365 * 86_400_000;

const CLASS_LABEL = {
  promoter: "Promotor",
  passive: "Neutro",
  detractor: "Detrator",
} as const;

const CLASS_TONE = {
  promoter: "bg-severity-success/15 text-severity-success",
  passive: "bg-severity-warning/15 text-severity-warning",
  detractor: "bg-severity-critical/15 text-severity-critical",
} as const;

export function CustomerNpsBadge({ customerId }: { customerId: string }) {
  const provider = useNpsProvider();
  const settings = useNpsSettings();

  const { data } = useQuery({
    queryKey: ["nps", "customer", customerId],
    queryFn: () => provider.latestForCustomer(customerId),
    enabled: Boolean(customerId),
  });

  // "Selo na ficha do cliente" in the panel's Parâmetros tab. While the
  // settings are still loading the badge stays hidden rather than appearing
  // and then vanishing — a flash of a score is worse than a slower one.
  if (settings.data && !settings.data.showOnFiche) return null;

  if (!data || data.score === null || !data.respondedAt) return null;

  const answeredAt = new Date(data.respondedAt).getTime();
  if (Date.now() - answeredAt > TWELVE_MONTHS_MS) return null;

  const npsClass = classifyScore(data.score);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CLASS_TONE[npsClass]}`}
      title={`Última pesquisa respondida em ${new Date(data.respondedAt).toLocaleDateString("pt-BR")}`}
    >
      NPS {data.score} · {CLASS_LABEL[npsClass]}
    </span>
  );
}
