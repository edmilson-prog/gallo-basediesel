import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { INpsClass, INpsListFilters, INpsSurvey } from "@/shared/types";
import { classifyScore } from "../engine";
import { useNpsSurveys } from "../hooks/useNpsSurveys";
import { S } from "../i18n/pt-BR";

/**
 * "Respostas" tab of /app/nps — the kit's `NpsRespostas` (direction A · Denso).
 *
 * The panel above answers "how are we doing"; this tab answers "who said what".
 * So a row is built around the sentence, not the number: the score is a small
 * left rail, and the comment gets the width, quoted behind a ruler in the
 * category's colour so a screenful of answers can be skimmed for the red ones.
 *
 * The kit hard-codes its palette (`NPS` / `NPS_RESP`). It is translated to
 * semantic tokens here — a component that names a hex cannot follow the theme,
 * and this project forbids it.
 *
 * One deliberate divergence from `CATEGORY` in NpsPanelParts: passives are
 * `severity-warning` here rather than muted grey. On the panel they are a slice
 * of a bar that must recede behind promoters and detractors; in a list they are
 * rows the reader has to be able to pick out, and grey reads as "disabled".
 */

/** Strings this tab adds to the ones already in `S`. */
const L = {
  categoryAll: "Todas",
  onlyWithComment: "Só com comentário",
  reasonAll: "Todos os motivos",
  reasonFilterLabel: "Filtrar por motivo",
  noName: "Contato sem nome",
  orderRef: (ref: string) => `Pedido ${ref}`,
  openFiche: "Ficha",
  countTotal: (total: number) => `${total} ${total === 1 ? "resposta" : "respostas"}`,
  countFiltered: (shown: number, page: number) =>
    `${shown} de ${page} ${page === 1 ? "resposta" : "respostas"} nesta página`,
  emptyFiltered: "Nenhuma resposta com esses filtros.",
} as const;

/**
 * Full class names, never interpolated: Tailwind scans source text, so a class
 * assembled at runtime (`border-${tone}`) is never generated and the colour
 * silently disappears in the production build.
 */
interface ICategoryStyle {
  short: string;
  toneClass: string;
  scoreClass: string;
  rulerClass: string;
}

const CATEGORY_STYLE: Record<INpsClass, ICategoryStyle> = {
  promoter: {
    short: "Promotor",
    toneClass: "text-severity-success",
    scoreClass: "bg-severity-success/15 text-severity-success",
    rulerClass: "border-severity-success",
  },
  passive: {
    short: "Neutro",
    toneClass: "text-severity-warning",
    scoreClass: "bg-severity-warning/15 text-severity-warning",
    rulerClass: "border-severity-warning",
  },
  detractor: {
    short: "Detrator",
    toneClass: "text-severity-critical",
    scoreClass: "bg-severity-critical/15 text-severity-critical",
    rulerClass: "border-severity-critical",
  },
};

const CATEGORIES: ReadonlyArray<{ value: INpsClass | undefined; label: string }> = [
  { value: undefined, label: L.categoryAll },
  { value: "promoter", label: S.promoters },
  { value: "passive", label: S.passives },
  { value: "detractor", label: S.detractors },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Order ids are uuids in production. Printing one whole would push the name and
 * the date off the line to say nothing a reader can use, so it is shortened to
 * the prefix that is enough to match against a screen in the ERP.
 */
function shortRef(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const initials = `${first}${last}`.trim();
  return initials === "" ? "?" : initials.toUpperCase();
}

/** The kit's `NpsAvatar`. */
function NpsAvatar({ name }: { name: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-display text-[11px] font-bold uppercase text-muted-foreground"
    >
      {initialsOf(name)}
    </span>
  );
}

/** The kit's `NpsNota` — the score as a coloured tile, not a table cell. */
function NpsNota({ score, npsClass }: { score: number; npsClass: INpsClass }) {
  return (
    <span
      className={`flex size-11 shrink-0 items-center justify-center rounded-lg font-display text-xl font-bold leading-none ${CATEGORY_STYLE[npsClass].scoreClass}`}
    >
      {score}
    </span>
  );
}

/** The kit's `NpsChip` — one reason the respondent ticked. */
function NpsChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11.5px] text-muted-foreground">
      {label}
    </span>
  );
}

/** Segmented control, mirroring the panel's `Seg`. */
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
            key={item.label}
            type="button"
            aria-pressed={active}
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

function ResponseRow({ survey }: { survey: INpsSurvey }) {
  const npsClass = classifyScore(survey.score ?? 0);
  const style = CATEGORY_STYLE[npsClass];
  const comment = survey.comment?.trim() ?? "";

  return (
    <li className="group flex gap-3.5 border-b border-border py-3.5 last:border-0">
      <NpsNota score={survey.score ?? 0} npsClass={npsClass} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <NpsAvatar name={survey.recipientName} />
          <span className="truncate text-[13.5px] font-bold text-card-foreground">
            {survey.recipientName ?? L.noName}
          </span>
          <span
            className={`font-display text-[10.5px] font-bold uppercase italic ${style.toneClass}`}
          >
            {style.short}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(survey.respondedAt)}</span>
          {survey.orderId ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {L.orderRef(shortRef(survey.orderId))}
            </span>
          ) : null}

          {/*
            Row actions. Hidden until hover only from `md` up: on a touch screen
            there is no hover, and an action that can never be revealed is an
            action that does not exist. `focus-within` keeps them reachable by
            keyboard on the pointer breakpoints.
          */}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 opacity-100 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
            {survey.conversationId ? (
              <Link
                to="/app/atendimento/$id"
                params={{ id: survey.conversationId }}
                className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-semibold text-foreground hover:bg-muted"
              >
                {S.openConversation}
              </Link>
            ) : null}
            {survey.customerId ? (
              <Link
                to="/app/clientes/$id"
                params={{ id: survey.customerId }}
                className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-semibold text-foreground hover:bg-muted"
              >
                {L.openFiche}
              </Link>
            ) : null}
          </span>
        </div>

        {survey.reasons.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {survey.reasons.map((reason) => (
              <NpsChip key={reason} label={reason} />
            ))}
          </div>
        ) : null}

        {comment === "" ? null : (
          <blockquote
            className={`mt-2 border-l-2 pl-3 text-[13px] leading-relaxed text-muted-foreground ${style.rulerClass}`}
          >
            {comment}
          </blockquote>
        )}
      </div>
    </li>
  );
}

/**
 * @param filters The page-level cut (window, store, audience, search, paging).
 *   `npsClass` seeds this tab's category control and is owned by it afterwards:
 *   the tab renders the control, so it has to be the one telling the truth
 *   about which category is showing.
 */
export function NpsRespostasTab({ filters }: { filters: INpsListFilters }) {
  const [category, setCategory] = useState<INpsClass | undefined>(filters.npsClass);
  const [onlyWithComment, setOnlyWithComment] = useState(false);
  const [reason, setReason] = useState("");

  const listFilters = useMemo<INpsListFilters>(
    () => ({ ...filters, npsClass: category }),
    [filters, category],
  );

  const surveys = useNpsSurveys(listFilters);
  const page = useMemo(() => surveys.data?.data ?? [], [surveys.data]);
  const total = surveys.data?.total ?? 0;

  // Category is a server-side cut, so it pages correctly. Comment and reason
  // have no server-side equivalent and narrow the loaded page only — which is
  // why the counter switches to "nesta página" once either is on, rather than
  // quietly presenting a page's worth of matches as the whole set.
  const reasonOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const survey of page) {
      for (const item of survey.reasons) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  }, [page]);

  const visible = useMemo(
    () =>
      page.filter((survey) => {
        if (onlyWithComment && !survey.comment?.trim()) return false;
        if (reason !== "" && !survey.reasons.includes(reason)) return false;
        return true;
      }),
    [page, onlyWithComment, reason],
  );

  const narrowed = onlyWithComment || reason !== "";
  // A reason chosen on a previous page may be absent from the current one. It
  // stays listed so the select never displays a value it does not offer.
  const reasonMissing = reason !== "" && !reasonOptions.some((item) => item.label === reason);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Seg items={CATEGORIES} value={category} onChange={setCategory} />

        <button
          type="button"
          aria-pressed={onlyWithComment}
          onClick={() => setOnlyWithComment((on) => !on)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            onlyWithComment
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {L.onlyWithComment}
        </button>

        <select
          value={reason}
          aria-label={L.reasonFilterLabel}
          onChange={(event) => setReason(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground"
        >
          <option value="">{L.reasonAll}</option>
          {reasonMissing ? <option value={reason}>{reason}</option> : null}
          {reasonOptions.map((item) => (
            <option key={item.label} value={item.label}>
              {item.label} ({item.count})
            </option>
          ))}
        </select>

        <span className="ml-auto text-xs text-muted-foreground">
          {narrowed ? L.countFiltered(visible.length, page.length) : L.countTotal(total)}
        </span>
      </div>

      {surveys.isLoading ? (
        <p className="text-sm text-muted-foreground">{S.loading}</p>
      ) : page.length === 0 ? (
        <p className="text-sm text-muted-foreground">{S.empty}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{L.emptyFiltered}</p>
      ) : (
        <ul className="flex flex-col">
          {visible.map((survey) => (
            <ResponseRow key={survey.id} survey={survey} />
          ))}
        </ul>
      )}
    </div>
  );
}
