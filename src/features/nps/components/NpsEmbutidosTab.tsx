import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { npsBandLabel } from "../engine";
import type { INpsMetricsResult } from "../hooks/useNpsMetrics";
import { NpsCard, NpsChip, NpsScoreBox } from "./NpsKit";
import { NpsStack } from "./NpsPanelParts";

/**
 * "Onde o NPS aparece" — the kit's `NpsEmbeds` (`nps-views.jsx`).
 *
 * Not a settings screen and not a mock: it shows the two places the score
 * already leaks into screens people open for other reasons, so whoever changes
 * a parameter can see what else moves. The kit frames both in a dashed border
 * to say "this lives somewhere else" — kept, along with the path label.
 *
 * The Cockpit frame is drawn from the same metrics the panel above is showing,
 * so it cannot claim a number the panel disagrees with.
 */

function Frame({
  label,
  path,
  to,
  children,
}: {
  label: string;
  path: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
        <span className="font-display text-sm font-extrabold uppercase tracking-[0.06em] text-foreground">
          {label}
        </span>
        <span className="font-display text-[11.5px] font-bold italic text-primary/80">{path}</span>
        <Link
          to={to}
          className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline"
        >
          Abrir
          <Icon icon="lucide:arrow-up-right" size={13} />
        </Link>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        {children}
      </div>
    </div>
  );
}

export function NpsEmbutidosTab({ metrics }: { metrics: INpsMetricsResult | undefined }) {
  const collecting = metrics?.state === "collecting";
  const score = metrics?.score ?? null;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Frame label="Card no Cockpit" path="/app · Início" to="/app">
        <NpsCard title="NPS" icon="lucide:gauge" iconTone="primary" sub="90 dias">
          {collecting || score === null ? (
            <>
              <div className="font-display text-2xl font-bold leading-tight text-muted-foreground">
                Coletando dados ({metrics?.n ?? 0}/{metrics?.minResponses ?? 5})
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Abaixo do mínimo de respostas o card não mostra número — um NPS 100 de duas
                respostas é desinformação, e no Cockpit ela viraria decisão.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-end gap-3.5">
                <span className="font-display text-[56px] font-black leading-[0.8] text-foreground">
                  {score}
                </span>
                <span className="pb-1">
                  <span className="block font-display text-[11.5px] font-bold uppercase italic text-primary">
                    {npsBandLabel(score)}
                  </span>
                  {metrics?.delta !== null && metrics?.delta !== undefined ? (
                    <span
                      className={`mt-1 inline-flex items-center gap-1 text-xs ${
                        metrics.delta >= 0 ? "text-severity-success" : "text-severity-critical"
                      }`}
                    >
                      <Icon
                        icon={metrics.delta >= 0 ? "lucide:arrow-up" : "lucide:arrow-down"}
                        size={12}
                      />
                      {metrics.delta >= 0 ? "+" : ""}
                      {metrics.delta} pts vs. janela anterior
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="mt-4">
                <NpsStack
                  promoters={metrics?.promoters ?? 0}
                  passives={metrics?.passives ?? 0}
                  detractors={metrics?.detractors ?? 0}
                  height={9}
                  labels
                />
              </div>
            </>
          )}
        </NpsCard>
        <p className="mt-2.5 text-xs text-muted-foreground">
          Lê a mesma janela do painel e a mesma regra de mínimo. Some do Cockpit se “Card no
          Cockpit” for desligado em Parâmetros.
        </p>
      </Frame>

      <Frame
        label="Selo na ficha do cliente"
        path="/app/clientes/:id · cabeçalho"
        to="/app/clientes"
      >
        <NpsCard title="Cabeçalho da ficha" icon="lucide:message-square-quote">
          <div className="flex flex-wrap items-center gap-3">
            <NpsScoreBox score={9} size={44} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-card-foreground">
                Transportes Fronteira Oeste
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                Última resposta há 3 dias
              </div>
            </div>
            <span className="ml-auto">
              <NpsChip size="sm" tone="success" icon="lucide:thumbs-up">
                NPS 9 · Promotor
              </NpsChip>
            </span>
          </div>
          <p className="mt-3.5 border-l-2 border-severity-success pl-3 text-[13.5px] leading-relaxed text-muted-foreground">
            O selo só aparece se houver resposta nos últimos 12 meses. Uma nota mais antiga fala de
            quem a empresa era, não desta relação — e um selo “sem NPS” só somaria ruído a um
            cabeçalho que já disputa atenção.
          </p>
        </NpsCard>
        <p className="mt-2.5 text-xs text-muted-foreground">
          Exemplo ilustrativo do formato. Some da ficha se “Selo na ficha do cliente” for desligado
          em Parâmetros.
        </p>
      </Frame>
    </div>
  );
}
