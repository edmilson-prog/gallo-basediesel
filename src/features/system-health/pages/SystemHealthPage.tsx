import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { getActiveDataSource } from "@/providers/data";
import type { ISystemHealthcheck, SystemCheckResult, SystemHealthStatus } from "@/shared/types";
import { useSystemHealth } from "../hooks/useSystemHealth";
import { SYSTEM_HEALTH_STRINGS as S } from "../i18n/pt-BR";

const IS_MOCK = getActiveDataSource() === "mock";

/** External investigation panels (PRD-110, RF-033). */
const GITHUB_ACTIONS_URL = "https://github.com/edmilson-prog/gallo-basediesel/actions";
const SENTRY_URL = "https://sentry.io";

function supabaseProjectRef(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

const STATUS_META: Record<
  SystemHealthStatus,
  { label: string; hint: string; icon: string; badgeClass: string }
> = {
  healthy: {
    label: S.statusHealthy,
    hint: S.statusHealthyHint,
    icon: "mdi:check-circle",
    badgeClass: "bg-severity-success/15 text-severity-success border-severity-success/30",
  },
  degraded: {
    label: S.statusDegraded,
    hint: S.statusDegradedHint,
    icon: "mdi:alert-circle",
    badgeClass: "bg-severity-warning/15 text-severity-warning border-severity-warning/30",
  },
  down: {
    label: S.statusDown,
    hint: S.statusDownHint,
    icon: "mdi:close-circle",
    badgeClass: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  },
  unknown: {
    label: S.statusUnknown,
    hint: S.statusUnknownHint,
    icon: "mdi:help-circle",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function CheckPill({ label, result }: { label: string; result: SystemCheckResult }) {
  const ok = result === "ok";
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={
          ok
            ? "flex items-center gap-1 text-sm font-medium text-severity-success"
            : "flex items-center gap-1 text-sm font-medium text-severity-critical"
        }
      >
        <Icon icon={ok ? "mdi:check-circle-outline" : "mdi:close-circle-outline"} size={16} />
        {ok ? S.checkOk : S.checkFail}
      </span>
    </div>
  );
}

function StatusCard({
  healthcheck,
  isFetching,
  onRefresh,
}: {
  healthcheck: ISystemHealthcheck | undefined;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const meta = STATUS_META[healthcheck?.status ?? "unknown"];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>{S.statusCardTitle}</CardTitle>
          <CardDescription>{meta.hint}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
          <Icon
            icon={isFetching ? "mdi:loading" : "mdi:refresh"}
            size={16}
            className={isFetching ? "animate-spin" : undefined}
          />
          {isFetching ? S.checking : S.checkNow}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {healthcheck ? (
          <>
            <Badge variant="outline" className={`gap-1.5 px-3 py-1.5 text-sm ${meta.badgeClass}`}>
              <Icon icon={meta.icon} size={16} />
              {meta.label}
            </Badge>
            <div className="grid gap-2 sm:grid-cols-3">
              <CheckPill label={S.checkDb} result={healthcheck.checks.db} />
              <CheckPill label={S.checkStorage} result={healthcheck.checks.storage} />
              <CheckPill label={S.checkAuth} result={healthcheck.checks.auth} />
            </div>
            <p className="text-xs text-muted-foreground">
              {S.lastCheckedAt} {formatDateTime(healthcheck.checkedAt)}
            </p>
          </>
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

export function SystemHealthPage() {
  const { healthcheck, cronJobs, dbStats } = useSystemHealth();
  const projectRef = supabaseProjectRef();
  const hasSentry = Boolean(import.meta.env.VITE_SENTRY_DSN);

  const externalLinks = [
    projectRef && {
      label: S.linkSupabaseLogs,
      icon: "mdi:script-text-outline",
      href: `https://supabase.com/dashboard/project/${projectRef}/logs/edge-functions-logs`,
    },
    projectRef && {
      label: S.linkSupabaseDb,
      icon: "mdi:database-outline",
      href: `https://supabase.com/dashboard/project/${projectRef}/database/tables`,
    },
    {
      label: S.linkGithubActions,
      icon: "mdi:github",
      href: GITHUB_ACTIONS_URL,
    },
    hasSentry && {
      label: S.linkSentry,
      icon: "mdi:bug-outline",
      href: SENTRY_URL,
    },
  ].filter(Boolean) as { label: string; icon: string; href: string }[];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">{S.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{S.pageSubtitle}</p>
        {IS_MOCK && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-severity-info">
            <Icon icon="mdi:information-outline" size={14} />
            {S.mockNotice}
          </p>
        )}
      </div>

      <StatusCard
        healthcheck={healthcheck.data}
        isFetching={healthcheck.isFetching}
        onRefresh={() => void healthcheck.refetch()}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{S.cronCardTitle}</CardTitle>
            <CardDescription>{S.cronCardSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cronJobs.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !cronJobs.data || cronJobs.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">{S.cronEmpty}</p>
            ) : (
              cronJobs.data.map((job) => {
                const succeeded = job.lastRunStatus === "succeeded";
                return (
                  <div
                    key={job.jobName}
                    className="flex flex-col gap-1 rounded-md border border-border bg-card p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-sm text-foreground">
                        {job.jobName}
                      </span>
                      <Badge variant="outline" className="shrink-0 font-mono text-xs">
                        {job.schedule}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span
                        className={job.active ? "text-severity-success" : "text-severity-warning"}
                      >
                        {job.active ? S.cronActive : S.cronInactive}
                      </span>
                      {job.lastRunStatus === null ? (
                        <span>{S.cronNeverRan}</span>
                      ) : (
                        <>
                          <span
                            className={
                              succeeded ? "text-severity-success" : "text-severity-critical"
                            }
                          >
                            {succeeded ? S.cronSucceeded : S.cronFailed}
                          </span>
                          <span>
                            {S.cronLastRun}: {formatDateTime(job.lastRunStartedAt)}
                          </span>
                          {job.lastRunDurationMs !== null && (
                            <span>
                              {S.cronDuration}: {Math.round(job.lastRunDurationMs)} ms
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{S.dbCardTitle}</CardTitle>
              <CardDescription>{S.dbCardSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              {dbStats.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : !dbStats.data ? (
                <p className="text-sm text-muted-foreground">{S.dbHidden}</p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: S.dbSize, value: formatBytes(dbStats.data.dbSizeBytes) },
                    { label: S.dbTables, value: String(dbStats.data.publicTablesCount) },
                    {
                      label: S.dbActiveConnections,
                      value: String(dbStats.data.activeConnections),
                    },
                    { label: S.dbTotalConnections, value: String(dbStats.data.totalConnections) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border border-border bg-card p-3">
                      <dt className="text-xs text-muted-foreground">{item.label}</dt>
                      <dd className="text-lg font-semibold text-foreground">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{S.linksCardTitle}</CardTitle>
              <CardDescription>{S.linksCardSubtitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {externalLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon={link.icon} size={16} />
                    {link.label}
                  </span>
                  <Icon icon="mdi:open-in-new" size={14} className="text-muted-foreground" />
                </a>
              ))}
              {!hasSentry && (
                <p className="text-xs text-muted-foreground">{S.linkSentryDisabled}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
