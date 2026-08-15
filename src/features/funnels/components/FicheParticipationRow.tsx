import { useState } from "react";
import type { ID, ILeadFunnelStage } from "@/shared/types";
import { Icon } from "@/components/Icon";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import type { IFicheParticipation } from "../engine/ficheParticipations";
import { COPY } from "../i18n/pt-BR";

export interface IFicheParticipationRowProps {
  participation: IFicheParticipation;
  stages: ILeadFunnelStage[];
  canEdit: boolean;
  isPending: boolean;
  /** True when this is the lead's only participation — changes the warning. */
  isOnly: boolean;
  onMove: (stageId: ID) => void;
  onRemove: () => void;
}

/**
 * One funnel the lead sits in, and the stage it sits at there.
 *
 * Laid out for the 360px panel: the funnel name truncates at 110px, the stage
 * select takes 150px, the menu 24px.
 */
export function FicheParticipationRow({
  participation,
  stages,
  canEdit,
  isPending,
  isOnly,
  onMove,
  onRemove,
}: IFicheParticipationRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { funnel, stage } = participation;

  // The badge reads the PARTICIPATION's stage kind, not `lead.convertedToCustomerId`
  // — the same correction phase 4 made on the board card, for the same reason:
  // a lead won in one funnel would otherwise read as converted in all of them.
  const won = stage?.kind === "ganho";
  const lost = stage?.kind === "perda";

  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(funnel.accent).dot)}
      />
      <span
        className="max-w-[110px] shrink-0 truncate text-xs text-foreground"
        title={funnel.name}
      >
        {funnel.name}
      </span>

      {canEdit ? (
        <Select
          value={stage?.id ?? ""}
          onValueChange={onMove}
          disabled={isPending || stages.length === 0}
        >
          <SelectTrigger
            className="h-7 w-[150px] text-xs"
            aria-label={COPY.fiche.stageLabel(funnel.name)}
          >
            {isPending && (
              <Icon
                icon="mdi:loading"
                size={12}
                aria-hidden
                // No skeleton anywhere in this block: the panel must not blink
                // while somebody is in the middle of a conversation.
                className="mr-1 shrink-0 animate-spin motion-reduce:animate-none"
              />
            )}
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="inline-flex w-[150px] items-center gap-1 truncate rounded text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:lock-outline" size={12} className="shrink-0" aria-hidden />
              <span className="truncate">{stage?.name ?? "—"}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{COPY.fiche.noStagePermission}</TooltipContent>
        </Tooltip>
      )}

      {(won || lost) && (
        <span
          className={cn(
            "shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase",
            won
              ? "bg-severity-success/15 text-severity-success"
              : "bg-severity-critical/15 text-severity-critical",
          )}
        >
          {won ? COPY.fiche.wonBadge : COPY.fiche.lostBadge}
        </span>
      )}

      {canEdit && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={COPY.fiche.rowMenu(funnel.name)}
              disabled={isPending}
              className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:dots-vertical" size={14} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="gap-2 text-xs text-destructive focus:text-destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                <Icon icon="mdi:close-circle-outline" size={14} aria-hidden />
                {COPY.fiche.remove}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{COPY.fiche.removeTitle(funnel.name)}</AlertDialogTitle>
                <AlertDialogDescription>
                  {isOnly ? COPY.fiche.removeBodyLast : COPY.fiche.removeBody}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{COPY.fiche.removeCancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmOpen(false);
                    onRemove();
                  }}
                >
                  {COPY.fiche.removeConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}
