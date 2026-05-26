import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { hashHue, initialsFrom, avatarColors } from "@/shared/utils/avatar";
import type { ISdrSession, SdrFinishReason } from "@/shared/types";
import { FINISH_REASON_LABEL } from "../config/labels";

export interface ISdrSessionsTableProps {
  sessions: ISdrSession[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onOpenSession: (session: ISdrSession) => void;
  isLoading?: boolean;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(startedAt: string, finishedAt: string | undefined): string {
  if (!finishedAt) return "—";
  const ms = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

const FINISH_BADGE_CLASS: Record<SdrFinishReason, string> = {
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200/40",
  escalated:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200/40",
  abandoned:
    "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300 border-slate-200/40",
  paused_by_human:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 border-blue-200/40",
};

export function SdrSessionsTable({
  sessions,
  page,
  pageSize,
  onPageChange,
  onOpenSession,
  isLoading,
}: ISdrSessionsTableProps) {
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = useMemo(() => sessions.slice(start, end), [sessions, start, end]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Icon
          icon="mdi:robot-confused-outline"
          size={36}
          className="mx-auto text-muted-foreground"
        />
        <p className="mt-3 text-sm font-medium text-foreground">Nenhuma sessão encontrada</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajuste os filtros para ampliar os resultados.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Cliente / Lead</th>
              <th className="px-4 py-3 text-left font-medium">Início</th>
              <th className="px-4 py-3 text-left font-medium">Duração</th>
              <th className="px-4 py-3 text-left font-medium">Estado final</th>
              <th className="px-4 py-3 text-left font-medium">Sinais</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((session) => {
              const displayName =
                session.collectedData.name ?? session.collectedData.company ?? "Cliente novo";
              const subtitle =
                session.collectedData.name && session.collectedData.company
                  ? session.collectedData.company
                  : (session.collectedData.needs ?? "Sem detalhes coletados");
              const hue = hashHue(session.id);
              const colors = avatarColors(hue);
              const initials = initialsFrom(displayName);
              const finishReason = session.finishReason ?? "completed";
              return (
                <tr key={session.id} className="border-b transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ background: colors.bg, color: colors.fg }}
                      >
                        {initials}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{displayName}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTime(session.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDuration(session.startedAt, session.finishedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`gap-1 ${FINISH_BADGE_CLASS[finishReason]}`}
                    >
                      {FINISH_REASON_LABEL[finishReason]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {session.collectedData.identifiedPart && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                        >
                          <Icon icon="mdi:cog-outline" size={12} />
                          Peça
                        </Badge>
                      )}
                      {session.collectedData.quoteId && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-500/10 dark:text-blue-200"
                        >
                          <Icon icon="mdi:file-document-outline" size={12} />
                          Orçamento
                        </Badge>
                      )}
                      {!session.collectedData.identifiedPart && !session.collectedData.quoteId && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenSession(session)}
                      className="h-8 gap-1 text-xs"
                    >
                      Ver detalhes
                      <Icon icon="mdi:arrow-right" size={14} />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span>
          Mostrando <strong className="text-foreground">{pageItems.length}</strong> de{" "}
          <strong className="text-foreground">{sessions.length}</strong> sessões
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label="Página anterior"
          >
            <Icon icon="mdi:chevron-left" size={14} />
          </Button>
          <span className="px-2 tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label="Próxima página"
          >
            <Icon icon="mdi:chevron-right" size={14} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
