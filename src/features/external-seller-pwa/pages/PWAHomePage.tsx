import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { formatBRLCompact, formatDateTimeBR } from "@/shared/utils/format";
import { useQuotesProvider } from "@/providers/data";
import { usePwaAuth } from "../hooks/usePwaAuth";
import { usePwaVisits } from "../hooks/usePwaVisits";
import { PWABanner } from "../components/PWABanner";
import { customerLabel } from "../utils/customerLabel";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function PWAHomePage() {
  const { session } = usePwaAuth();
  const sellerId = session?.sellerId;
  const { visits } = usePwaVisits(sellerId);
  const quotesProvider = useQuotesProvider();

  const quotesQuery = useQuery({
    queryKey: ["pwa", "quotes", sellerId] as const,
    enabled: Boolean(sellerId),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await quotesProvider.list({ sellerId, pageSize: 100 });
      return result.data;
    },
  });

  const quotes = quotesQuery.data ?? [];
  const visitsToday = visits.filter(
    (v) => isToday(v.scheduledAt) && v.status === "agendada",
  ).length;
  const sentQuotes = quotes.filter((q) => q.status === "enviado").length;
  const pipeline = quotes
    .filter((q) => q.status === "enviado" || q.status === "rascunho")
    .reduce((acc, q) => acc + q.total, 0);

  const upcoming = visits.filter((v) => v.status === "agendada").slice(0, 4);
  const recentQuotes = [...quotes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted-foreground">{S.appName}</p>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {S.homeGreeting(session?.sellerName ?? "Vendedor")}
        </h1>
      </header>

      <PWABanner />

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-primary">{visitsToday}</p>
          <p className="text-[11px] text-muted-foreground">{S.kpiVisitsToday}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-primary">{sentQuotes}</p>
          <p className="text-[11px] text-muted-foreground">{S.kpiQuotesSent}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold tabular-nums text-primary">
            {formatBRLCompact(pipeline)}
          </p>
          <p className="text-[11px] text-muted-foreground">{S.kpiPipeline}</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild className="h-12">
          <Link to="/pwa/orcamento-rapido">
            <Icon icon="mdi:file-document-plus" size={18} className="mr-1.5" aria-hidden />
            {S.shortcutNewQuote}
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link to="/pwa/agenda/nova">
            <Icon icon="mdi:calendar-plus" size={18} className="mr-1.5" aria-hidden />
            {S.shortcutNewVisit}
          </Link>
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">{S.upcomingVisits}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.emptyVisits}</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((v) => (
              <Card key={v.id} className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon icon="mdi:map-marker" size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {customerLabel(v.customer)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTimeBR(v.scheduledAt)}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">{S.pendingQuotes}</h2>
        {recentQuotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.emptyQuotes}</p>
        ) : (
          <div className="space-y-2">
            {recentQuotes.map((q) => (
              <Card key={q.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold text-foreground">
                    {q.number}
                  </p>
                  <p className="text-xs text-muted-foreground">{q.status}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatBRLCompact(q.total)}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
