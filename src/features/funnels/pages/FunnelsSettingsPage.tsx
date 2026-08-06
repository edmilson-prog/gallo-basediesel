import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILeadFunnel, ILeadFunnelStage } from "@/shared/types";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { validateStageSet, type IStageDraft } from "../engine/stageRules";
import { resolveAccessPreview } from "../engine/accessPreview";
import { useFunnelAdmin } from "../hooks/useFunnelAdmin";
import { COPY } from "../i18n/pt-BR";
import { NewFunnelModal } from "../components/NewFunnelModal";
import { AccessMatrixDialog } from "../components/admin/AccessMatrixDialog";
import { AccessTab } from "../components/admin/AccessTab";
import { FunnelAdminRail } from "../components/admin/FunnelAdminRail";
import { GeneralTab } from "../components/admin/GeneralTab";
import { StagesTab } from "../components/admin/StagesTab";

type GeneralDraft = Pick<
  ILeadFunnel,
  "name" | "icon" | "accent" | "description" | "entryAlertThreshold"
>;

interface IDraft {
  general: GeneralDraft;
  stages: IStageDraft[];
  grantedIds: ID[];
  openToStore: boolean;
  /** Stages dropped in this draft, and where their leads must go first. */
  leadMoves: { from: ID; to: ID }[];
}

function toStageDraft(s: ILeadFunnelStage): IStageDraft {
  return { id: s.id, name: s.name, kind: s.kind, accent: s.accent, position: s.position };
}

export function FunnelsSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const provider = useLeadFunnelsProvider();
  const queryClient = useQueryClient();
  const canEdit = usePermission("funnel", "edit");
  const canCreate = usePermission("funnel", "create");

  const { funnels, sellers, stagesByFunnel, leadCountByStage, accessByFunnel, isLoading } =
    useFunnelAdmin(currentStoreId);

  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [draft, setDraft] = useState<IDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);

  // A rail click is a React state change, not a route navigation, so the
  // router's `useBlocker` never sees it. The guard has to be explicit —
  // getting this wrong loses the user's work in silence.
  const dirtyRef = useRef(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<ID | null>(null);

  const selected = useMemo(
    () => funnels.find((f) => f.id === selectedId),
    [funnels, selectedId],
  );

  // Default selection once funnels load, and re-pick if the selected one
  // vanished after a refetch.
  useEffect(() => {
    if (funnels.length === 0) return;
    if (selectedId && funnels.some((f) => f.id === selectedId)) return;
    setSelectedId(funnels[0]?.id ?? null);
  }, [funnels, selectedId]);

  // Fresh draft whenever the selection changes or its data lands.
  const stages = selected ? stagesByFunnel.get(selected.id) : undefined;
  const access = selected ? accessByFunnel.get(selected.id) : undefined;
  useEffect(() => {
    if (!selected || !stages || !access) return;
    setDraft({
      general: {
        name: selected.name,
        icon: selected.icon,
        accent: selected.accent,
        description: selected.description,
        entryAlertThreshold: selected.entryAlertThreshold,
      },
      stages: stages.map(toStageDraft),
      grantedIds: access,
      openToStore: selected.openToStore,
      leadMoves: [],
    });
    dirtyRef.current = false;
  }, [selected, stages, access]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const handleSelect = useCallback(
    (nextId: ID) => {
      if (nextId === selectedId) return;
      if (!dirtyRef.current) {
        setSelectedId(nextId);
        return;
      }
      setPendingSwitchId(nextId);
    },
    [selectedId],
  );

  // Empty on purpose. The owner/manager role lives on the user, not on the
  // seller, and this screen has no honest way to map one to the other. The
  // preview therefore counts sellers, the copy says "vendedores", and the fixed
  // line states that staff reach every funnel. Inventing a second source of
  // truth for who is staff would be worse than counting less.
  const staffIds = useMemo<ID[]>(() => [], []);

  const archivedLeadCount = useMemo(() => {
    let total = 0;
    for (const f of funnels) {
      if (!f.archivedAt) continue;
      for (const s of stagesByFunnel.get(f.id) ?? []) total += leadCountByStage.get(s.id) ?? 0;
    }
    return total;
  }, [funnels, stagesByFunnel, leadCountByStage]);

  const issues = draft ? validateStageSet(draft.stages) : [];
  const accessPreview =
    draft && selected && !selected.isDefault
      ? resolveAccessPreview({
          sellers,
          grantedIds: draft.grantedIds,
          openToStore: draft.openToStore,
          staffIds,
        })
      : null;

  const handleSave = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      // Order matters. The leads have to leave a stage before it disappears:
      // `lead_funnel_entries.stage_id` carries a foreign key with no cascade,
      // and `replaceStages` deletes the orphans.
      if (draft.leadMoves.length > 0) {
        const entries = await provider.listEntriesByFunnel(selected.id);
        for (const move of draft.leadMoves) {
          for (const entry of entries.filter((e) => e.stageId === move.from)) {
            await provider.moveEntry(entry.id, move.to);
          }
        }
      }

      await provider.updateFunnel(selected.id, {
        ...draft.general,
        openToStore: draft.openToStore,
      });

      const now = new Date().toISOString();
      await provider.replaceStages(
        selected.id,
        draft.stages.map((s, i) => ({
          id: s.id,
          funnelId: selected.id,
          name: s.name.trim(),
          accent: s.accent,
          position: i,
          kind: s.kind,
          createdAt: now,
          updatedAt: now,
        })),
      );

      if (!selected.isDefault) await provider.replaceAccess(selected.id, draft.grantedIds);

      await queryClient.invalidateQueries();
      dirtyRef.current = false;
      toast.success(COPY.admin.saved);
    } catch {
      toast.error(COPY.admin.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selected) return;
    try {
      await provider.archiveFunnel(selected.id);
      await queryClient.invalidateQueries();
      dirtyRef.current = false;
      toast.success(COPY.admin.general.archived(selected.name));
    } catch {
      toast.error(COPY.admin.general.archiveError);
    }
  };

  if (isLoading) return null;

  const onlyDefault = funnels.filter((f) => !f.archivedAt).length <= 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{COPY.admin.title}</h1>
          <p className="text-xs text-muted-foreground">{COPY.admin.description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMatrixOpen(true)}>
          <Icon icon="mdi:table-eye" size={16} aria-hidden />
          {COPY.admin.access.matrixTrigger}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <FunnelAdminRail
          funnels={funnels}
          selectedId={selectedId}
          onSelect={handleSelect}
          canCreate={canCreate}
          onCreate={() => setCreateOpen(true)}
          archivedLeadCount={archivedLeadCount}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {onlyDefault && (
            <div className="border-b border-border bg-muted/40 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{COPY.admin.emptyTitle}</p>
              <p className="text-xs text-muted-foreground">{COPY.admin.emptyBody}</p>
            </div>
          )}

          {selected && draft && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <Tabs defaultValue="stages">
                  <TabsList>
                    <TabsTrigger value="stages">{COPY.admin.tabs.stages}</TabsTrigger>
                    <TabsTrigger value="access">{COPY.admin.tabs.access}</TabsTrigger>
                    <TabsTrigger value="general">{COPY.admin.tabs.general}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="stages" className="pt-4">
                    <StagesTab
                      stages={draft.stages}
                      leadCountByStage={leadCountByStage}
                      onChange={(next) => {
                        markDirty();
                        setDraft({ ...draft, stages: next });
                      }}
                      onMoveLeads={(from, to) => {
                        markDirty();
                        setDraft((d) =>
                          d ? { ...d, leadMoves: [...d.leadMoves, { from, to }] } : d,
                        );
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="access" className="pt-4">
                    <AccessTab
                      funnel={selected}
                      sellers={sellers}
                      staffIds={staffIds}
                      grantedIds={draft.grantedIds}
                      openToStore={draft.openToStore}
                      onGrantedChange={(next) => {
                        markDirty();
                        setDraft({ ...draft, grantedIds: next });
                      }}
                      onOpenToStoreChange={(next) => {
                        markDirty();
                        setDraft({ ...draft, openToStore: next });
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="general" className="pt-4">
                    <GeneralTab
                      funnel={selected}
                      draft={draft.general}
                      onChange={(patch) => {
                        markDirty();
                        setDraft({ ...draft, general: { ...draft.general, ...patch } });
                      }}
                      onArchive={() => void handleArchive()}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Persistent action bar, not a button lost in the form. */}
              <div className="flex items-center justify-end gap-2 border-t border-border p-3">
                <Button
                  size="sm"
                  disabled={!canEdit || saving || issues.length > 0}
                  // Empty access is not blocked — it can be deliberate while a
                  // funnel is being set up — but it must not be accidental.
                  variant={accessPreview?.isEmpty ? "destructive" : "default"}
                  onClick={() => void handleSave()}
                >
                  {saving
                    ? COPY.admin.saving
                    : accessPreview?.isEmpty
                      ? COPY.admin.saveWithoutAccess
                      : COPY.admin.save}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={pendingSwitchId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitchId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{COPY.admin.unsavedTitle}</AlertDialogTitle>
            <AlertDialogDescription>{COPY.admin.unsavedBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSwitchId(null)}>
              {COPY.admin.unsavedKeepEditing}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSwitchId === null) return;
                dirtyRef.current = false;
                setSelectedId(pendingSwitchId);
                setPendingSwitchId(null);
              }}
            >
              {COPY.admin.unsavedDiscard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AccessMatrixDialog
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        funnels={funnels.filter((f) => !f.archivedAt)}
        sellers={sellers}
        staffIds={staffIds}
        accessByFunnel={accessByFunnel}
        onGoToFunnel={(id) => {
          setMatrixOpen(false);
          handleSelect(id);
        }}
      />

      <NewFunnelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        storeId={currentStoreId}
        existing={funnels}
        onCreated={(f) => {
          setCreateOpen(false);
          setSelectedId(f.id);
        }}
      />
    </div>
  );
}
