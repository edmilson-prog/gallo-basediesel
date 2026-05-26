import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { ApplicationsSection } from "../components/detail/ApplicationsSection";
import { CommercialSection } from "../components/detail/CommercialSection";
import { EquivalentsSection } from "../components/detail/EquivalentsSection";
import { PartDetailHeader } from "../components/detail/PartDetailHeader";
import { StockSection } from "../components/detail/StockSection";
import { usePart } from "../hooks/useCatalogList";
import { CATALOG_STRINGS } from "../i18n/pt-BR";

export function PartDetailPage() {
  const { id } = useParams({ from: "/app/catalogo/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useCurrentRole();
  const canEdit = usePermission("part", "edit");
  const canToggle = role === "Owner";
  const partsProvider = usePartsProvider();

  const partQuery = usePart(id);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);

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
  const handleEdit = () =>
    void navigate({ to: "/app/catalogo/$id/editar", params: { id: part.id } });
  const handleDuplicate = () =>
    void navigate({ to: "/app/catalogo/novo", search: { from: part.id } });

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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background pb-12">
      <PartDetailHeader
        part={part}
        canEdit={canEdit}
        canToggle={canToggle}
        onBack={handleBack}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onToggleActive={() => setConfirmToggleOpen(true)}
      />
      <ApplicationsSection part={part} />
      <EquivalentsSection part={part} />
      <CommercialSection part={part} />
      <StockSection part={part} />

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
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-muted-foreground">
      <Icon icon="svg-spinners:ring-resize" size={28} />
    </div>
  );
}
