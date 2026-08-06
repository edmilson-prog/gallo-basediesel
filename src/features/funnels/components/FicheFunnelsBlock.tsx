import { useState } from "react";
import type { ID, ILeadFunnelStage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useLeadFicheFunnels } from "../hooks/useLeadFicheFunnels";
import { useEntryMutations } from "../hooks/useEntryMutations";
import { COPY } from "../i18n/pt-BR";
import { AddToFunnelMenu } from "./AddToFunnelMenu";
import { FicheParticipationRow } from "./FicheParticipationRow";

export interface IFicheFunnelsBlockProps {
  leadId: ID;
  conversationId: ID;
  storeId: ID | null | undefined;
  /** Same composition the fiche already uses for converting a lead. */
  canEdit: boolean;
}

/** Stable identity, so a funnel whose stages have not landed does not thrash. */
const NO_STAGES: ILeadFunnelStage[] = [];

/**
 * The lead's funnels, inside the conversation.
 *
 * Sits above the data rows because it is the first actionable thing for
 * somebody who is answering a message: which funnels this person is in, at
 * what stage, and a way to put them in another one without leaving.
 */
export function FicheFunnelsBlock({
  leadId,
  conversationId,
  storeId,
  canEdit,
}: IFicheFunnelsBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const { view, addableFunnels, stagesByFunnel, isLoading } = useLeadFicheFunnels({
    conversationId,
    storeId,
    expanded,
  });
  const { moveStage, addToFunnel, removeFrom, pendingEntryId } = useEntryMutations({
    conversationId,
    storeId,
  });

  const handleAdd = (funnelId: ID, funnelName: string) =>
    addToFunnel(leadId, funnelId, funnelName);

  // Nothing at all while the first read is in flight — a skeleton here would
  // blink the panel of someone mid-conversation, which the spec rules out.
  if (isLoading) return null;

  const isEmpty = view.visible.length === 0 && view.lockedCount === 0;
  const totalReachable = view.visible.length + view.hiddenCount;

  return (
    <section aria-labelledby="fiche-funnels-title" className="mb-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3
          id="fiche-funnels-title"
          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {COPY.fiche.title}
        </h3>
        {canEdit && !isEmpty && <AddToFunnelMenu funnels={addableFunnels} onAdd={handleAdd} />}
      </div>

      {isEmpty ? (
        // Should not happen — a trigger puts every new lead in the default
        // funnel (spec §5.4). Handled anyway, because a blank block is
        // something nobody can interpret.
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {COPY.fiche.empty}
          {canEdit && <AddToFunnelMenu funnels={addableFunnels} onAdd={handleAdd} variant="text" />}
        </p>
      ) : (
        <ul className="space-y-1">
          {view.visible.map((p) => (
            <FicheParticipationRow
              key={p.entry.id}
              participation={p}
              stages={stagesByFunnel.get(p.funnel.id) ?? NO_STAGES}
              canEdit={canEdit}
              isPending={pendingEntryId === p.entry.id}
              isOnly={totalReachable === 1 && view.lockedCount === 0}
              onMove={(stageId) => {
                const stage = stagesByFunnel.get(p.funnel.id)?.find((s) => s.id === stageId);
                if (!stage) return;
                moveStage(p.entry, stageId, p.funnel.name, stage.name);
              }}
              onRemove={() => removeFrom(p.entry, p.funnel.name)}
            />
          ))}
        </ul>
      )}

      {view.lockedCount > 0 && (
        <p
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          title={COPY.fiche.lockedHint}
        >
          <Icon icon="mdi:lock-outline" size={11} aria-hidden />
          {COPY.fiche.locked(view.lockedCount)}
        </p>
      )}

      {(view.hiddenCount > 0 || expanded) && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-[11px]"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? COPY.fiche.seeLess : COPY.fiche.seeAll(view.hiddenCount)}
        </Button>
      )}
    </section>
  );
}
