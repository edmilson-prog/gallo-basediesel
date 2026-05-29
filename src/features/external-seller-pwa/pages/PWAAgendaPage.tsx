import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeBR } from "@/shared/utils/format";
import { usePwaAuth } from "../hooks/usePwaAuth";
import { usePwaVisits, type IPwaVisitWithCustomer } from "../hooks/usePwaVisits";
import { customerLabel } from "../utils/customerLabel";
import { PWABanner } from "../components/PWABanner";
import { PWA_STRINGS as S, VISIT_STATUS_LABEL } from "../i18n/pt-BR";

const STATUS_TONE: Record<string, string> = {
  agendada: "border-primary/40 bg-primary/10 text-primary",
  realizada: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  remarcada: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  cancelada: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function endOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  d.setHours(23, 59, 59, 999);
  return d;
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Compact week grid showing the visit count per day (PRD-070 RF-019). */
function WeekCalendar({ visits }: { visits: IPwaVisitWithCustomer[] }) {
  const start = startOfWeek();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const countFor = (day: Date) =>
    visits.filter((v) => isSameDay(new Date(v.scheduledAt), day)).length;

  return (
    <Card className="p-3">
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const count = countFor(day);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={`flex flex-col items-center gap-1 rounded-md py-2 ${
                isToday ? "bg-primary/10" : ""
              }`}
            >
              <span className="text-[10px] uppercase text-muted-foreground">
                {WEEKDAY_LABELS[i]}
              </span>
              <span
                className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}
              >
                {day.getDate()}
              </span>
              {count > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {count}
                </span>
              ) : (
                <span className="h-5" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function VisitCard({ visit }: { visit: IPwaVisitWithCustomer }) {
  return (
    <Card className="flex items-start gap-3 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon icon="mdi:map-marker" size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {customerLabel(visit.customer)}
          </p>
          <Badge variant="outline" className={STATUS_TONE[visit.status] ?? ""}>
            {VISIT_STATUS_LABEL[visit.status]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{formatDateTimeBR(visit.scheduledAt)}</p>
        {visit.address && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{visit.address}</p>
        )}
      </div>
    </Card>
  );
}

export function PWAAgendaPage() {
  const { session } = usePwaAuth();
  const { visits, isLoading } = usePwaVisits(session?.sellerId);

  const weekEnd = endOfWeek().getTime();
  const now = Date.now();
  const thisWeek = visits.filter((v) => {
    const t = new Date(v.scheduledAt).getTime();
    return t >= now && t <= weekEnd;
  });
  const upcoming = visits.filter((v) => new Date(v.scheduledAt).getTime() > weekEnd);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-foreground">{S.agendaTitle}</h1>
        <Button asChild size="sm">
          <Link to="/pwa/agenda/nova">
            <Icon icon="mdi:plus" size={16} className="mr-1" aria-hidden />
            {S.agendaNew}
          </Link>
        </Button>
      </div>

      <PWABanner />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <WeekCalendar visits={visits} />
      )}

      {isLoading ? null : visits.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{S.agendaEmpty}</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{S.agendaThisWeek}</h2>
            {thisWeek.length === 0 ? (
              <p className="text-sm text-muted-foreground">{S.agendaEmpty}</p>
            ) : (
              thisWeek.map((v) => <VisitCard key={v.id} visit={v} />)
            )}
          </section>
          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{S.agendaUpcoming}</h2>
              {upcoming.map((v) => (
                <VisitCard key={v.id} visit={v} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
