import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canDeleteStage, validateStageSet, type IStageDraft } from "../../engine/stageRules";
import { COPY } from "../../i18n/pt-BR";
import { StageRow } from "./StageRow";

export interface IStagesTabProps {
  stages: IStageDraft[];
  leadCountByStage: Map<ID, number>;
  onChange: (next: IStageDraft[]) => void;
  /**
   * A stage was dropped and its leads have to land somewhere. Recorded by the
   * page and executed BEFORE `replaceStages` — the stage cannot disappear while
   * entries still point at it, because `stage_id` carries a foreign key with no
   * cascade and Postgres would raise 23503.
   */
  onMoveLeads: (fromStageId: ID, toStageId: ID) => void;
}

export function StagesTab({
  stages,
  leadCountByStage,
  onChange,
  onMoveLeads,
}: IStagesTabProps) {
  const [pendingDelete, setPendingDelete] = useState<IStageDraft | null>(null);
  const [moveTarget, setMoveTarget] = useState<ID | "">("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // `sortableKeyboardCoordinates` IS the right getter here — this is a real
    // sortable list inside a SortableContext. The board in phase 4 had no such
    // context, which is why it needed a coordinate getter of its own; copying
    // from one screen to the other in either direction breaks the drag.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const issues = validateStageSet(stages);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = stages.findIndex((s) => s.id === active.id);
    const to = stages.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(stages, from, to).map((s, i) => ({ ...s, position: i })));
  };

  const requestRemove = (stage: IStageDraft) => {
    const leadCount = leadCountByStage.get(stage.id) ?? 0;
    const verdict = canDeleteStage({ stage, leadCount, all: stages });
    if (verdict.allowed) {
      onChange(stages.filter((s) => s.id !== stage.id).map((s, i) => ({ ...s, position: i })));
      return;
    }
    // Only "has_leads" has a way forward; the other two are refusals, and the
    // button is already disabled with the reason in its title.
    if (verdict.reason === "has_leads") {
      setMoveTarget("");
      setPendingDelete(stage);
    }
  };

  const blockedReason = (stage: IStageDraft): string | undefined => {
    const verdict = canDeleteStage({
      stage,
      leadCount: leadCountByStage.get(stage.id) ?? 0,
      all: stages,
    });
    if (verdict.allowed) return undefined;
    // "has_leads" is not a refusal — it opens the move dialog — so the button
    // stays enabled and only carries the explanation as a title.
    if (verdict.reason === "has_leads") return undefined;
    return COPY.admin.stages.blocked[verdict.reason!];
  };

  const pendingCount = pendingDelete ? (leadCountByStage.get(pendingDelete.id) ?? 0) : 0;
  const moveOptions = stages.filter((s) => s.id !== pendingDelete?.id && s.kind === "aberta");

  return (
    <div className="space-y-3">
      {issues.length > 0 && (
        <ul className="space-y-1 rounded-md border border-severity-warning/40 bg-severity-warning/10 p-2 text-[11px] text-foreground">
          {issues.map((i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Icon icon="mdi:alert-outline" size={12} aria-hidden />
              {COPY.admin.stages.issues[i]}
            </li>
          ))}
        </ul>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {stages.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                leadCount={leadCountByStage.get(stage.id) ?? 0}
                removeBlockedReason={blockedReason(stage)}
                onChange={(patch) =>
                  onChange(stages.map((s) => (s.id === stage.id ? { ...s, ...patch } : s)))
                }
                onRemove={() => requestRemove(stage)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...stages,
            {
              id: crypto.randomUUID(),
              name: "",
              kind: "aberta",
              accent: 1,
              position: stages.length,
            },
          ])
        }
      >
        <Icon icon="mdi:plus" size={16} aria-hidden />
        {COPY.admin.stages.add}
      </Button>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COPY.admin.stages.moveTitle(pendingDelete?.name ?? "")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COPY.admin.stages.moveBody(pendingCount)}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{COPY.admin.stages.moveTarget}</label>
            <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v)}>
              <SelectTrigger aria-label={COPY.admin.stages.moveTarget}>
                <SelectValue placeholder={COPY.admin.stages.moveTarget} />
              </SelectTrigger>
              <SelectContent>
                {moveOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{COPY.fiche.removeCancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={moveTarget === ""}
              onClick={() => {
                if (!pendingDelete || moveTarget === "") return;
                onMoveLeads(pendingDelete.id, moveTarget);
                onChange(
                  stages
                    .filter((s) => s.id !== pendingDelete.id)
                    .map((s, i) => ({ ...s, position: i })),
                );
                setPendingDelete(null);
              }}
            >
              {COPY.admin.stages.moveConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
