import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { IVehicleModel } from "@/shared/types";
import type { ICreateVehicleModelInput } from "@/providers/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { modelFormSchema, type ModelFormValues } from "../utils/modelValidation";
import { KNOWN_BRANDS } from "../utils/brandIcon";

const OTHER_VALUE = "__other__";

export interface IVehicleModelFormProps {
  initial?: IVehicleModel;
  saving: boolean;
  onSubmit: (input: ICreateVehicleModelInput) => void | Promise<void>;
  onCancel?: () => void;
}

function resolveInitialBrandSelect(brand: string | undefined): string {
  if (!brand) return "";
  return KNOWN_BRANDS.includes(brand) ? brand : OTHER_VALUE;
}

export function VehicleModelForm({ initial, saving, onSubmit, onCancel }: IVehicleModelFormProps) {
  const [brandSelect, setBrandSelect] = useState<string>(() =>
    resolveInitialBrandSelect(initial?.brand),
  );
  const isOther = brandSelect === OTHER_VALUE;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
    defaultValues: {
      brand: initial?.brand ?? "",
      model: initial?.model ?? "",
      engine: initial?.engine ?? "",
      yearStart: initial?.yearStart,
      yearEnd: initial?.yearEnd,
    },
  });

  function handleBrandSelectChange(val: string) {
    setBrandSelect(val);
    if (val !== OTHER_VALUE) {
      setValue("brand", val, { shouldValidate: true });
    } else {
      // Clear so the user types a custom brand
      setValue("brand", "", { shouldValidate: false });
    }
  }

  function submit(values: ModelFormValues) {
    const input: ICreateVehicleModelInput = {
      brand: values.brand,
      model: values.model,
      engine: values.engine,
      yearStart: values.yearStart,
      yearEnd: values.yearEnd,
    };
    void onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Marca — select */}
        <div className="space-y-1">
          <Label htmlFor="vm-brand-select">Marca*</Label>
          <Select value={brandSelect} onValueChange={handleBrandSelectChange}>
            <SelectTrigger id="vm-brand-select">
              <SelectValue placeholder="Selecione a marca" />
            </SelectTrigger>
            <SelectContent>
              {KNOWN_BRANDS.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_VALUE}>Outro…</SelectItem>
            </SelectContent>
          </Select>
          {errors.brand && !isOther && (
            <p className="text-sm text-destructive">{errors.brand.message}</p>
          )}
        </div>

        {/* Marca livre — visível só quando "Outro" */}
        {isOther && (
          <div className="space-y-1">
            <Label htmlFor="vm-brand-custom">Marca (outra)*</Label>
            <Input
              id="vm-brand-custom"
              {...register("brand")}
              placeholder="Digite a marca"
              autoFocus
            />
            {errors.brand && <p className="text-sm text-destructive">{errors.brand.message}</p>}
          </div>
        )}

        {/* Modelo */}
        <div className="space-y-1">
          <Label htmlFor="vm-model">Modelo*</Label>
          <Input
            id="vm-model"
            {...register("model")}
            placeholder="Ex.: FH 500, R 450, Atego 2430"
          />
          {errors.model && <p className="text-sm text-destructive">{errors.model.message}</p>}
        </div>

        {/* Motor */}
        <div className="space-y-1">
          <Label htmlFor="vm-engine">Motor*</Label>
          <Input id="vm-engine" {...register("engine")} placeholder="Ex.: DC13 143 Euro 5" />
          {errors.engine && <p className="text-sm text-destructive">{errors.engine.message}</p>}
        </div>

        {/* Ano inicial */}
        <div className="space-y-1">
          <Label htmlFor="vm-year-start">Ano inicial</Label>
          <Input
            id="vm-year-start"
            type="number"
            min={1980}
            max={new Date().getFullYear() + 1}
            placeholder="Ex.: 2018"
            {...register("yearStart", {
              setValueAs: (v: string) => (v === "" || v == null ? undefined : Number(v)),
            })}
          />
          {errors.yearStart && (
            <p className="text-sm text-destructive">{errors.yearStart.message}</p>
          )}
        </div>

        {/* Ano final */}
        <div className="space-y-1">
          <Label htmlFor="vm-year-end">Ano final</Label>
          <Input
            id="vm-year-end"
            type="number"
            min={1980}
            max={new Date().getFullYear() + 1}
            placeholder="Ex.: 2024 (deixe vazio para atual)"
            {...register("yearEnd", {
              setValueAs: (v: string) => (v === "" || v == null ? undefined : Number(v)),
            })}
          />
          {errors.yearEnd && <p className="text-sm text-destructive">{errors.yearEnd.message}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
