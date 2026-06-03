import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ID, IServiceKit, IServiceKitItem, PartCategory } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ICreateServiceKitInput } from "@/providers/data";
import { kitFormSchema, type KitFormValues } from "../utils/kitValidation";
import { KitItemBuilder } from "./KitItemBuilder";

export interface IKitFormProps {
  storeId: ID;
  /** When set, the form edits this kit; otherwise it creates a new one. */
  initial?: IServiceKit;
  saving?: boolean;
  onSubmit: (input: ICreateServiceKitInput) => void;
  onCancel: () => void;
}

function toValues(kit: IServiceKit | undefined): KitFormValues {
  return {
    name: kit?.name ?? "",
    description: kit?.description ?? "",
    vehicleBrand: kit?.vehicleApplication?.brand ?? "",
    vehicleModel: kit?.vehicleApplication?.model ?? "",
    category: kit?.category ?? "",
    items: kit ? kit.items.map((i) => ({ ...i })) : [],
  };
}

export function KitForm({ storeId, initial, saving, onSubmit, onCancel }: IKitFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<KitFormValues>({
    resolver: zodResolver(kitFormSchema),
    defaultValues: toValues(initial),
  });

  function submit(values: KitFormValues) {
    const vehicleApplication =
      values.vehicleBrand && values.vehicleModel
        ? { brand: values.vehicleBrand, model: values.vehicleModel }
        : undefined;
    const input: ICreateServiceKitInput = {
      storeId,
      name: values.name,
      description: values.description || undefined,
      vehicleApplication,
      category: (values.category || undefined) as PartCategory | undefined,
      items: values.items as IServiceKitItem[],
    };
    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="kit-name">Nome*</Label>
          <Input
            id="kit-name"
            {...register("name")}
            placeholder="Ex.: Revisão 40.000 km — Volvo FH"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="kit-category">Categoria</Label>
          <Input id="kit-category" {...register("category")} placeholder="Ex.: filtro" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kit-brand">Marca do veículo</Label>
          <Input id="kit-brand" {...register("vehicleBrand")} placeholder="Ex.: Volvo" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kit-model">Modelo do veículo</Label>
          <Input id="kit-model" {...register("vehicleModel")} placeholder="Ex.: FH" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="kit-desc">Descrição</Label>
          <Textarea
            id="kit-desc"
            {...register("description")}
            placeholder="Observações do kit (opcional)"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Peças do kit*</Label>
        <Controller
          control={control}
          name="items"
          render={({ field }) => <KitItemBuilder items={field.value} onChange={field.onChange} />}
        />
        {errors.items && (
          <p className="text-xs text-destructive">{errors.items.message as string}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : initial ? "Salvar alterações" : "Criar kit"}
        </Button>
      </div>
    </form>
  );
}
