import { useEffect, useRef, useState } from "react";
import type { ID, ILeadFunnel, ILeadFunnelStage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import type { IFicheParticipation } from "@/features/funnels/engine/ficheParticipations";
import { AddToFunnelMenu } from "@/features/funnels/components/AddToFunnelMenu";
import { FUNNELS_COPY } from "@/features/funnels";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail.funnels;
const FUNNELS_FICHE = FUNNELS_COPY;
const DAY_MS = 86_400_000;

export interface ILeadFunnelsCardProps {
  participations: IFicheParticipation[];
  stagesByFunnel: Map<ID, ILeadFunnelStage[]>;
  addableFunnels: ILeadFunnel[];
  lockedCount: number;
  totalValue: number;
  canEdit: boolean;
  pendingEntryId: ID | null;
  onMove: (participation: IFicheParticipation, stageId: ID) => void;
  onSetValue: (participation: IFicheParticipation, value: number | undefined) => void;
  onAdd: (funnelId: ID, funnelName: string) => void;
  onRemove: (participation: IFicheParticipation) => void;
}

/**
 * Every funnel this lead is in, and where it stands in each.
 *
 * The screen used to show a single stage — `lead.stage`, the single-pipeline
 * era's snapshot, marked `@deprecated` in the schema. The truth is
 * `lead_funnel_entries`: a lead can sit in several funnels at once, each with
 * its own stage, its own value and its own outcome. Counting one value across
 * all of them inflates the forecast, which is why the total in the header sums
 * the participations rather than repeating the lead's number.
 *
 * Moving is clicking the destination stage. There is no select to open, no
 * dialog to confirm: it is reversible, frequent, and the toast carries an undo.
 */
export function LeadFunnelsCard({
  participations,
  stagesByFunnel,
  addableFunnels,
  lockedCount,
  totalValue,
  canEdit,
  pendingEntryId,
  onMove,
  onSetValue,
  onAdd,
  onRemove,
}: ILeadFunnelsCardProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon icon="mdi:source-branch" size={14} className="text-muted-foreground" aria-hidden />
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {COPY.title}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {totalValue > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatBRL(totalValue)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{COPY.note}</TooltipContent>
            </Tooltip>
          )}
          {canEdit && <AddToFunnelMenu funnels={addableFunnels} onAdd={onAdd} />}
        </div>
      </header>

      {participations.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{COPY.empty}</p>
      ) : (
        participations.map((participation, index) => (
          <FunnelRow
            key={participation.entry.id}
            participation={participation}
            stages={stagesByFunnel.get(participation.funnel.id) ?? []}
            canEdit={canEdit}
            isPending={pendingEntryId === participation.entry.id}
            isOnly={participations.length === 1 && lockedCount === 0}
            last={index === participations.length - 1}
            onMove={(stageId) => onMove(participation, stageId)}
            onSetValue={(value) => onSetValue(participation, value)}
            onRemove={() => onRemove(participation)}
          />
        ))
      )}

      {lockedCount > 0 && (
        <p
          className="flex items-center gap-1.5 border-t border-border px-4 py-2 text-[11px] text-muted-foreground"
          title={FUNNELS_FICHE.fiche.lockedHint}
        >
          <Icon icon="mdi:lock-outline" size={11} aria-hidden />
          {FUNNELS_FICHE.fiche.locked(lockedCount)}
        </p>
      )}

      <p className="border-t border-border px-4 py-2 text-pretty text-[11px] text-muted-foreground">
        {COPY.note}
      </p>
    </section>
  );
}

interface IFunnelRowProps {
  participation: IFicheParticipation;
  stages: ILeadFunnelStage[];
  canEdit: boolean;
  isPending: boolean;
  isOnly: boolean;
  last: boolean;
  onMove: (stageId: ID) => void;
  onSetValue: (value: number | undefined) => void;
  onRemove: () => void;
}

function FunnelRow({
  participation,
  stages,
  canEdit,
  isPending,
  isOnly,
  last,
  onMove,
  onSetValue,
  onRemove,
}: IFunnelRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { entry, funnel, stage } = participation;
  const accent = getAccentClasses(funnel.accent);

  const daysInStage = Math.max(
    0,
    Math.floor((Date.now() - new Date(entry.enteredStageAt).getTime()) / DAY_MS),
  );

  return (
    <div className={cn("px-4 py-3", !last && "border-b border-border")}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span
          aria-hidden
          className={cn("grid size-6 shrink-0 place-items-center rounded", accent.chip)}
        >
          <Icon icon={funnel.icon} size={13} className={accent.icon} />
        </span>
        <span className="truncate text-sm font-semibold text-foreground">{funnel.name}</span>
        {funnel.isDefault && (
          <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            {COPY.triageBadge}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon icon="mdi:clock-outline" size={12} aria-hidden />
            {COPY.daysInStage(daysInStage)}
          </span>

          <ValueField
            value={entry.estimatedValue}
            label={COPY.valueLabel(funnel.name)}
            canEdit={canEdit}
            disabled={isPending}
            onSave={onSetValue}
          />

          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={FUNNELS_FICHE.fiche.rowMenu(funnel.name)}
                disabled={isPending}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon
                  icon={isPending ? "svg-spinners:ring-resize" : "mdi:dots-horizontal"}
                  size={14}
                  aria-hidden
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                  onSelect={() => setConfirmOpen(true)}
                >
                  <Icon icon="mdi:close-circle-outline" size={14} aria-hidden />
                  {COPY.remove}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </div>

      <StageTrack
        stages={stages}
        currentStageId={stage?.id}
        accent={funnel.accent}
        disabled={!canEdit || isPending}
        onMove={onMove}
      />

      {canEdit && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{FUNNELS_FICHE.fiche.removeTitle(funnel.name)}</AlertDialogTitle>
              <AlertDialogDescription>
                {isOnly ? FUNNELS_FICHE.fiche.removeBodyLast : FUNNELS_FICHE.fiche.removeBody}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{FUNNELS_FICHE.fiche.removeCancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOpen(false);
                  onRemove();
                }}
              >
                {FUNNELS_FICHE.fiche.removeConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

interface IStageTrackProps {
  stages: ILeadFunnelStage[];
  currentStageId: ID | undefined;
  accent: number;
  disabled: boolean;
  onMove: (stageId: ID) => void;
}

/**
 * Where the lead is in this funnel, and where it can go — in one row.
 *
 * A select answers "qual etapa" and hides the shape of the funnel; the track
 * shows both at once, and moving is a click on the destination rather than two
 * clicks through a list of names you already know.
 */
function StageTrack({ stages, currentStageId, accent, disabled, onMove }: IStageTrackProps) {
  const currentIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex gap-1">
      {stages.map((stage, index) => {
        const current = stage.id === currentStageId;
        const done = currentIndex >= 0 && index < currentIndex;
        // A terminal stage keeps its outcome colour, never the funnel's: won
        // and lost are the two things you must not misread at a glance.
        const bar =
          stage.kind === "ganho"
            ? "bg-severity-success"
            : stage.kind === "perda"
              ? "bg-severity-critical"
              : getAccentClasses(accent).bar;

        return (
          <button
            key={stage.id}
            type="button"
            disabled={disabled || current}
            onClick={() => onMove(stage.id)}
            title={current ? COPY.currentStage : COPY.moveTo(stage.name)}
            aria-current={current ? "step" : undefined}
            className={cn(
              "min-w-0 flex-1 rounded px-2 pb-1.5 pt-1 text-left transition",
              current
                ? "bg-muted ring-1 ring-inset ring-border"
                : "bg-muted/40 enabled:hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled && !current && "cursor-default opacity-70",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mb-1.5 block h-0.5 rounded-full",
                current || done ? bar : "bg-border",
                done && "opacity-50",
              )}
            />
            <span
              className={cn(
                "block truncate text-[11px]",
                current ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {stage.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface IValueFieldProps {
  value: number | undefined;
  label: string;
  canEdit: boolean;
  disabled: boolean;
  onSave: (value: number | undefined) => void;
}

/** The participation's own value, edited in place. Empty is an invitation. */
function ValueField({ value, label, canEdit, disabled, onSave }: IValueFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== undefined ? String(value) : "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!canEdit) {
    return (
      <span
        className={cn(
          "text-sm tabular-nums",
          value !== undefined ? "font-semibold text-foreground" : "text-muted-foreground/60",
        )}
      >
        {value !== undefined ? formatBRL(value) : LEADS_STRINGS.card.noValueShort}
      </span>
    );
  }

  if (editing) {
    const commit = () => {
      setEditing(false);
      const trimmed = draft.trim();
      const parsed = trimmed ? Number(trimmed.replace(/\./g, "").replace(",", ".")) : undefined;
      // An unparsable string is not a request to wipe the value — only an
      // emptied field is.
      if (trimmed && !Number.isFinite(parsed)) return;
      if (parsed !== value) onSave(parsed);
    };
    return (
      <Input
        ref={ref}
        value={draft}
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value !== undefined ? String(value) : "");
            setEditing(false);
          }
        }}
        className="h-7 w-28 text-right text-sm tabular-nums"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={() => {
        setDraft(value !== undefined ? String(value) : "");
        setEditing(true);
      }}
      className={cn(
        "rounded px-1.5 py-0.5 text-sm tabular-nums transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        value !== undefined ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      {value !== undefined ? (
        formatBRL(value)
      ) : (
        <span className="inline-flex items-center gap-1 text-xs">
          <Icon icon="mdi:plus" size={11} aria-hidden />
          {COPY.addValue}
        </span>
      )}
    </button>
  );
}
