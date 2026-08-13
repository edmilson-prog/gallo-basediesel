import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import type { INpsRecovery, INpsRecoveryStatus } from "@/shared/types";
import { useNpsRecoveries, useSetNpsRecovery } from "../hooks/useNpsRecoveries";
import { NpsAvatar, NpsChip, NpsNotWired, NpsScoreBox } from "./NpsKit";
import { initialsOf, scoreTone, type INpsTone } from "./npsTones";

/**
 * "Recuperação de detratores" — the kit's `NpsRecuperacao` (`nps-views.jsx`).
 *
 * Three columns, because a detractor is not a number to be counted but a
 * conversation someone owes: a score of 4 that nobody calls back is the same
 * customer lost, whether or not the panel showed it in red.
 *
 * "Novo" is not a stored state — a detractor with no treatment row is new. That
 * is what lets the whole history join the queue the day the feature is switched
 * on, instead of starting empty and looking clean.
 */

const COLUMNS: Array<{
  status: INpsRecoveryStatus;
  label: string;
  icon: string;
  tone: INpsTone;
  sub: string;
  headClass: string;
}> = [
  {
    status: "novo",
    label: "Novo",
    icon: "lucide:inbox",
    tone: "critical",
    sub: "aguardando primeiro contato",
    headClass: "border-t-2 border-t-severity-critical",
  },
  {
    status: "em_contato",
    label: "Em contato",
    icon: "lucide:phone-call",
    tone: "primary",
    sub: "aguardando desfecho",
    headClass: "border-t-2 border-t-primary",
  },
  {
    status: "resolvido",
    label: "Resolvido",
    icon: "lucide:check-check",
    tone: "success",
    sub: "fechado com o cliente",
    headClass: "border-t-2 border-t-severity-success",
  },
];

const TEXT_BY_TONE: Record<INpsTone, string> = {
  primary: "text-primary",
  success: "text-severity-success",
  critical: "text-severity-critical",
  muted: "text-muted-foreground",
};

/** Hours left on the first-contact promise, negative once it has been broken. */
function slaHoursLeft(recovery: INpsRecovery, slaHours: number): number | null {
  if (recovery.recoveryStatus === "resolvido" || !recovery.respondedAt) return null;
  const due = new Date(recovery.respondedAt).getTime() + slaHours * 3_600_000;
  return Math.round((due - Date.now()) / 3_600_000);
}

function slaLabel(hoursLeft: number | null): { text: string; tone: INpsTone } {
  if (hoursLeft === null) return { text: "concluída", tone: "success" };
  if (hoursLeft < 0) return { text: `venceu há ${Math.abs(hoursLeft)}h`, tone: "critical" };
  return { text: `${hoursLeft}h no prazo`, tone: "muted" };
}

function RecoveryCard({
  recovery,
  slaHours,
  onMove,
  pending,
}: {
  recovery: INpsRecovery;
  slaHours: number;
  onMove: (status: "em_contato" | "resolvido" | null) => void;
  pending: boolean;
}) {
  const score = recovery.score ?? 0;
  const sla = slaLabel(slaHoursLeft(recovery, slaHours));

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3.5">
      <div className="flex items-start gap-2.5">
        <NpsScoreBox score={score} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-card-foreground">
            {recovery.recipientName ?? "Contato sem nome"}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {recovery.customerId ? "Cliente cadastrado" : "Contato do pool"}
          </div>
        </div>
      </div>

      {recovery.comment ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          “{recovery.comment}”
        </p>
      ) : (
        <p className="mt-3 text-[12.5px] italic text-muted-foreground/70">
          Deu a nota sem escrever nada — o motivo só aparece se alguém perguntar.
        </p>
      )}

      {recovery.reasons.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recovery.reasons.map((reason) => (
            <NpsChip key={reason} size="sm" tone={scoreTone(score)}>
              {reason}
            </NpsChip>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
        {recovery.sellerName ? (
          <NpsAvatar initials={initialsOf(recovery.sellerName)} size={22} />
        ) : null}
        <span className="truncate text-[11.5px] text-muted-foreground">
          {recovery.storeName ?? "—"}
        </span>
        <span className="ml-auto shrink-0">
          <NpsChip size="sm" tone={sla.tone} icon="lucide:clock">
            {sla.text}
          </NpsChip>
        </span>
      </div>

      {recovery.recoveryNote ? (
        <p className="mt-2.5 rounded-md bg-background/60 px-2.5 py-2 text-[11.5px] text-muted-foreground">
          <b className="text-card-foreground">Desfecho:</b> {recovery.recoveryNote}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {recovery.recoveryStatus === "novo" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onMove("em_contato")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-60"
          >
            <Icon icon="lucide:phone" size={14} />
            Iniciar contato
          </button>
        ) : null}

        {recovery.recoveryStatus === "em_contato" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onMove("resolvido")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-bold text-card-foreground hover:bg-muted disabled:opacity-60"
          >
            <Icon icon="lucide:check" size={14} />
            Resolver
          </button>
        ) : null}

        {recovery.recoveryStatus === "resolvido" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onMove("em_contato")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            <Icon icon="lucide:rotate-ccw" size={14} />
            Reabrir
          </button>
        ) : null}

        {recovery.conversationId ? (
          <Link
            to="/app/atendimento/$id"
            params={{ id: recovery.conversationId }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon icon="lucide:message-circle" size={14} />
            Conversa
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function NpsRecuperacaoTab({
  windowDays,
  audience,
  slaHours,
}: {
  windowDays: number;
  audience?: "customer" | "contact";
  slaHours: number;
}) {
  const recoveries = useNpsRecoveries({ windowDays, audience });
  const setRecovery = useSetNpsRecovery();

  const overdue = useMemo(
    () =>
      (recoveries.data ?? []).filter((item) => {
        const left = slaHoursLeft(item, slaHours);
        return left !== null && left < 0 && item.recoveryStatus !== "resolvido";
      }).length,
    [recoveries.data, slaHours],
  );

  const move = (surveyId: string, status: "em_contato" | "resolvido" | null) => {
    setRecovery.mutate(
      { surveyId, status },
      {
        onSuccess: () =>
          toast.success(
            status === "resolvido" ? "Tratativa encerrada." : "Tratativa aberta com você.",
          ),
        onError: () => toast.error("Não foi possível mover a tratativa."),
      },
    );
  };

  if (recoveries.isError) {
    return (
      <NpsNotWired>
        A fila de recuperação depende da migration{" "}
        <code className="font-mono">20260813160000_nps_recovery_and_parameters.sql</code>, que ainda
        não foi aplicada em produção. Aplicar migration é manual e exige o seu OK — até lá esta aba
        fica assim, e o resto do painel continua funcionando normalmente.
      </NpsNotWired>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-severity-critical/30 bg-severity-critical/10 px-4 py-3">
        <Icon icon="lucide:circle-alert" size={16} className="shrink-0 text-severity-critical" />
        <span className="text-[13.5px] text-card-foreground">
          Toda nota de 0 a 6 abre uma tratativa. O prazo de primeiro contato é de{" "}
          <b>{slaHours} horas</b>
          {overdue > 0 ? (
            <>
              {" "}
              — <b className="text-severity-critical">{overdue}</b>{" "}
              {overdue === 1 ? "está vencida" : "estão vencidas"}.
            </>
          ) : (
            " — nenhuma vencida."
          )}
        </span>
      </div>

      {recoveries.isLoading ? (
        <p className="py-12 text-center text-[13.5px] text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const items = (recoveries.data ?? []).filter(
              (item) => item.recoveryStatus === column.status,
            );
            return (
              <div
                key={column.status}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div
                  className={`flex items-center gap-2.5 border-b border-border px-3.5 py-3 ${column.headClass}`}
                >
                  <Icon icon={column.icon} size={15} className={TEXT_BY_TONE[column.tone]} />
                  <span className="text-[13px] font-bold text-card-foreground">{column.label}</span>
                  <span className={`font-display text-sm font-bold ${TEXT_BY_TONE[column.tone]}`}>
                    {items.length}
                  </span>
                  <span className="ml-auto truncate text-[11.5px] text-muted-foreground">
                    {column.sub}
                  </span>
                </div>
                <div className="flex min-h-[120px] flex-col gap-3 p-3.5">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[12.5px] text-muted-foreground">
                      Nada aqui.
                    </p>
                  ) : (
                    items.map((item) => (
                      <RecoveryCard
                        key={item.id}
                        recovery={item}
                        slaHours={slaHours}
                        pending={setRecovery.isPending}
                        onMove={(status) => move(item.id, status)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
