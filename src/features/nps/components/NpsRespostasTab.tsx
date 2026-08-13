import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import type { INpsClass, INpsSurvey } from "@/shared/types";
import { classifyScore } from "../engine";
import { useNpsSurveys } from "../hooks/useNpsSurveys";
import { NPS_ALL_REASONS } from "../pages/NpsSurveyPublicPage";
import { NpsAvatar, NpsChip, NpsScoreBox, NpsSeg } from "./NpsKit";
import { initialsOf, scoreTone } from "./npsTones";

/**
 * "Respostas" — the kit's `NpsRespostas` (`nps-views.jsx`).
 *
 * The panel's table answers "what is the number"; this answers "who said what".
 * Each row keeps the answer next to the person and the attendant who served
 * them, because a comment read without either is a complaint about nobody.
 *
 * All three filters run on the server. Filtering a page client-side would make
 * "42 de 128" a lie about the page rather than a fact about the window.
 */

const CLASS_BORDER: Record<INpsClass, string> = {
  promoter: "border-severity-success",
  passive: "border-muted-foreground/40",
  detractor: "border-severity-critical",
};

/** "hoje · 09:12", "ontem · 17:26", "12/08 · 15:02" — the kit's `dt`. */
function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const at = new Date(iso);
  const time = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(at)) / 86_400_000);

  if (days === 0) return `hoje · ${time}`;
  if (days === 1) return `ontem · ${time}`;
  if (days < 7) return `${days} dias · ${time}`;
  return `${at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${time}`;
}

const TRIGGER_LABEL: Record<INpsSurvey["trigger"], string> = {
  conversation_resolved: "Conversa resolvida",
  order_delivered: "Pedido entregue",
  manual: "Envio manual",
};

function SurveyRow({ survey }: { survey: INpsSurvey }) {
  const score = survey.score ?? 0;
  const npsClass = classifyScore(score);
  const tone = scoreTone(score);

  return (
    <div className="group grid grid-cols-1 gap-4 border-b border-border p-4 transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[44px_1fr_210px]">
      <NpsScoreBox score={score} size={44} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-card-foreground">
            {survey.recipientName ?? "Contato sem nome"}
          </span>
          <NpsChip size="sm" variant="line">
            {survey.customerId ? "Cliente" : "Contato"}
          </NpsChip>
        </div>

        <div className="mt-1 text-[12.5px] text-muted-foreground">
          {TRIGGER_LABEL[survey.trigger]}
        </div>

        {survey.comment ? (
          <p
            className={`mt-2.5 max-w-[640px] border-l-2 pl-3 text-[13.5px] leading-relaxed text-muted-foreground ${CLASS_BORDER[npsClass]}`}
          >
            {survey.comment}
          </p>
        ) : null}

        {survey.reasons.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {survey.reasons.map((reason) => (
              <NpsChip key={reason} size="sm" tone={tone}>
                {reason}
              </NpsChip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="md:text-right">
        <div className="flex items-center gap-2 md:justify-end">
          <span className="truncate text-[12.5px] text-muted-foreground">
            {survey.sellerName?.split(" ")[0] ?? "Sem atendente"}
          </span>
          {survey.sellerName ? (
            <NpsAvatar initials={initialsOf(survey.sellerName)} size={24} />
          ) : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {survey.storeName ? `${survey.storeName} · ` : ""}
          {formatWhen(survey.respondedAt)}
        </div>

        {/* Always reachable by keyboard; only revealed on hover for the mouse. */}
        <div className="mt-3 flex gap-1.5 opacity-100 transition-opacity md:justify-end md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {survey.conversationId ? (
            <Link
              to="/app/atendimento/$id"
              params={{ id: survey.conversationId }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon icon="lucide:message-circle" size={14} />
              Conversar
            </Link>
          ) : null}
          {survey.customerId ? (
            <Link
              to="/app/clientes/$id"
              params={{ id: survey.customerId }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon icon="lucide:arrow-up-right" size={14} />
              Ficha
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NpsRespostasTab({
  windowDays,
  audience,
  counts,
}: {
  windowDays: number;
  audience?: "customer" | "contact";
  counts: { total: number; promoters: number; passives: number; detractors: number };
}) {
  const [npsClass, setNpsClass] = useState<INpsClass | undefined>(undefined);
  const [onlyWithComment, setOnlyWithComment] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [search, setSearch] = useState("");

  const surveys = useNpsSurveys({
    windowDays,
    audience,
    npsClass,
    hasComment: onlyWithComment || undefined,
    reason: reason || undefined,
    search,
    page: 1,
    pageSize: 50,
  });

  const rows = surveys.data?.data ?? [];
  const total = surveys.data?.total ?? 0;

  const classItems = useMemo(
    () => [
      { value: undefined as INpsClass | undefined, label: `Todas (${counts.total})` },
      { value: "promoter" as const, label: `Promotores (${counts.promoters})` },
      { value: "passive" as const, label: `Neutros (${counts.passives})` },
      { value: "detractor" as const, label: `Detratores (${counts.detractors})` },
    ],
    [counts],
  );

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <NpsSeg items={classItems} value={npsClass} onChange={setNpsClass} ariaLabel="Categoria" />

        <button
          type="button"
          aria-pressed={onlyWithComment}
          onClick={() => setOnlyWithComment((current) => !current)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-[7px] text-[12.5px] font-semibold transition-colors ${
            onlyWithComment
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon icon={onlyWithComment ? "lucide:check-square" : "lucide:square"} size={14} />
          Só com comentário
        </button>

        <select
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label="Filtrar por motivo"
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12.5px] font-semibold text-muted-foreground"
        >
          <option value="">Todos os motivos</option>
          {NPS_ALL_REASONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar no comentário…"
          className="w-52 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <div className="ml-auto text-[12.5px] text-muted-foreground">
          {rows.length} de {total} {total === 1 ? "resposta" : "respostas"}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {surveys.isLoading ? (
          <p className="px-5 py-12 text-center text-[13.5px] text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13.5px] text-muted-foreground">
            Nenhuma resposta com esse filtro.
          </p>
        ) : (
          rows.map((survey) => <SurveyRow key={survey.id} survey={survey} />)
        )}
      </div>

      {total > rows.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Mostrando as {rows.length} respostas mais recentes de {total}. Estreite a janela ou um
          filtro para ver o resto.
        </p>
      ) : null}
    </div>
  );
}
