import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { ISdrSession } from "@/shared/types";
import { useSdrSessionContext } from "../hooks/useSdrSessionContext";
import {
  ESCALATION_MODE_LABEL,
  ESCALATION_REASON_LABEL,
  FINISH_REASON_LABEL,
} from "../config/labels";

export interface ISdrSessionDetailModalProps {
  session: ISdrSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, finishedAt: string | undefined): string {
  if (!finishedAt) return "em andamento";
  const ms = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

interface ITimelineEvent {
  timestamp: string;
  title: string;
  details?: string;
  icon: string;
}

function buildTimeline(session: ISdrSession): ITimelineEvent[] {
  const events: ITimelineEvent[] = [];
  events.push({
    timestamp: session.startedAt,
    title: "Sessão iniciada — saudação",
    icon: "mdi:hand-wave",
  });
  if (session.collectedData.name || session.collectedData.company) {
    events.push({
      timestamp: session.startedAt,
      title: "Identificação capturada",
      details: [session.collectedData.name, session.collectedData.company]
        .filter(Boolean)
        .join(" · "),
      icon: "mdi:account-outline",
    });
  }
  if (session.collectedData.needs) {
    events.push({
      timestamp: session.startedAt,
      title: "Qualificação",
      details: session.collectedData.needs,
      icon: "mdi:account-question-outline",
    });
  }
  if (session.collectedData.identifiedPart || session.collectedData.pendingPartIdentification) {
    events.push({
      timestamp: session.lastActivityAt,
      title: "Peça identificada (PRD-021)",
      details:
        session.collectedData.pendingPartIdentification?.canonicalDescription ?? "Peça selecionada",
      icon: "mdi:cog-outline",
    });
  }
  if (session.collectedData.quoteId || session.collectedData.pendingQuote) {
    events.push({
      timestamp: session.lastActivityAt,
      title: "Orçamento gerado (PRD-022)",
      details: session.collectedData.pendingQuote
        ? `Total preliminar: R$ ${session.collectedData.pendingQuote.total.toLocaleString("pt-BR")}`
        : "Orçamento aceito",
      icon: "mdi:file-document-outline",
    });
  }
  if (session.finishReason === "escalated") {
    events.push({
      timestamp: session.finishedAt ?? session.lastActivityAt,
      title: "Escalado para vendedor (PRD-023)",
      icon: "mdi:account-arrow-right-outline",
    });
  }
  if (session.finishedAt) {
    events.push({
      timestamp: session.finishedAt,
      title: `Sessão finalizada — ${FINISH_REASON_LABEL[session.finishReason ?? "completed"]}`,
      icon: "mdi:flag-checkered",
    });
  }
  return events;
}

export function SdrSessionDetailModal({
  session,
  open,
  onOpenChange,
}: ISdrSessionDetailModalProps) {
  const ctx = useSdrSessionContext(session);
  const navigate = useNavigate();

  if (!session) return null;

  const displayName =
    session.collectedData.name ??
    session.collectedData.company ??
    ctx.customer?.name ??
    ctx.lead?.name ??
    "Cliente novo";

  const timeline = buildTimeline(session);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:robot-outline" size={20} className="text-primary" />
            Sessão SDR — {session.id}
          </DialogTitle>
          <DialogDescription>
            {formatDateTime(session.startedAt)} ·{" "}
            {formatDuration(session.startedAt, session.finishedAt)}
          </DialogDescription>
        </DialogHeader>

        <section className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            {session.collectedData.phone && (
              <p className="text-xs text-muted-foreground">{session.collectedData.phone}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estado final</p>
            <Badge variant="outline" className="mt-1">
              {FINISH_REASON_LABEL[session.finishReason ?? "completed"]}
            </Badge>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Conversa</p>
            <p className="font-mono text-xs text-foreground">{session.conversationId}</p>
          </div>
        </section>

        {ctx.escalation && (
          <section className="rounded-md border border-amber-200/50 bg-amber-50/40 p-4 text-sm dark:border-amber-900/30 dark:bg-amber-500/5">
            <div className="flex items-start gap-2">
              <Icon
                icon="mdi:account-arrow-right-outline"
                size={18}
                className="mt-0.5 text-amber-600 dark:text-amber-300"
              />
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  Escalação — {ESCALATION_REASON_LABEL[ctx.escalation.reason]}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Modo {ESCALATION_MODE_LABEL[ctx.escalation.mode]}
                  {ctx.seller ? ` · Atendido por ${ctx.seller.fullName}` : ""}
                </p>
              </div>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Timeline</h3>
          {ctx.loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <ol className="space-y-3 border-l border-border pl-5">
              {timeline.map((event, idx) => (
                <li key={`${event.title}-${idx}`} className="relative">
                  <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border bg-background text-primary">
                    <Icon icon={event.icon} size={12} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    {event.details && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{event.details}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDateTime(event.timestamp)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-md border bg-muted/10 p-3 text-xs">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Trace completo
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(session.collectedData, null, 2)}
            </pre>
          </details>
        </section>

        <footer className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled
            title="Disponível na Fase 2"
            className="gap-1"
          >
            <Icon icon="mdi:download-outline" size={14} />
            Baixar trace
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              void navigate({
                to: "/app/atendimento/$id",
                params: { id: session.conversationId },
              });
            }}
            className="gap-1"
          >
            <Icon icon="mdi:message-text-outline" size={14} />
            Ir para conversa
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
