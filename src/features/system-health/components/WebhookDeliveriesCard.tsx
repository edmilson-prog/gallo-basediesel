import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IWebhookDelivery, IWebhookDeliveryFilters, WebhookDeliveryOutcome } from "@/shared/types";
import { useWebhookDeliveries, useWebhookDeliveryAccountOptions } from "../hooks/useWebhookDeliveries";
import { WebhookDeliveryDetailDialog } from "./WebhookDeliveryDetailDialog";
import { SYSTEM_HEALTH_STRINGS as S } from "../i18n/pt-BR";

const OUTCOME_LABEL: Record<WebhookDeliveryOutcome, string> = {
  processed: S.webhooksOutcomeProcessed,
  ignored: S.webhooksOutcomeIgnored,
  duplicate: S.webhooksOutcomeDuplicate,
  error: S.webhooksOutcomeError,
  rejected: S.webhooksOutcomeRejected,
};

const OUTCOME_VARIANT: Record<WebhookDeliveryOutcome, "default" | "secondary" | "destructive" | "outline"> = {
  processed: "default",
  ignored: "secondary",
  duplicate: "secondary",
  error: "destructive",
  rejected: "destructive",
};

type PeriodOption = "24h" | "7d" | "30d";

const PERIOD_HOURS: Record<PeriodOption, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

export function WebhookDeliveriesCard() {
  const [outcome, setOutcome] = useState<WebhookDeliveryOutcome | "all">("all");
  const [accountId, setAccountId] = useState<string | "all">("all");
  const [period, setPeriod] = useState<PeriodOption>("24h");
  const [selected, setSelected] = useState<IWebhookDelivery | null>(null);
  const accountsQuery = useWebhookDeliveryAccountOptions();

  const filters = useMemo<IWebhookDeliveryFilters>(() => {
    const f: IWebhookDeliveryFilters = {
      fromDate: new Date(Date.now() - PERIOD_HOURS[period] * 60 * 60_000).toISOString(),
    };
    if (outcome !== "all") f.outcome = outcome;
    if (accountId !== "all") f.accountId = accountId;
    return f;
  }, [outcome, accountId, period]);

  const query = useWebhookDeliveries(filters);
  const deliveries = query.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{S.webhooksCardTitle}</CardTitle>
          <CardDescription>{S.webhooksCardSubtitle}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={accountId} onValueChange={(v) => setAccountId(v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder={S.webhooksFilterAccount} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.webhooksFilterAllAccounts}</SelectItem>
              {(accountsQuery.data ?? []).map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder={S.webhooksFilterPeriod} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">{S.webhooksPeriod24h}</SelectItem>
              <SelectItem value="7d">{S.webhooksPeriod7d}</SelectItem>
              <SelectItem value="30d">{S.webhooksPeriod30d}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as WebhookDeliveryOutcome | "all")}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder={S.webhooksFilterOutcome} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.webhooksFilterAll}</SelectItem>
              <SelectItem value="processed">{S.webhooksOutcomeProcessed}</SelectItem>
              <SelectItem value="ignored">{S.webhooksOutcomeIgnored}</SelectItem>
              <SelectItem value="duplicate">{S.webhooksOutcomeDuplicate}</SelectItem>
              <SelectItem value="error">{S.webhooksOutcomeError}</SelectItem>
              <SelectItem value="rejected">{S.webhooksOutcomeRejected}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.webhooksEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnTime}</th>
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnEvent}</th>
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnOutcome}</th>
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnStatus}</th>
                  <th className="py-1.5 font-medium">{S.webhooksColumnLatency}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                    onClick={() => setSelected(d)}
                  >
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      {d.integrationName}
                      {d.eventType ? ` · ${d.eventType}` : ""}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={OUTCOME_VARIANT[d.outcome]}>{OUTCOME_LABEL[d.outcome]}</Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-xs">{d.httpStatus}</td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {d.latencyMs !== null ? `${d.latencyMs}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <WebhookDeliveryDetailDialog delivery={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
