import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { PartDetailHeader } from "../components/detail/PartDetailHeader";
import { PartStatStrip } from "../components/detail/PartStatStrip";
import { PartStockAlert } from "../components/detail/PartStockAlert";
import { PartLayoutCounter } from "../components/detail/layouts/PartLayoutCounter";
import { PartLayoutPanel } from "../components/detail/layouts/PartLayoutPanel";
import { PartLayoutSheet } from "../components/detail/layouts/PartLayoutSheet";
import { useEquivalentsBidirectional } from "../hooks/useEquivalentsBidirectional";
import { usePart } from "../hooks/useCatalogList";
import { usePartDetailLayout } from "../hooks/usePartDetailLayout";
import { CATALOG_STRINGS } from "../i18n/pt-BR";
import {
  buildPartPatch,
  toPartDraft,
  validatePartDraft,
  type IPartDraft,
  type IPartDraftErrors,
} from "../utils/draft";

export function PartDetailPage() {
  const { id } = useParams({ from: "/app/catalogo/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useCurrentRole();
  const canEdit = usePermission("part", "edit");
  const canToggle = role === "Owner";
  const priceLocked = role !== "Owner";
  const partsProvider = usePartsProvider();
  const bidirectional = useEquivalentsBidirectional();

  const partQuery = usePart(id);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [layout, setLayout] = usePartDetailLayout();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IPartDraft | null>(null);
  const [errors, setErrors] = useState<IPartDraftErrors>({});
  const [saving, setSaving] = useState(false);

  if (partQuery.isLoading) {
    return <DetailSkeleton />;
  }

  if (partQuery.isError || !partQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <Icon icon="mdi:alert-circle-outline" size={28} className="text-destructive" />
        <p className="text-sm font-semibold">Peça não encontrada</p>
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/app/catalogo" })}>
          {CATALOG_STRINGS.detail.backToList}
        </Button>
      </div>
    );
  }

  const part = partQuery.data;

  const handleBack = () => void navigate({ to: "/app/catalogo" });
  const handleDuplicate = () =>
    void navigate({ to: "/app/catalogo/novo", search: { from: part.id } });

  const handleStartEdit = () => {
    setDraft(toPartDraft(part));
    setErrors({});
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(null);
    setErrors({});
    setEditing(false);
  };

  const handleDraftChange = (patch: Partial<IPartDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    const validation = validatePartDraft(draft);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const oemCodes = draft.oemPrimary.trim() ? [draft.oemPrimary.trim()] : [];
    const dup = oemCodes[0] ? await partsProvider.findByOem(oemCodes[0]) : [];
    if (dup.some((p) => p.id !== part.id)) {
      setErrors({ oemPrimary: CATALOG_STRINGS.form.duplicateOemError });
      return;
    }

    setSaving(true);
    try {
      const previousEquivalents = part.equivalentPartIds;
      const patch = buildPartPatch(part, draft, priceLocked);
      const priceChanged =
        !priceLocked && patch.unitPrice !== undefined && patch.unitPrice !== part.unitPrice;

      const updated = await partsProvider.update(part.id, patch);

      auditLog({
        action: "part_update",
        resource: "part",
        resourceId: part.id,
        before: { name: part.name, oemCodes: part.oemCodes, brand: part.brand },
        after: { name: updated.name, oemCodes: updated.oemCodes, brand: updated.brand },
      });

      if (priceChanged) {
        auditLog({
          action: "part_price_change",
          resource: "part",
          resourceId: part.id,
          before: { unitPrice: part.unitPrice },
          after: { unitPrice: updated.unitPrice },
        });
        toast.success(CATALOG_STRINGS.toasts.priceChanged);
      } else {
        toast.success(CATALOG_STRINGS.toasts.updated);
      }

      const nextIds: ID[] = draft.equivalentPartIds;
      await bidirectional.reconcile(part.id, previousEquivalents, nextIds);

      await queryClient.invalidateQueries({ queryKey: ["part", part.id] });
      await queryClient.invalidateQueries({ queryKey: ["catalog-list"] });

      setDraft(null);
      setEditing(false);
    } catch {
      toast.error(CATALOG_STRINGS.toasts.error);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmToggle = async () => {
    setConfirmToggleOpen(false);
    try {
      const next = !part.active;
      await partsProvider.update(part.id, { active: next });
      auditLog({
        action: next ? "part_activate" : "part_deactivate",
        resource: "part",
        resourceId: part.id,
        before: { active: part.active },
        after: { active: next },
      });
      await queryClient.invalidateQueries({ queryKey: ["part", part.id] });
      await queryClient.invalidateQueries({ queryKey: ["catalog-list"] });
      toast.success(next ? CATALOG_STRINGS.toasts.activated : CATALOG_STRINGS.toasts.deactivated);
    } catch {
      toast.error(CATALOG_STRINGS.toasts.error);
    }
  };

  const layoutProps = {
    part,
    editing,
    draft: draft ?? toPartDraft(part),
    onDraftChange: handleDraftChange,
    priceLocked,
    errors,
    onRequestEdit: canEdit ? handleStartEdit : undefined,
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] flex-col bg-background">
      <div className="mx-auto w-full max-w-[1360px] flex-1 px-4 pb-10 pt-[22px] sm:px-[26px]">
        <div className="mb-5">
          <PartDetailHeader
            part={part}
            canEdit={canEdit}
            canToggle={canToggle}
            layout={layout}
            onLayoutChange={setLayout}
            onBack={handleBack}
            onEdit={handleStartEdit}
            onDuplicate={handleDuplicate}
            onToggleActive={() => setConfirmToggleOpen(true)}
            editing={editing}
          />
        </div>

        <div className="mb-4">
          <PartStatStrip part={part} draft={editing ? (draft ?? undefined) : undefined} />
        </div>
        <PartStockAlert part={part} className="mb-4" />

        {layout === "counter" && <PartLayoutCounter {...layoutProps} />}
        {layout === "panel" && <PartLayoutPanel {...layoutProps} />}
        {layout === "sheet" && <PartLayoutSheet {...layoutProps} />}
      </div>

      {editing && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
          <div className="mx-auto flex w-full max-w-[1360px] items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={handleCancelEdit}
              disabled={saving}
            >
              {CATALOG_STRINGS.detail.actions.cancel}
            </Button>
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Icon icon="svg-spinners:ring-resize" size={14} />
                  {CATALOG_STRINGS.detail.actions.saving}
                </>
              ) : (
                CATALOG_STRINGS.detail.actions.save
              )}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmToggleOpen} onOpenChange={setConfirmToggleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {part.active ? "Desativar peça?" : "Reativar peça?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {part.active
                ? "A peça deixará de aparecer em buscas, novos orçamentos e listagens padrão. O histórico permanece preservado."
                : "A peça voltará a aparecer no catálogo e ficará disponível para orçamentos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmToggle()}>
              {part.active
                ? CATALOG_STRINGS.detail.actions.deactivate
                : CATALOG_STRINGS.detail.actions.activate}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] items-center justify-center text-muted-foreground">
      <Icon icon="svg-spinners:ring-resize" size={28} />
    </div>
  );
}
