import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useVehicleDetail } from "../hooks/useVehicleDetail";
import { VehicleDetailHeader } from "../components/detail/VehicleDetailHeader";
import { VehicleStatusBanner } from "../components/detail/VehicleStatusBanner";
import { VehicleTechSpecs } from "../components/detail/VehicleTechSpecs";
import { VehicleOwnerCard } from "../components/detail/VehicleOwnerCard";
import { ServiceHistoryTimeline } from "../components/detail/ServiceHistoryTimeline";
import { MaintenanceRecommendations } from "../components/detail/MaintenanceRecommendations";
import { CompatiblePartsPlaceholder } from "../components/detail/CompatiblePartsPlaceholder";
import { AddServiceEntryModal } from "../components/detail/AddServiceEntryModal";
import { EditVehicleModal } from "../components/EditVehicleModal";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export function VehicleDetailPage() {
  const { id } = useParams({ from: "/app/veiculos/$id" });
  const detail = useVehicleDetail(id as ID);
  const provider = useVehiclesProvider();
  const navigate = useNavigate();
  const canEdit = usePermission("vehicle", "edit");
  const canApprove = usePermission("vehicle", "approve");

  const [editOpen, setEditOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (detail.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const vehicle = detail.vehicle;
  if (!vehicle) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:truck-remove-outline" size={24} />
        </div>
        <p className="text-sm font-semibold text-foreground">{VEHICLE_STRINGS.detail.notFound}</p>
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/app/veiculos" })}>
          <Icon icon="mdi:arrow-left" size={14} />
          {VEHICLE_STRINGS.detail.backToList}
        </Button>
      </div>
    );
  }

  const handleApprove = async () => {
    await provider.update(vehicle.id, { cadastroStatus: "aprovado" });
    auditLog({
      action: "vehicle.approved",
      resource: "vehicle",
      resourceId: vehicle.id,
      before: { cadastroStatus: vehicle.cadastroStatus },
      after: { cadastroStatus: "aprovado" },
    });
    toast.success("Veículo aprovado.");
    await detail.invalidate();
  };

  const handleReject = async () => {
    await provider.update(vehicle.id, { cadastroStatus: "rejeitado" });
    auditLog({
      action: "vehicle.rejected",
      resource: "vehicle",
      resourceId: vehicle.id,
      before: { cadastroStatus: vehicle.cadastroStatus },
      after: { cadastroStatus: "rejeitado", reason: rejectReason || undefined },
    });
    toast.success("Veículo rejeitado.");
    setRejectReason("");
    setRejectOpen(false);
    await detail.invalidate();
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      <VehicleDetailHeader
        vehicle={vehicle}
        canEdit={canEdit}
        onEdit={() => setEditOpen(true)}
        onAddService={() => setServiceOpen(true)}
      />

      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <VehicleStatusBanner
          vehicle={vehicle}
          canApprove={canApprove}
          onApprove={() => void handleApprove()}
          onReject={() => setRejectOpen(true)}
        />

        <VehicleTechSpecs
          vehicle={vehicle}
          canEdit={canEdit}
          onUpdated={() => void detail.invalidate()}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <ServiceHistoryTimeline
              vehicle={vehicle}
              canEdit={canEdit}
              onAddService={() => setServiceOpen(true)}
            />
            <MaintenanceRecommendations vehicle={vehicle} />
          </div>
          <aside className="space-y-6 lg:sticky lg:top-6 lg:col-span-4 lg:self-start">
            <VehicleOwnerCard customerId={vehicle.customerId} />
            <CompatiblePartsPlaceholder vehicle={vehicle} />
          </aside>
        </div>
      </div>

      <EditVehicleModal
        open={editOpen}
        vehicle={vehicle}
        onClose={() => setEditOpen(false)}
        onSaved={() => void detail.invalidate()}
      />

      <AddServiceEntryModal
        open={serviceOpen}
        vehicle={vehicle}
        onClose={() => setServiceOpen(false)}
        onSaved={() => void detail.invalidate()}
      />

      <AlertDialog open={rejectOpen} onOpenChange={(o) => !o && setRejectOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{VEHICLE_STRINGS.bulk.rejectReasonTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Informe um motivo para a rejeição (opcional). O vendedor que cadastrou poderá
              reapresentar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">{VEHICLE_STRINGS.bulk.rejectReasonPlaceholder}</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReject()}>
              {VEHICLE_STRINGS.bulk.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
