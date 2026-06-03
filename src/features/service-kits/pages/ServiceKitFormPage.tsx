import { useNavigate, useParams } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ID } from "@/shared/types";
import type { ICreateServiceKitInput } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useServiceKits } from "../hooks/useServiceKits";
import { useServiceKitMutations } from "../hooks/useServiceKitMutations";
import { KitForm } from "../components/KitForm";

export interface IServiceKitFormPageProps {
  mode: "create" | "edit";
}

export function ServiceKitFormPage({ mode }: IServiceKitFormPageProps) {
  const { currentStoreId } = useCurrentStore();
  const storeId: ID = currentStoreId ?? "store-matriz";

  const navigate = useNavigate();
  const mutations = useServiceKitMutations();
  const { id } = useParams({ strict: false }) as { id?: string };
  const kitsQuery = useServiceKits(storeId);
  const initial = mode === "edit" ? kitsQuery.data?.find((k) => k.id === id) : undefined;

  function back() {
    void navigate({ to: "/app/catalogo/kits" });
  }

  async function handleSubmit(input: ICreateServiceKitInput) {
    if (mode === "edit" && initial) {
      await mutations.update(initial.id, input);
    } else {
      await mutations.create(input);
    }
    back();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Button variant="ghost" size="sm" onClick={back} className="gap-1">
        <Icon icon="mdi:chevron-left" size={18} /> Voltar
      </Button>
      <Card className="p-4">
        <h1 className="mb-4 text-lg font-semibold">
          {mode === "edit" ? "Editar kit" : "Novo kit de revisão"}
        </h1>
        {mode === "edit" && !initial && kitsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : mode === "edit" && !initial ? (
          <p className="text-sm text-muted-foreground">Kit não encontrado.</p>
        ) : (
          <KitForm
            storeId={storeId}
            initial={initial}
            saving={mutations.saving}
            onSubmit={handleSubmit}
            onCancel={back}
          />
        )}
      </Card>
    </div>
  );
}
