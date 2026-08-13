import type { ReactNode } from "react";
import type { INpsClass } from "@/shared/types";
import { classifyScore, NPS_TARGET, npsBandLabel } from "../engine";
import { NpsStack } from "./NpsPanelParts";

/**
 * "Embutidos" tab — the showcase of where NPS lands on screens that already
 * exist: the "Seu NPS" widget on the attendant's Início and the "NPS do
 * cliente" block on the fiche, with the history of answers.
 *
 * This is a preview, not a live surface. It renders sample data on purpose:
 * the point is to show the shape and the wording of each embed before it is
 * wired into the host screen, and a preview that quietly reads production
 * would show an empty card on the very day someone comes here to judge the
 * design. Every frame says so in the UI.
 *
 * Nothing here is interactive. A mock with a button that does nothing is a
 * dead end, so the action controls are rendered as inert labels and each frame
 * states it.
 *
 * Palette follows the project rule — semantic tokens only. The fiche block
 * reuses the tones of `CustomerNpsBadge` (success / warning / critical for
 * promoter / passive / detractor), because it is the evolution of that badge
 * and the two must not disagree on what a "Neutro" looks like.
 */

const T = {
  previewTag: "Prévia",
  previewTitle: "Como o NPS aparece nas outras telas",
  previewBody:
    "Esta aba é uma vitrine. Os números e comentários abaixo são exemplos — não refletem respostas reais — e os controles são ilustrativos, não respondem ao clique.",

  dashboardWhere: "Início do atendente",
  dashboardTitle: "Widget “Seu NPS”",
  dashboardNote:
    "Fica na coluna de indicadores do Início, ao lado dos demais cards do atendente. Mostra o NPS das conversas que ele mesmo resolveu.",

  ficheWhere: "Ficha do cliente · aba Atendimento",
  ficheTitle: "Bloco “NPS do cliente”",
  ficheNote:
    "Hoje o cabeçalho da ficha já exibe o selo “NPS · classe”. Este bloco é a evolução dele: além da última nota, traz o histórico de respostas do cliente.",

  widgetTitle: "Seu NPS",
  widgetWindow: "90 dias",
  widgetScopeHint: "suas conversas resolvidas",
  widgetDelta: "vs. janela anterior",
  widgetAboveTarget: "acima da meta",
  widgetBelowTarget: "abaixo da meta",
  widgetFooter: (responses: number, sent: number) =>
    `${responses} respostas de ${sent} pesquisas enviadas`,
  widgetAction: "Ver painel completo",

  ficheBlockTitle: "NPS do cliente",
  ficheLastAnswer: "Última resposta",
  ficheTrigger: "Conversa resolvida",
  ficheHistory: "Histórico de notas",
  ficheTrend: "Evolução",
  ficheNoComment: "Sem comentário.",
  ficheSource: "Respostas coletadas por WhatsApp após a conversa ser resolvida.",
  ficheAction: "Abrir conversa da resposta",

  ghostLabel: "outros cards do Início",
} as const;

const CLASS_LABEL: Record<INpsClass, string> = {
  promoter: "Promotor",
  passive: "Neutro",
  detractor: "Detrator",
};

/**
 * Full class names, never interpolated: Tailwind scans source text, so a class
 * assembled at runtime (`text-severity-${tone}`) is never generated and the
 * colour silently disappears from the production build.
 */
const CLASS_BADGE: Record<INpsClass, string> = {
  promoter: "bg-severity-success/15 text-severity-success",
  passive: "bg-severity-warning/15 text-severity-warning",
  detractor: "bg-severity-critical/15 text-severity-critical",
};

const CLASS_TEXT: Record<INpsClass, string> = {
  promoter: "text-severity-success",
  passive: "text-severity-warning",
  detractor: "text-severity-critical",
};

/** Sample figures for the attendant widget. Chosen to sit just above the target. */
interface INpsWidgetSample {
  score: number;
  previousScore: number;
  responses: number;
  sent: number;
  promoters: number;
  passives: number;
  detractors: number;
}

const WIDGET_SAMPLE: INpsWidgetSample = {
  score: 62,
  previousScore: 54,
  responses: 34,
  sent: 51,
  promoters: 24,
  passives: 7,
  detractors: 3,
};

/** One answer in the fiche history. */
interface INpsAnswerSample {
  id: string;
  respondedAt: string;
  score: number;
  comment: string | null;
}

const CUSTOMER_SAMPLE = "Transportes Zanella Ltda";

/**
 * Newest first — and deliberately one of each class, so the frame shows all
 * three tones. Typed as a non-empty tuple so the "latest" read needs no guard.
 */
const ANSWER_SAMPLES: [INpsAnswerSample, ...INpsAnswerSample[]] = [
  {
    id: "a1",
    respondedAt: "2026-08-04",
    score: 9,
    comment: "Atendimento rápido e a peça veio certa de primeira.",
  },
  {
    id: "a2",
    respondedAt: "2026-05-22",
    score: 7,
    comment: "Preço bom, mas a entrega atrasou dois dias.",
  },
  {
    id: "a3",
    respondedAt: "2026-02-11",
    score: 4,
    comment: "Fiquei sem retorno do orçamento por quase uma semana.",
  },
];

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface INpsEmbedFrameProps {
  where: string;
  title: string;
  note: string;
  /** Rendered to the side of the embed, as context for where it sits. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * The dashed frame around each embed. The dashed border is the whole point:
 * it marks the boundary between "this is the component" and "this is the
 * screen it lives on", which a solid card would blur.
 */
function NpsEmbedFrame({ where, title, note, aside, children }: INpsEmbedFrameProps) {
  return (
    <figure className="m-0 flex flex-col gap-2.5">
      <figcaption className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[13px] font-bold text-card-foreground">{title}</span>
        <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {where}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {T.previewTag}
        </span>
      </figcaption>

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
        {aside ? (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_128px]">
            <div className="min-w-0">{children}</div>
            {aside}
          </div>
        ) : (
          children
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
    </figure>
  );
}

/** Decorative stand-ins for the neighbouring cards of the host screen. */
function GhostCards() {
  return (
    <div className="hidden flex-col gap-3 sm:flex" aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className="rounded-xl border border-border bg-card/60 p-3">
          <div className="h-2 w-2/3 rounded bg-muted" />
          <div className="mt-3 h-5 w-1/2 rounded bg-muted" />
          <div className="mt-2.5 h-2 w-full rounded bg-muted" />
        </div>
      ))}
      <span className="text-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
        {T.ghostLabel}
      </span>
    </div>
  );
}

/** Embed 1 — the attendant's own score, as it would sit on the Início. */
function SeuNpsWidget() {
  const { score, previousScore, responses, sent, promoters, passives, detractors } = WIDGET_SAMPLE;
  const delta = score - previousScore;
  const aboveTarget = score >= NPS_TARGET;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-[13px] font-bold text-card-foreground">{T.widgetTitle}</span>
        <span className="text-xs text-muted-foreground">{T.widgetScopeHint}</span>
        <span className="ml-auto rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {T.widgetWindow}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[44px] font-extrabold leading-[0.85] text-foreground">
            {score}
          </span>
          <span className="font-display text-[12.5px] font-bold uppercase italic text-primary">
            {npsBandLabel(score)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={delta >= 0 ? "text-severity-success" : "text-severity-critical"}>
            {delta >= 0 ? "+" : ""}
            {delta} pts {T.widgetDelta}
          </span>
          <span className="text-muted-foreground">
            Meta {NPS_TARGET} ·{" "}
            <b className={aboveTarget ? "text-severity-success" : "text-severity-warning"}>
              {aboveTarget ? T.widgetAboveTarget : T.widgetBelowTarget}
            </b>
          </span>
        </div>

        <div className="mt-4">
          <NpsStack
            promoters={promoters}
            passives={passives}
            detractors={detractors}
            height={10}
            labels
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">{T.widgetFooter(responses, sent)}</span>
          {/* Inert on purpose — this is a preview, not the live widget. */}
          <span className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground">
            {T.widgetAction}
          </span>
        </div>
      </div>
    </article>
  );
}

/** Embed 2 — the customer block on the fiche, with the history of answers. */
function CustomerNpsBlock() {
  const latest = ANSWER_SAMPLES[0];
  const latestClass = classifyScore(latest.score);
  /** Oldest → newest, which is the direction people read a trend in. */
  const trail = [...ANSWER_SAMPLES].reverse();

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-[13px] font-bold text-card-foreground">{T.ficheBlockTitle}</span>
        <span className="truncate text-xs text-muted-foreground">{CUSTOMER_SAMPLE}</span>
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CLASS_BADGE[latestClass]}`}
        >
          NPS {latest.score} · {CLASS_LABEL[latestClass]}
        </span>
      </div>

      <div className="p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          {T.ficheLastAnswer}
        </div>
        <div className="mt-2 flex items-start gap-3">
          <div
            className={`font-display text-[34px] font-bold leading-[0.9] ${CLASS_TEXT[latestClass]}`}
          >
            {latest.score}
          </div>
          <div className="min-w-0 flex-1">
            {/* The band label belongs to the aggregate score, never to a single
                answer — here the caption carries the trigger and the date. */}
            <div className="font-display text-[11px] font-bold uppercase italic text-muted-foreground">
              {T.ficheTrigger} · {formatDate(latest.respondedAt)}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-card-foreground">
              {latest.comment ?? T.ficheNoComment}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {T.ficheTrend}
          </span>
          {trail.map((answer, index) => (
            <span key={answer.id} className="inline-flex items-center gap-2">
              {index > 0 ? <span className="text-muted-foreground/70">→</span> : null}
              <span
                className={`inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 font-display text-[13px] font-bold ${CLASS_BADGE[classifyScore(answer.score)]}`}
              >
                {answer.score}
              </span>
            </span>
          ))}
        </div>

        <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          {T.ficheHistory}
        </div>
        <ul className="mt-1">
          {ANSWER_SAMPLES.map((answer) => {
            const answerClass = classifyScore(answer.score);
            return (
              <li
                key={answer.id}
                className="flex items-start gap-3 border-b border-border py-2.5 last:border-0"
              >
                <span
                  className={`mt-0.5 inline-flex min-w-7 shrink-0 justify-center rounded px-1.5 py-0.5 text-[13px] font-semibold ${CLASS_BADGE[answerClass]}`}
                >
                  {answer.score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12.5px] font-semibold text-card-foreground">
                      {CLASS_LABEL[answerClass]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(answer.respondedAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                    {answer.comment ?? T.ficheNoComment}
                  </span>
                </span>
                {/* Inert on purpose — this is a preview, not the live block. */}
                <span className="hidden shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground sm:inline">
                  {T.ficheAction}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {T.ficheSource}
        </p>
      </div>
    </article>
  );
}

export function NpsEmbedsTab() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          {T.previewTag}
        </div>
        <div className="mt-1 text-[13px] font-bold text-card-foreground">{T.previewTitle}</div>
        <p className="mt-1 max-w-[76ch] text-xs leading-relaxed text-muted-foreground">
          {T.previewBody}
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <NpsEmbedFrame
          where={T.dashboardWhere}
          title={T.dashboardTitle}
          note={T.dashboardNote}
          aside={<GhostCards />}
        >
          <SeuNpsWidget />
        </NpsEmbedFrame>

        <NpsEmbedFrame where={T.ficheWhere} title={T.ficheTitle} note={T.ficheNote}>
          <CustomerNpsBlock />
        </NpsEmbedFrame>
      </div>
    </div>
  );
}
