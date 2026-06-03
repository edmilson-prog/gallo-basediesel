import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IServiceKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useServiceKits } from "../hooks/useServiceKits";
import { useServiceKitMutations } from "../hooks/useServiceKitMutations";
import { useServiceKitFormPrefs } from "../hooks/useServiceKitFormPrefs";
import { KitsTable } from "../components/KitsTable";
import { KitUxToggle } from "../components/KitUxToggle";
import { KitFormDialog } from "../components/KitFormDialog";
import { KitFormDrawer } from "../components/KitFormDrawer";
import { DeleteKitDialog } from "../components/DeleteKitDialog";

export function ServiceKitsListPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const navigate = useNavigate();
  const { uxMode, setUxMode } = useServiceKitFormPrefs();
  const kitsQuery = useServiceKits(storeId);
  const mutations = useServiceKitMutations();

  const [search, setSearch] = useState("");
  const [overlayInitial, setOverlayInitial] = useState<IServiceKit | undefined>(undefined);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [toDelete, setToDelete] = useState<IServiceKit | null>(null);

  const kits = useMemo(() => {
    const all = kitsQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (k) =>
        k.name.toLowerCase().includes(needle) ||
        (k.vehicleApplication &&
          `${k.vehicleApplication.brand} ${k.vehicleApplication.model}`
            .toLowerCase()
            .includes(needle)) ||
        (k.category ?? "").toLowerCase().includes(needle),
    );
  }, [kitsQuery.data, search]);

  function openCreate() {
    if (uxMode === "page") {
      void navigate({ to: "/app/catalogo/kits/novo" as string });
      return;
    }
    setOverlayInitial(undefined);
    setOverlayOpen(true);
  }

  function openEdit(kit: IServiceKit) {
    if (uxMode === "page") {
      void navigate({ to: `/app/catalogo/kits/${kit.id}/editar` as string });
      return;
    }
    setOverlayInitial(kit);
    setOverlayOpen(true);
  }

  async function submitOverlay(input: Parameters<typeof mutations.create>[0]) {
    if (overlayInitial) await mutations.update(overlayInitial.id, input);
    else await mutations.create(input);
    setOverlayOpen(false);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Kits de revisão</h1>
        <div className="flex items-center gap-2">
          <KitUxToggle value={uxMode} onChange={setUxMode} />
          <Button onClick={openCreate} className="gap-1">
            <Icon icon="mdi:plus" size={18} /> Novo kit
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Icon
          icon="mdi:magnify"
          size={16}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="pl-8"
          placeholder="Buscar por nome, veículo ou categoria…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {kitsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando kits…</p>
      ) : (
        <KitsTable
          kits={kits}
          onEdit={openEdit}
          onDuplicate={(k) => void mutations.duplicate(k.id)}
          onDelete={setToDelete}
        />
      )}

      {uxMode === "dialog" && (
        <KitFormDialog
          open={overlayOpen}
          onOpenChange={setOverlayOpen}
          storeId={storeId}
          initial={overlayInitial}
          saving={mutations.saving}
          onSubmit={submitOverlay}
        />
      )}
      {uxMode === "drawer" && (
        <KitFormDrawer
          open={overlayOpen}
          onOpenChange={setOverlayOpen}
          storeId={storeId}
          initial={overlayInitial}
          saving={mutations.saving}
          onSubmit={submitOverlay}
        />
      )}

      <DeleteKitDialog
        kit={toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void mutations.remove(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
