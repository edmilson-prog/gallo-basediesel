import { useMemo, useRef, useState } from "react";
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
import { useVehicleDetailLayout } from "../hooks/useVehicleDetailLayout";
import { VehicleDetailHeader } from "../components/detail/VehicleDetailHeader";
import { VehicleStatusBanner } from "../components/detail/VehicleStatusBanner";
import { VehicleStatStrip } from "../components/detail/VehicleStatStrip";
import { VehicleHistorySection } from "../components/detail/VehicleHistorySection";
import { VehicleLayoutHealth } from "../components/detail/layouts/VehicleLayoutHealth";
import { VehicleLayoutRails } from "../components/detail/layouts/VehicleLayoutRails";
import { VehicleLayoutBento } from "../components/detail/layouts/VehicleLayoutBento";
import type { IVehicleLayoutProps } from "../components/detail/layouts/types";
import { EditVehicleModal } from "../components/EditVehicleModal";
import { AddServiceEntryModal } from "../components/detail/AddServiceEntryModal";
import { LinkModelDialog } from "../components/detail/LinkModelDialog";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export function VehicleDetailPage() {
  const { id } = useParams({ from: "/app/veiculos/$id" });
  const detail = useVehicleDetail(id as ID);
  const provider = useVehiclesProvider();
  const navigate = useNavigate();
  const canEdit = usePermission("vehicle", "edit");
  const canApprove = usePermission("vehicle", "approve");
  const [layout, setLayout] = useVehicleDetailLayout();

  const [editOpen, setEditOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);

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

  const goToFullHistory = () =>
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const layoutProps: IVehicleLayoutProps = {
    vehicle,
    now,
    canEdit,
    onAddService: () => setServiceOpen(true),
    onUpdated: () => void detail.invalidate(),
    onSeeFullHistory: goToFullHistory,
    onRequestLinkModel: () => setLinkOpen(true),
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      <VehicleDetailHeader
        vehicle={vehicle}
        canEdit={canEdit}
        onEdit={() => setEditOpen(true)}
        onAddService={() => setServiceOpen(true)}
        onRequestLinkModel={() => setLinkOpen(true)}
        layout={layout}
        onLayoutChange={setLayout}
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        <VehicleStatusBanner
          vehicle={vehicle}
          canApprove={canApprove}
          onApprove={() => void handleApprove()}
          onReject={() => setRejectOpen(true)}
        />

        <VehicleStatStrip vehicle={vehicle} now={now} />

        {layout === "health" && <VehicleLayoutHealth {...layoutProps} />}
        {layout === "rails" && <VehicleLayoutRails {...layoutProps} />}
        {layout === "bento" && <VehicleLayoutBento {...layoutProps} />}

        <VehicleHistorySection
          ref={historyRef}
          vehicle={vehicle}
          canEdit={canEdit}
          onAddService={() => setServiceOpen(true)}
        />
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

      <LinkModelDialog
        vehicle={vehicle}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={() => void detail.invalidate()}
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
