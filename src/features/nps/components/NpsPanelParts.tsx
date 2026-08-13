import type { INpsBreakdown } from "@/shared/types";
import { NPS_TARGET, npsBandLabel, rulerPosition } from "../engine";
import { S } from "../i18n/pt-BR";

/**
 * Building blocks of the NPS panel, from `ui_kits/nps` (direction A · Denso).
 *
 * The kit hard-codes its palette (#E0BB4E, #5BB07A, #E23A40). Those are
 * translated to semantic tokens here — `primary` for the gold, `severity-*`
 * for the categories — because a component that names a hex cannot follow the
 * theme, and this project forbids it.
 *
 * `--font-semicond` in the kit maps to `--font-display` (Saira Condensed),
 * which is the condensed face this app already ships.
 */

/**
 * Full class names, never interpolated: Tailwind scans source text, so a class
 * assembled at runtime (`text-${tone}`) is never generated and the colour
 * silently disappears in the production build.
 */
export const CATEGORY = {
  promoter: {
    label: S.promoters,
    short: "Promotor",
    range: "9–10",
    toneClass: "text-severity-success",
  },
  passive: { label: S.passives, short: "Neutro", range: "7–8", toneClass: "text-muted-foreground" },
  detractor: {
    label: S.detractors,
    short: "Detrator",
    range: "0–6",
    toneClass: "text-severity-critical",
  },
} as const;

/** Stacked promoter / passive / detractor bar. */
export function NpsStack({
  promoters,
  passives,
  detractors,
  height = 10,
  labels = false,
}: {
  promoters: number;
  passives: number;
  detractors: number;
  height?: number;
  labels?: boolean;
}) {
  const total = promoters + passives + detractors;
  if (total === 0) {
    return <div className="rounded bg-muted" style={{ height }} />;
  }

  const segments = [
    { key: "p", value: promoters, className: "bg-severity-success", label: S.promoters },
    { key: "n", value: passives, className: "bg-muted-foreground/50", label: S.passives },
    { key: "d", value: detractors, className: "bg-severity-critical", label: S.detractors },
  ];

  return (
    <div>
      <div className="flex gap-0.5 overflow-hidden rounded" style={{ height }}>
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.key}
              className={segment.className}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      {labels ? (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((segment) => (
            <span
              key={segment.key}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span className={`size-1.5 rounded-[2px] ${segment.className}`} />
              {segment.label}
              <b className="text-foreground">{Math.round((segment.value / total) * 100)}%</b>
              <span className="text-muted-foreground/70">({segment.value})</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The −100..100 ruler with a marker at the score. Gives the number a position
 * on the scale that people actually reason about, rather than leaving "42" to
 * mean whatever the reader assumes it means.
 */
export function NpsRuler({ score }: { score: number }) {
  return (
    <div className="pt-2.5">
      <div className="h-2 overflow-hidden rounded bg-gradient-to-r from-severity-critical via-severity-warning to-severity-success opacity-60" />
      <div className="relative h-0">
        <div
          className="absolute -top-[15px] h-[22px] w-0.5 bg-foreground"
          style={{ left: `${rulerPosition(score)}%`, transform: "translateX(-1px)" }}
        />
      </div>
      <div className="mt-3 flex justify-between font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
        <span>−100</span>
        <span>0 · crítico</span>
        <span>50 · qualidade</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** 12-month trend with the internal target drawn as a dashed line. */
export function NpsTrendChart({
  points,
  height = 158,
}: {
  points: Array<{ month: string; score: number | null }>;
  height?: number;
}) {
  const max = 70;
  const last = points.length > 0 ? points[points.length - 1] : undefined;

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="w-5 border-t border-dashed border-border" />
        <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Meta {NPS_TARGET}
        </span>
      </div>

      <div className="relative flex items-end gap-2" style={{ height }}>
        <div
          className="absolute inset-x-0 border-t border-dashed border-border"
          style={{ bottom: `${(NPS_TARGET / max) * height}px` }}
        />
        {points.map((point) => {
          const isLast = point.month === last?.month;
          // A month below the honest minimum has a null score. It renders as an
          // empty slot rather than a zero bar — zero is a real NPS value and
          // would read as "terrible month" instead of "not enough answers".
          const pct = point.score === null ? 0 : Math.max(0, (point.score / max) * 100);
          return (
            <div
              key={point.month}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span
                className={`font-display text-[13.5px] font-bold ${isLast ? "text-primary" : "text-muted-foreground"}`}
              >
                {point.score ?? "–"}
              </span>
              <div
                className={`w-full rounded-t ${isLast ? "bg-primary" : "bg-muted-foreground/25"}`}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2">
        {points.map((point) => (
          <span
            key={point.month}
            className="flex-1 text-center text-[11px] uppercase tracking-[0.06em] text-muted-foreground"
          >
            {point.month.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One row of the per-store breakdown. */
export function NpsBreakdownRow({ item, score }: { item: INpsBreakdown; score: number | null }) {
  const total = item.promoters + item.passives + item.detractors;
  return (
    <div className="flex items-center gap-3.5 border-b border-border py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-[13.5px] font-bold text-card-foreground">{item.label}</span>
        <div className="mt-0.5 text-xs text-muted-foreground">{total} respostas</div>
        <div className="mt-2">
          <NpsStack
            promoters={item.promoters}
            passives={item.passives}
            detractors={item.detractors}
            height={7}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`font-display text-[28px] font-bold leading-none ${
            score !== null && score >= NPS_TARGET ? "text-severity-success" : "text-primary"
          }`}
        >
          {score ?? "–"}
        </div>
        <div className="font-display text-[11px] font-bold uppercase italic text-muted-foreground">
          {score === null ? S.collectingShort : npsBandLabel(score)}
        </div>
      </div>
    </div>
  );
}
