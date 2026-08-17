import { useNavigate, useParams } from "@tanstack/react-router";
import type { ICreateVehicleModelInput } from "@/providers/data";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useVehicleModel } from "../hooks/useVehicleModel";
import { useVehicleModelMutations } from "../hooks/useVehicleModelMutations";
import { VehicleModelForm } from "../components/VehicleModelForm";

export interface IVehicleModelFormPageProps {
  mode: "create" | "edit";
}

export function VehicleModelFormPage({ mode }: IVehicleModelFormPageProps) {
  const navigate = useNavigate();
  const mutations = useVehicleModelMutations();

  // modelId comes from /app/kits/$modelId/editar; strict: false because this
  // page is shared between the create and edit routes.
  const { modelId } = useParams({ strict: false }) as { modelId?: string };

  const modelQuery = useVehicleModel(mode === "edit" ? modelId : undefined);
  const initial = mode === "edit" ? modelQuery.data : undefined;

  function backToList() {
    void navigate({ to: "/app/kits" });
  }

  function cancel() {
    if (initial) {
      void navigate({ to: "/app/kits/$modelId", params: { modelId: initial.id } });
      return;
    }
    backToList();
  }

  /** Saves, then lands wherever the work continues — the first new model's ficha. */
  async function persist(inputs: ICreateVehicleModelInput[], thenBuild: boolean) {
    if (mode === "edit" && initial) {
      const [patch] = inputs;
      if (!patch) return;
      await mutations.update(initial.id, patch);
      void navigate({ to: "/app/kits/$modelId", params: { modelId: initial.id } });
      return;
    }

    const created = await mutations.createMany(inputs);
    const first = created[0];
    if (!first) {
      backToList();
      return;
    }
    void navigate({
      to: thenBuild ? "/app/kits/$modelId/kit/novo" : "/app/kits/$modelId",
      params: { modelId: first.id },
    });
  }

  const isLoading = mode === "edit" && modelQuery.isLoading;
  const notFound = mode === "edit" && !modelQuery.isLoading && !initial;
  const editing = mode === "edit";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={backToList} className="gap-1 px-1">
          <Icon icon="mdi:chevron-left" size={16} />
          Kits por modelo
        </Button>
        <Icon icon="mdi:chevron-right" size={14} className="opacity-50" />
        <span className="text-foreground">
          {editing && initial ? `${initial.brand} ${initial.model} / Editar` : "Novo modelo"}
        </span>
      </div>

      <div>
        <h1 className="text-xl font-bold uppercase tracking-tight text-foreground">
          {editing ? "Editar modelo" : "Novo modelo"}
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          O catálogo guarda um registro por marca + modelo + motor. Cadastre os motores juntos: cada
          um vira um modelo, e cada modelo carrega o seu kit.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando modelo…</p>
      ) : notFound ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Modelo não encontrado.</p>
          <Button variant="outline" size="sm" onClick={backToList}>
            Voltar ao catálogo
          </Button>
        </div>
      ) : (
        <VehicleModelForm
          initial={initial}
          saving={mutations.saving}
          multiEngine
          onSubmit={(inputs) => persist(inputs, false)}
          onSaveAndBuild={(inputs) => persist(inputs, true)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}
