import { CSA_STRINGS, formatDuration } from "@/features/customer-service-analytics";
import type { ICustomerServiceDailyPoint, ICustomerServiceMonthlyPoint } from "@/shared/types";

/**
 * Os dois gráficos da Visão Geral, em SVG próprio.
 *
 * O desktop usa Recharts. Aqui não: a biblioteca inteira para dois gráficos de
 * 380px é peso que o aparelho carrega em rede de oficina, e o kit já desenha
 * ambos como formas simples. São decorativos por escolha — o número que importa
 * está escrito ao lado, e o `role="img"` carrega o resumo para quem usa leitor.
 */

const CHART_HEIGHT = 92;
const CHART_WIDTH = 320;

function polyline(values: number[], max: number): string {
  if (values.length < 2 || max <= 0) return "";
  const step = CHART_WIDTH / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = CHART_HEIGHT - (value / max) * CHART_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** TMA e TMR nos últimos 12 meses, na MESMA escala. */
export function PwaCsaTrendChart({ points }: { points: ICustomerServiceMonthlyPoint[] }) {
  const handle = points.map((point) => point.averageHandleTime);
  const response = points.map((point) => point.averageResponseTime);
  // Escala compartilhada de propósito: normalizar cada série pelo próprio máximo
  // faria o TMR parecer do tamanho do TMA, que é a leitura errada.
  const max = Math.max(...handle, ...response, 1);

  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-[12.5px] text-muted-foreground">
        {CSA_STRINGS.chartTrendEmpty}
      </p>
    );
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-[92px] w-full"
        role="img"
        aria-label={`${CSA_STRINGS.chartTrendTitle}. TMA máximo ${formatDuration(Math.max(...handle))}, TMR máximo ${formatDuration(Math.max(...response))}.`}
      >
        <polyline
          points={polyline(handle, max)}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-primary"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={polyline(response, max)}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-severity-success"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] font-semibold">
        <span className="flex items-center gap-1.5 text-primary">
          <span className="h-[2px] w-3 bg-primary" aria-hidden />
          TMA {formatDuration(handle.at(-1) ?? 0)}
        </span>
        <span className="flex items-center gap-1.5 text-severity-success">
          <span className="h-[2px] w-3 bg-severity-success" aria-hidden />
          TMR {formatDuration(response.at(-1) ?? 0)}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground/70">
        <span>{points[0]?.monthLabel}</span>
        <span>{points.at(-1)?.monthLabel}</span>
      </div>
    </div>
  );
}

/** Volume diário do mês — barras. */
export function PwaCsaDailyChart({ points }: { points: ICustomerServiceDailyPoint[] }) {
  const max = Math.max(...points.map((point) => point.totalConversations), 1);
  const total = points.reduce((sum, point) => sum + point.totalConversations, 0);

  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-[12.5px] text-muted-foreground">
        {CSA_STRINGS.channelEmpty}
      </p>
    );
  }

  return (
    <div>
      <div
        className="flex h-[72px] items-end gap-[2px]"
        role="img"
        aria-label={`${CSA_STRINGS.chartVolumeTitle}: ${total} no período, pico de ${max} num dia.`}
      >
        {points.map((point) => (
          <span
            key={point.dayKey}
            className="min-w-[2px] flex-1 rounded-sm bg-primary/70"
            // Altura mínima de 2px: um dia com 1 conversa não pode sumir e
            // parecer um dia sem nenhuma.
            style={{ height: `${Math.max(2, (point.totalConversations / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground/70">
        <span>dia {points[0]?.dayKey.slice(-2)}</span>
        <span>pico {max}</span>
        <span>dia {points.at(-1)?.dayKey.slice(-2)}</span>
      </div>
    </div>
  );
}

/** Barra segmentada — substitui a rosca do desktop, que não cabe em 412px. */
export function PwaCsaSegmentBar({
  segments,
}: {
  segments: { key: string; label: string; value: number; toneClass: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return null;

  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-foreground/10" role="presentation">
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <span
            key={segment.key}
            className={segment.toneClass}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
    </div>
  );
}
