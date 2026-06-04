import { useState } from "react";
import type { ID, IVehicle } from "@/shared/types";
import type { ICreateVehicleModelInput } from "@/providers/data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useVehicleModels } from "@/features/vehicle-models/hooks/useVehicleModels";
import { useVehicleModelMutations } from "@/features/vehicle-models/hooks/useVehicleModelMutations";
import { VehicleModelForm } from "@/features/vehicle-models/components/VehicleModelForm";
import { useLinkVehicleModel } from "../../hooks/useLinkVehicleModel";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.linkModel;

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export interface ILinkModelDialogProps {
  vehicle: IVehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

export function LinkModelDialog({ vehicle, open, onOpenChange, onLinked }: ILinkModelDialogProps) {
  const { link, linking } = useLinkVehicleModel();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="existing">
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1 gap-1.5">
              <Icon icon="mdi:link-variant" className="size-4" />
              {COPY.tabExisting}
            </TabsTrigger>
            <TabsTrigger value="create" className="flex-1 gap-1.5">
              <Icon icon="mdi:plus-box-outline" className="size-4" />
              {COPY.tabCreate}
            </TabsTrigger>
          </TabsList>

          <ExistingTab
            vehicle={vehicle}
            link={link}
            linking={linking}
            onLinked={onLinked}
            onOpenChange={onOpenChange}
          />
          <CreateTab
            vehicleId={vehicle.id}
            link={link}
            linking={linking}
            onLinked={onLinked}
            onOpenChange={onOpenChange}
          />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab: Vincular existente
// ---------------------------------------------------------------------------

interface IExistingTabProps {
  vehicle: IVehicle;
  link: (vehicleId: ID, modelId: ID) => Promise<unknown>;
  linking: boolean;
  onLinked: () => void;
  onOpenChange: (open: boolean) => void;
}

function ExistingTab({ vehicle, link, linking, onLinked, onOpenChange }: IExistingTabProps) {
  const modelsQuery = useVehicleModels({});
  const models = modelsQuery.data ?? [];

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<ID | null>(null);

  const vehicleBrand = normalize(vehicle.brand);
  const normalizedSearch = normalize(search);

  const filtered = models
    .filter((m) => {
      if (!normalizedSearch) return true;
      return (
        normalize(m.brand).includes(normalizedSearch) ||
        normalize(m.model).includes(normalizedSearch) ||
        normalize(m.engine).includes(normalizedSearch)
      );
    })
    .sort((a, b) => {
      const aMatch = normalize(a.brand) === vehicleBrand ? 0 : 1;
      const bMatch = normalize(b.brand) === vehicleBrand ? 0 : 1;
      return aMatch - bMatch;
    });

  const handleLinkExisting = async () => {
    if (!selectedId) return;
    await link(vehicle.id, selectedId);
    onLinked();
    onOpenChange(false);
  };

  return (
    <TabsContent value="existing" className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={COPY.existingPlaceholder}
      />

      <div className="max-h-64 space-y-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{COPY.existingEmpty}</p>
        ) : (
          filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={selectedId === m.id}
              onClick={() => setSelectedId(m.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                selectedId === m.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <span className="font-medium text-foreground">
                {m.brand} {m.model}
              </span>
              <span className="text-xs text-muted-foreground">
                {m.engine}
                {m.yearStart ? ` · ${m.yearStart}–${m.yearEnd ?? ""}` : ""}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {COPY.cancel}
        </Button>
        <Button disabled={!selectedId || linking} onClick={handleLinkExisting}>
          {COPY.confirm}
        </Button>
      </div>
    </TabsContent>
  );
}

// ---------------------------------------------------------------------------
// Tab: Criar novo
// ---------------------------------------------------------------------------

interface ICreateTabProps {
  vehicleId: ID;
  link: (vehicleId: ID, modelId: ID) => Promise<unknown>;
  linking: boolean;
  onLinked: () => void;
  onOpenChange: (open: boolean) => void;
}

function CreateTab({ vehicleId, link, linking, onLinked, onOpenChange }: ICreateTabProps) {
  const { create, saving } = useVehicleModelMutations();

  const handleCreate = async (input: ICreateVehicleModelInput) => {
    const created = await create(input);
    await link(vehicleId, created.id);
    onLinked();
    onOpenChange(false);
  };

  return (
    <TabsContent value="create">
      <VehicleModelForm
        saving={saving || linking}
        onSubmit={handleCreate}
        onCancel={() => onOpenChange(false)}
      />
    </TabsContent>
  );
}
