import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { INpsBreakdown, INpsClass, INpsSurvey } from "@/shared/types";
import { classifyScore, computeNps, NPS_TARGET, npsBandLabel } from "../engine";
import { useNpsMetrics } from "../hooks/useNpsMetrics";
import { useNpsSurveys } from "../hooks/useNpsSurveys";
import { S } from "../i18n/pt-BR";
import {
  CATEGORY,
  NpsBreakdownRow,
  NpsReasons,
  NpsRuler,
  NpsStack,
  NpsTrendChart,
} from "../components/NpsPanelParts";

/**
 * /app/nps — panel, direction A · Denso from `ui_kits/nps`.
 *
 * Four KPIs, then distribution and trend side by side, then the breakdowns.
 * Everything fits the first screen, which the kit calls "the direction for
 * whoever looks at the number every day" — the actual use here.
 *
 * Two rules survive from the PRD and are load-bearing: the score never renders
 * without its minimum sample (the hook returns null, so this page could not
 * cheat), and a month below that minimum breaks the trend line rather than
 * drawing a zero.
 *
 * The per-attendant table is a deliberate reversal of PRD-148B, which excluded
 * it as compare-and-shame. The owner chose the kit's version on 2026-08-12;
 * both PRDs carry a note recording the change.
 */

const WINDOWS = [
  { days: 30, label: S.window30 },
  { days: 90, label: S.window90 },
  { days: 180, label: S.window180 },
  { days: 365, label: S.window365 },
] as const;

const AUDIENCES = [
  { value: undefined, label: S.audienceAll },
  { value: "customer" as const, label: S.audienceCustomer },
  { value: "contact" as const, label: S.audienceContact },
] as const;

function classTone(npsClass: INpsClass): string {
  if (npsClass === "promoter") return "bg-severity-success/15 text-severity-success";
  if (npsClass === "passive") return "bg-muted text-muted-foreground";
  return "bg-severity-critical/15 text-severity-critical";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Segmented control — the kit's `NpsSeg`. */
function Seg<T>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={String(item.label)}
            type="button"
            onClick={() => onChange(item.value)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              active
                ? "bg-primary font-bold text-primary-foreground"
                : "font-semibold text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Card({
  title,
  sub,
  right,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-[13px] font-bold text-card-foreground">{title}</span>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
        {right ? <div className="ml-auto">{right}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  valueClass = "text-card-foreground",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </div>
      <div className={`font-display text-[34px] font-bold leading-[0.9] ${valueClass}`}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Per-attendant table, ordered by score — the kit's `NpsAgentTable`. */
function SellerTable({ rows, minResponses }: { rows: INpsBreakdown[]; minResponses: number }) {
  const scored = useMemo(
    () =>
      rows
        .map((row) => {
          const responses = [
            ...Array(row.promoters).fill({ score: 10 }),
            ...Array(row.passives).fill({ score: 8 }),
            ...Array(row.detractors).fill({ score: 3 }),
          ];
          const total = responses.length;
          const result = computeNps(responses, { minResponses, sent: total });
          return { ...row, score: result.score, total };
        })
        .sort((a, b) => (b.score ?? -101) - (a.score ?? -101)),
    [rows, minResponses],
  );

  if (scored.length === 0) {
    return <p className="text-sm text-muted-foreground">{S.bySellerEmpty}</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_52px_60px_66px] gap-2.5 border-b border-border pb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{S.colSeller}</span>
        <span className="text-right">NPS</span>
        <span className="text-right">{S.colResponses}</span>
        <span className="text-right">Detrat.</span>
      </div>
      {scored.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[1fr_52px_60px_66px] items-center gap-2.5 border-b border-border py-2.5 last:border-0"
        >
          <span className="truncate text-[13px] font-semibold text-card-foreground">
            {row.label}
          </span>
          <span
            className={`text-right font-display text-lg font-bold ${
              row.score === null
                ? "text-muted-foreground"
                : row.score >= NPS_TARGET
                  ? "text-severity-success"
                  : row.score >= 40
                    ? "text-primary"
                    : "text-severity-critical"
            }`}
          >
            {row.score ?? "–"}
          </span>
          <span className="text-right text-[13px] text-muted-foreground">{row.total}</span>
          <span
            className={`text-right text-[13px] font-bold ${
              row.detractors > 3 ? "text-severity-critical" : "text-muted-foreground"
            }`}
          >
            {row.detractors}
          </span>
        </div>
      ))}
    </div>
  );
}

function SurveyRow({ survey }: { survey: INpsSurvey }) {
  const npsClass = classifyScore(survey.score ?? 0);
  return (
    <tr className="border-b border-border last:border-0">
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        {formatDate(survey.respondedAt)}
      </td>
      <td className="px-3 py-2 text-sm text-foreground">{survey.recipientName ?? "—"}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex min-w-8 justify-center rounded px-2 py-0.5 text-sm font-semibold ${classTone(npsClass)}`}
        >
          {survey.score}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground">{survey.comment ?? S.noComment}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
        {survey.customerId ? S.typeCustomer : S.typeContact}
      </td>
    </tr>
  );
}

export function NpsAnalyticsPage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [audience, setAudience] = useState<"customer" | "contact" | undefined>(undefined);
  const [search, setSearch] = useState("");

  const filters = useMemo(() => ({ windowDays, audience }), [windowDays, audience]);
  const metrics = useNpsMetrics(filters);
  const surveys = useNpsSurveys({ ...filters, search, page: 1, pageSize: 30 });

  const data = metrics.data;
  const collecting = data?.state === "collecting";
  const score = data?.score ?? null;

  const detractorRows = useMemo(
    () =>
      (surveys.data?.data ?? []).filter(
        (survey) => classifyScore(survey.score ?? 0) === "detractor",
      ),
    [surveys.data],
  );

  const storeScore = (item: INpsBreakdown) => {
    const responses = [
      ...Array(item.promoters).fill({ score: 10 }),
      ...Array(item.passives).fill({ score: 8 }),
      ...Array(item.detractors).fill({ score: 3 }),
    ];
    return computeNps(responses, {
      minResponses: data?.minResponses ?? 5,
      sent: responses.length,
    }).score;
  };

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 px-6 py-5">
      {/* Cabeçalho + cortes */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold uppercase leading-[0.96] text-foreground">
            {S.pageTitle}
          </h1>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {S.responsesOfSent(data?.n ?? 0, data?.sent ?? 0)}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Seg
            items={WINDOWS.map((w) => ({ value: w.days, label: w.label }))}
            value={windowDays}
            onChange={setWindowDays}
          />
          <Seg
            items={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))}
            value={audience}
            onChange={setAudience}
          />
        </div>
      </div>

      {/* KPIs */}
      <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-primary/60 bg-card px-4 py-3.5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-primary">
            {S.kpiScore} · {WINDOWS.find((w) => w.days === windowDays)?.label}
          </div>
          {collecting ? (
            <>
              <div className="font-display text-2xl font-bold leading-tight text-muted-foreground">
                {S.collecting(data?.n ?? 0, data?.minResponses ?? 5)}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{S.collectingHelp}</div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-[44px] font-extrabold leading-[0.85] text-foreground">
                  {score}
                </span>
                <span className="font-display text-[12.5px] font-bold uppercase italic text-primary">
                  {score !== null ? npsBandLabel(score) : ""}
                </span>
              </div>
              {data?.delta !== null && data?.delta !== undefined ? (
                <div
                  className={`mt-2 text-xs ${data.delta >= 0 ? "text-severity-success" : "text-severity-critical"}`}
                >
                  {data.delta >= 0 ? "+" : ""}
                  {data.delta} pts {S.kpiDelta}
                </div>
              ) : null}
            </>
          )}
        </div>

        <Kpi
          label={S.kpiResponses}
          value={data?.n ?? 0}
          sub={S.responseRateSub(Math.round((data?.responseRate ?? 0) * 100), data?.sent ?? 0)}
        />
        <Kpi
          label={S.kpiPromoters}
          value={`${data && data.n > 0 ? Math.round((data.promoters / data.n) * 100) : 0}%`}
          sub={S.promotersSub(data?.promoters ?? 0)}
          valueClass="text-severity-success"
        />
        <Kpi
          label={S.kpiDetractors}
          value={`${data && data.n > 0 ? Math.round((data.detractors / data.n) * 100) : 0}%`}
          sub={S.detractorsSub(data?.detractors ?? 0)}
          valueClass="text-severity-critical"
        />
      </section>

      {/* Distribuição + Tendência */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1.45fr]">
        <Card title={S.distributionTitle}>
          <NpsStack
            promoters={data?.promoters ?? 0}
            passives={data?.passives ?? 0}
            detractors={data?.detractors ?? 0}
            height={12}
            labels
          />
          <div className="mt-4">
            <NpsRuler score={score ?? 0} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {(["promoter", "passive", "detractor"] as const).map((key) => {
              const meta = CATEGORY[key];
              const value =
                key === "promoter"
                  ? (data?.promoters ?? 0)
                  : key === "passive"
                    ? (data?.passives ?? 0)
                    : (data?.detractors ?? 0);
              return (
                <div key={key} className="rounded-lg bg-muted/40 px-2.5 py-2.5">
                  <div
                    className={`font-display text-[10.5px] font-bold uppercase italic ${meta.toneClass}`}
                  >
                    {meta.short} · {meta.range}
                  </div>
                  <div className="mt-1 font-display text-[22px] font-bold text-card-foreground">
                    {value}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title={S.trendTitle} sub={S.trendSub}>
          <NpsTrendChart points={data?.monthly ?? []} />
        </Card>
      </section>

      {/* Cortes por loja e por atendente */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card title={S.byStoreTitle}>
          {(data?.byStore ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{S.empty}</p>
          ) : (
            (data?.byStore ?? []).map((item) => (
              <NpsBreakdownRow key={item.key} item={item} score={storeScore(item)} />
            ))
          )}
        </Card>

        <Card title={S.bySellerTitle}>
          <SellerTable rows={data?.bySeller ?? []} minResponses={data?.minResponses ?? 5} />
        </Card>
      </section>

      {/* Motivos citados */}
      <Card title={S.reasonsTitle} sub={S.reasonsSub}>
        <NpsReasons up={data?.reasons.promoter ?? []} down={data?.reasons.detractor ?? []} />
      </Card>

      {/* Respostas */}
      <Card
        title={S.tableTitle}
        right={
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={S.searchPlaceholder}
            className="w-56 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
        }
      >
        {surveys.isLoading ? (
          <p className="text-sm text-muted-foreground">{S.loading}</p>
        ) : (surveys.data?.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  {[S.colDate, S.colName, S.colScore, S.colComment, S.colAudience].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(surveys.data?.data ?? []).map((survey) => (
                  <SurveyRow key={survey.id} survey={survey} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detratores */}
      <Card title={S.detractorsTitle}>
        {detractorRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.detractorsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detractorRows.map((survey) => (
              <li
                key={survey.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground">
                    <span className={`mr-2 rounded px-2 py-0.5 ${classTone("detractor")}`}>
                      {survey.score}
                    </span>
                    {survey.recipientName ?? "—"}
                  </p>
                  {survey.comment ? (
                    <p className="mt-1 text-sm text-muted-foreground">{survey.comment}</p>
                  ) : null}
                </div>
                {survey.conversationId ? (
                  <Link
                    to="/app/atendimento/$id"
                    params={{ id: survey.conversationId }}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                  >
                    {S.openConversation}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
