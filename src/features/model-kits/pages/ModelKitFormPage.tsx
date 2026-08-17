// src/features/model-kits/pages/ModelKitFormPage.tsx
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { IKitItem, IPart, IVehicleModelKit, ModelKitCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { usePartsIndex } from "@/features/quotes/hooks/usePartsIndex";
import { useVehicleModel } from "@/features/vehicle-models/hooks/useVehicleModel";
import { useModelKit } from "../hooks/useModelKit";
import { useModelKitMutations } from "../hooks/useModelKitMutations";
import { modelKitFormSchema, type ModelKitFormValues } from "../utils/modelKitValidation";
import { KitCatalogSearch } from "../components/KitCatalogSearch";
import { KitItemEditorRow } from "../components/KitItemEditorRow";
import { KitDriftBanner } from "../components/KitDriftBanner";
import { getCompatiblePartsNotInKit } from "../utils/modelKitDrift";

// Category configuration with icons and labels
const CATEGORY_OPTIONS: Array<{ value: ModelKitCategory; icon: string; label: string }> = [
  { value: "filtros", icon: "mdi:air-filter", label: "Filtros" },
  { value: "freios", icon: "mdi:car-brake-alarm", label: "Freios" },
  { value: "correia", icon: "mdi:fan", label: "Correia" },
  { value: "revisao", icon: "mdi:wrench-clock", label: "Revisão" },
  { value: "custom", icon: "mdi:package-variant", label: "Custom" },
];

export function ModelKitFormPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // strict: false — shared between create (/kit/novo) and edit (/kit/$kitId/editar)
  const { modelId, kitId } = useParams({ strict: false }) as {
    modelId?: string;
    kitId?: string;
  };

  const mode: "create" | "edit" = kitId ? "edit" : "create";
  const canEdit = hasPermission(currentUser, "modelKit", "edit");

  // Load vehicle model context
  const modelQuery = useVehicleModel(modelId);
  const vehicleModel = modelQuery.data;

  // Load existing kit in edit mode
  const kitQuery = useModelKit(kitId);
  const existingKit = kitQuery.data;
  const isLoadingKit = mode === "edit" && kitQuery.isLoading;

  const mutations = useModelKitMutations();

  // Parts catalog for enriching item rows and drift detection
  const { partsById, allParts } = usePartsIndex();

  // --- React Hook Form ---
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ModelKitFormValues>({
    resolver: zodResolver(modelKitFormSchema),
    defaultValues:
      mode === "edit" && existingKit
        ? {
            name: existingKit.name,
            category: existingKit.category,
            items: existingKit.items,
          }
        : {
            name: "",
            category: "filtros",
            items: [],
          },
  });

  const items = watch("items");

  // Rehydrate form when existing kit loads (edit mode)
  useMemo(() => {
    if (mode === "edit" && existingKit) {
      setValue("name", existingKit.name);
      setValue("category", existingKit.category);
      setValue("items", existingKit.items);
    }
  }, [mode, existingKit, setValue]);

  // Set of part ids already in the form (to exclude from search)
  const excludePartIds = useMemo(() => new Set(items.map((i) => i.partId)), [items]);

  // Catalog drift: compatible parts not yet in the kit
  const driftParts = useMemo(() => {
    const formKitForDrift = { items } as IVehicleModelKit;
    return getCompatiblePartsNotInKit(formKitForDrift, vehicleModel, allParts);
  }, [items, vehicleModel, allParts]);

  // --- Item manipulation helpers ---
  const addItem = useCallback(
    (part: IPart) => {
      const current = items;
      const newItem: IKitItem = {
        partId: part.id,
        defaultQuantity: 1,
        isOptional: false,
        note: undefined,
      };
      setValue("items", [...current, newItem], { shouldValidate: true });
    },
    [items, setValue],
  );

  const patchItem = useCallback(
    (index: number, patch: Partial<IKitItem>) => {
      const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      setValue("items", next, { shouldValidate: true });
    },
    [items, setValue],
  );

  // --- Part carried in from the model ficha ("Incluir no kit") ---
  const { addPartId } = useSearch({ strict: false }) as { addPartId?: string };
  const seededPartRef = useRef(false);

  useEffect(() => {
    if (!addPartId || seededPartRef.current) return;
    // Wait for the catalog, and in edit mode for the kit to rehydrate the form —
    // otherwise the rehydrate would overwrite the seeded item.
    if (partsById.size === 0) return;
    if (mode === "edit" && !existingKit) return;

    seededPartRef.current = true;
    const part = partsById.get(addPartId);
    if (!part) return;
    if (items.some((i) => i.partId === part.id)) return;
    addItem(part);
  }, [addPartId, partsById, mode, existingKit, items, addItem]);

  const removeItem = useCallback(
    (index: number) => {
      setValue(
        "items",
        items.filter((_, i) => i !== index),
        { shouldValidate: true },
      );
    },
    [items, setValue],
  );

  // --- Navigation ---
  function goBack() {
    if (modelId) {
      void navigate({ to: "/app/kits/$modelId", params: { modelId } });
    } else {
      void navigate({ to: "/app/kits" });
    }
  }

  // --- Submit ---
  async function onSubmit(values: ModelKitFormValues) {
    try {
      if (mode === "edit" && kitId) {
        await mutations.update(kitId, {
          name: values.name,
          category: values.category,
          items: values.items,
        });
      } else {
        await mutations.create({
          modelId: modelId ?? "",
          storeId: currentUser?.storeId ?? "00000000-0000-0000-0000-000000000001",
          name: values.name,
          category: values.category,
          items: values.items,
        });
      }
      goBack();
    } catch {
      // useModelKitMutations already shows a toast on error; stay on page
    }
  }

  // Vehicle model context label
  const modelLabel = vehicleModel
    ? `${vehicleModel.brand} ${vehicleModel.model} (${vehicleModel.engine})`
    : modelQuery.isLoading
      ? "Carregando modelo…"
      : "Modelo não encontrado";

  // --- Loading state for edit mode ---
  if (isLoadingKit) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-32 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  const isSaving = mutations.saving;
  const saveDisabled = isSaving || items.length === 0;

  return (
    <TooltipProvider>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mx-auto max-w-3xl space-y-6 p-4 pb-32"
        noValidate
      >
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Button type="button" variant="ghost" size="sm" onClick={goBack} className="gap-1 px-1">
            <Icon icon="mdi:chevron-left" size={16} />
            {modelLabel}
          </Button>
          <Icon icon="mdi:chevron-right" size={14} className="opacity-50" />
          <span className="text-foreground">{mode === "edit" ? "Editar kit" : "Novo kit"}</span>
        </div>

        {/* Model context (read-only) */}
        <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Modelo:</span> {modelLabel}
        </div>

        {/* Kit name */}
        <div className="space-y-1.5">
          <label htmlFor="kit-name" className="text-sm font-medium text-foreground">
            Nome do kit
          </label>
          <Input
            id="kit-name"
            placeholder="Ex.: Kit de filtros revisão 30.000 km"
            {...register("name")}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label htmlFor="kit-category" className="text-sm font-medium text-foreground">
            Categoria
          </label>
          <Select
            defaultValue="filtros"
            value={watch("category")}
            onValueChange={(v) =>
              setValue("category", v as ModelKitCategory, { shouldValidate: true })
            }
          >
            <SelectTrigger id="kit-category" className="w-48">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <Icon icon={opt.icon} size={16} className="text-muted-foreground" />
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
        </div>

        {/* Status badge (read-only) */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {mode === "edit" && existingKit?.status === "oficial" ? (
            <Badge className="border border-primary/30 bg-primary/15 text-primary">
              <Icon icon="mdi:check-decagram" size={14} className="mr-1" />
              Oficial
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Icon icon="mdi:pencil-ruler" size={14} />
              Rascunho
            </Badge>
          )}
        </div>

        {/* Add part row */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1">
              <KitCatalogSearch onAdd={addItem} excludePartIds={excludePartIds} />
            </div>
            {/* AI suggestion button — disabled, Fase 2 */}
            <div className="flex flex-col items-start gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-block">
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="gap-1.5 pointer-events-none"
                    >
                      <Icon icon="mdi:auto-fix" size={16} />
                      Sugerir composição (IA)
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Disponível na Fase 2</TooltipContent>
              </Tooltip>
              <span className="text-[10px] text-muted-foreground">ⓘ Fase 2</span>
            </div>
          </div>

          <KitDriftBanner parts={driftParts} onAdd={addItem} />
        </div>

        {/* Items list */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-foreground">
            Peças do kit{" "}
            {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}
          </h2>

          {errors.items && <p className="text-xs text-destructive">{errors.items.message}</p>}

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center">
              <Icon icon="mdi:tray-plus" size={32} className="text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">
                Nenhuma peça ainda. Busque acima para começar.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                <KitItemEditorRow
                  key={`${item.partId}-${index}`}
                  item={item}
                  part={partsById.get(item.partId)}
                  onPatch={(patch) => patchItem(index, patch)}
                  onRemove={() => removeItem(index)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-background px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={goBack} disabled={isSaving}>
              Cancelar
            </Button>

            {items.length === 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-block">
                    <Button
                      type="submit"
                      disabled
                      aria-busy={isSaving}
                      className="pointer-events-none"
                    >
                      {canEdit ? "Salvar" : "Salvar rascunho"}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Adicione ao menos uma peça</TooltipContent>
              </Tooltip>
            ) : (
              <Button type="submit" disabled={saveDisabled} aria-busy={isSaving}>
                {isSaving && <Icon icon="mdi:loading" size={16} className="mr-2 animate-spin" />}
                {canEdit ? "Salvar" : "Salvar rascunho"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </TooltipProvider>
  );
}
