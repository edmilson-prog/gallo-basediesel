import { useNavigate, useParams } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ICreateVehicleModelInput } from "@/providers/data";
import { useVehicleModel } from "../hooks/useVehicleModel";
import { useVehicleModelMutations } from "../hooks/useVehicleModelMutations";
import { VehicleModelForm } from "../components/VehicleModelForm";

export interface IVehicleModelFormPageProps {
  mode: "create" | "edit";
}

export function VehicleModelFormPage({ mode }: IVehicleModelFormPageProps) {
  const navigate = useNavigate();
  const mutations = useVehicleModelMutations();

  // modelId is provided by /app/kits/$modelId/editar; strict: false because
  // this page is shared between create and edit routes.
  const { modelId } = useParams({ strict: false }) as { modelId?: string };

  const modelQuery = useVehicleModel(mode === "edit" ? modelId : undefined);
  const initial = mode === "edit" ? modelQuery.data : undefined;

  function back() {
    void navigate({ to: "/app/kits" });
  }

  async function handleSubmit(input: ICreateVehicleModelInput) {
    if (mode === "edit" && initial) {
      await mutations.update(initial.id, input);
    } else {
      await mutations.create(input);
    }
    back();
  }

  const isLoading = mode === "edit" && modelQuery.isLoading;
  const notFound = mode === "edit" && !modelQuery.isLoading && !initial;

  const breadcrumbLabel =
    mode === "edit" && initial ? `${initial.brand} ${initial.model} / Editar` : "Novo modelo";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={back} className="gap-1 px-1">
          <Icon icon="mdi:chevron-left" size={16} />
          Kits por modelo
        </Button>
        <Icon icon="mdi:chevron-right" size={14} className="opacity-50" />
        <span className="text-foreground">{breadcrumbLabel}</span>
      </div>

      <Card className="p-4">
        <h1 className="mb-4 text-lg font-semibold">
          {mode === "edit" ? "Editar modelo" : "Novo modelo de veículo"}
        </h1>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando modelo…</p>
        ) : notFound ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Modelo não encontrado.</p>
            <Button variant="outline" size="sm" onClick={back}>
              Voltar ao catálogo
            </Button>
          </div>
        ) : (
          <VehicleModelForm
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
