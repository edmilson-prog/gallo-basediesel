import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { INpsClass, INpsSurvey } from "@/shared/types";
import { classifyScore } from "../engine";
import { useNpsMetrics } from "../hooks/useNpsMetrics";
import { useNpsSurveys } from "../hooks/useNpsSurveys";
import { S } from "../i18n/pt-BR";

/**
 * /app/nps — the NPS read surface for Owner and Gestor.
 *
 * Two rules from the PRD are load-bearing here and neither is decorative:
 * the score never renders without its minimum N (the hook hands back null, so
 * this page could not cheat even if it wanted to), and there is no per-seller
 * ranking anywhere — NPS is a signal about the operation, not a leaderboard to
 * shame an attendant with.
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
  if (npsClass === "passive") return "bg-severity-warning/15 text-severity-warning";
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

function KpiCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-card-foreground">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SurveyRow({ survey }: { survey: INpsSurvey }) {
  const npsClass = classifyScore(survey.score ?? 0);
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
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
      <td className="px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
        {survey.customerId ? S.typeCustomer : S.typeContact}
      </td>
    </tr>
  );
}

export function NpsAnalyticsPage() {
  const [windowDays, setWindowDays] = useState<number>(90);
  const [audience, setAudience] = useState<"customer" | "contact" | undefined>(undefined);
  const [search, setSearch] = useState("");

  const filters = useMemo(() => ({ windowDays, audience }), [windowDays, audience]);

  const metrics = useNpsMetrics(filters);
  const surveys = useNpsSurveys({ ...filters, search, page: 1, pageSize: 30 });

  const detractors = useMemo(
    () =>
      (surveys.data?.data ?? []).filter(
        (survey) => classifyScore(survey.score ?? 0) === "detractor",
      ),
    [surveys.data],
  );

  const scoreDisplay = (() => {
    if (metrics.isLoading) return S.loading;
    if (!metrics.data) return "—";
    if (metrics.data.state === "collecting") {
      return (
        <span className="text-base font-medium text-muted-foreground">
          {S.collecting(metrics.data.n, metrics.data.minResponses)}
        </span>
      );
    }
    return metrics.data.score;
  })();

  const deltaHint =
    metrics.data?.delta !== null && metrics.data?.delta !== undefined
      ? `${metrics.data.delta >= 0 ? "+" : ""}${metrics.data.delta} ${S.kpiDelta}`
      : undefined;

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{S.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{S.pageSubtitle}</p>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{S.windowLabel}</span>
          <div className="flex rounded-lg border border-border">
            {WINDOWS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setWindowDays(option.days)}
                className={`px-3 py-1.5 text-sm first:rounded-l-lg last:rounded-r-lg ${
                  windowDays === option.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{S.audienceLabel}</span>
          <div className="flex rounded-lg border border-border">
            {AUDIENCES.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setAudience(option.value)}
                className={`px-3 py-1.5 text-sm first:rounded-l-lg last:rounded-r-lg ${
                  audience === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={S.kpiScore}
          value={scoreDisplay}
          hint={metrics.data?.state === "collecting" ? S.collectingHelp : deltaHint}
        />
        <KpiCard label={S.kpiResponses} value={metrics.data?.n ?? 0} />
        <KpiCard
          label={S.kpiResponseRate}
          value={`${Math.round((metrics.data?.responseRate ?? 0) * 100)}%`}
        />
        <KpiCard
          label={S.promoters}
          value={metrics.data?.promoters ?? 0}
          hint={`${metrics.data?.passives ?? 0} ${S.passives.toLowerCase()} · ${metrics.data?.detractors ?? 0} ${S.detractors.toLowerCase()}`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-card-foreground">{S.trendTitle}</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.data?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis domain={[-100, 100]} stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip />
                {/* connectNulls stays false: a month below the minimum has a null
                    score, and bridging the gap would invent a trend. */}
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-card-foreground">{S.distributionTitle}</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.data?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip />
                <Bar dataKey="promoters" stackId="a" fill="var(--color-severity-success)" />
                <Bar dataKey="passives" stackId="a" fill="var(--color-severity-warning)" />
                <Bar dataKey="detractors" stackId="a" fill="var(--color-severity-critical)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <h2 className="text-sm font-semibold text-card-foreground">{S.tableTitle}</h2>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={S.searchPlaceholder}
            className="w-64 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {surveys.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">{S.loading}</p>
        ) : (surveys.data?.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{S.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    {S.colDate}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    {S.colName}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    {S.colScore}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    {S.colComment}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    {S.colAudience}
                  </th>
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
      </section>

      <section className="rounded-lg border border-severity-critical/30 bg-card p-4">
        <h2 className="text-sm font-semibold text-card-foreground">{S.detractorsTitle}</h2>
        {detractors.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{S.detractorsEmpty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {detractors.map((survey) => (
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
      </section>
    </div>
  );
}
