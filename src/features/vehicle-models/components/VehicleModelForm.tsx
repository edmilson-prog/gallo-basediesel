import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { IVehicleModel } from "@/shared/types";
import type { ICreateVehicleModelInput } from "@/providers/data";
import { Icon } from "@/components/Icon";
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
import { cn } from "@/lib/utils";
import {
  describeModelForm,
  modelFormSchema,
  usableEngines,
  type ModelFormValues,
} from "../utils/modelValidation";
import { KNOWN_BRANDS } from "../utils/brandIcon";

const OTHER_VALUE = "__other__";

export interface IVehicleModelFormProps {
  initial?: IVehicleModel;
  saving: boolean;
  /**
   * Enables the repeatable engine list. Off when editing (the engine is part of
   * the canonical identity) and off in the vehicle-link dialog, which needs
   * exactly one model to attach.
   */
  multiEngine?: boolean;
  /** Always an array — one entry per engine registered. */
  onSubmit: (inputs: ICreateVehicleModelInput[]) => void | Promise<void>;
  /** Offered for a single new engine: the step that always comes next. */
  onSaveAndBuild?: (inputs: ICreateVehicleModelInput[]) => void | Promise<void>;
  onCancel?: () => void;
}

function resolveInitialBrandSelect(brand: string | undefined): string {
  if (!brand) return "";
  return KNOWN_BRANDS.includes(brand) ? brand : OTHER_VALUE;
}

export function VehicleModelForm({
  initial,
  saving,
  multiEngine = false,
  onSubmit,
  onSaveAndBuild,
  onCancel,
}: IVehicleModelFormProps) {
  const editing = Boolean(initial);
  const repeatable = multiEngine && !editing;

  const [brandSelect, setBrandSelect] = useState<string>(() =>
    resolveInitialBrandSelect(initial?.brand),
  );
  const isOther = brandSelect === OTHER_VALUE;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
    defaultValues: {
      brand: initial?.brand ?? "",
      model: initial?.model ?? "",
      engines: [initial?.engine ?? ""],
      yearStart: initial?.yearStart,
      yearEnd: initial?.yearEnd,
    },
  });

  const values = watch();
  const engines = values.engines ?? [""];
  const state = describeModelForm({
    brand: values.brand ?? "",
    model: values.model ?? "",
    engines,
    yearStart: values.yearStart,
    yearEnd: values.yearEnd,
  });

  function setEngines(next: string[]) {
    setValue("engines", next, { shouldValidate: true });
  }

  function handleBrandSelectChange(val: string) {
    setBrandSelect(val);
    setValue("brand", val === OTHER_VALUE ? "" : val, { shouldValidate: val !== OTHER_VALUE });
  }

  function toInputs(v: ModelFormValues): ICreateVehicleModelInput[] {
    return usableEngines(v.engines).map((engine) => ({
      brand: v.brand.trim(),
      model: v.model.trim(),
      engine,
      yearStart: v.yearStart,
      yearEnd: v.yearEnd,
    }));
  }

  const saveLabel = editing
    ? "Salvar modelo"
    : state.engines.length > 1
      ? `Salvar ${state.engines.length} modelos`
      : "Salvar modelo";

  return (
    <form
      onSubmit={handleSubmit((v) => void onSubmit(toInputs(v)))}
      className="space-y-4"
      noValidate
    >
      {/* Identificação */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Icon icon="mdi:truck-outline" size={14} className="text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Identificação
          </span>
        </header>

        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
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
                <SelectItem value={OTHER_VALUE}>Outra…</SelectItem>
              </SelectContent>
            </Select>
            {errors.brand && !isOther && (
              <p className="text-xs text-destructive">{errors.brand.message}</p>
            )}
          </div>

          {isOther && (
            <div className="space-y-1.5">
              <Label htmlFor="vm-brand-custom">Marca (outra)*</Label>
              <Input
                id="vm-brand-custom"
                {...register("brand")}
                placeholder="Digite a marca"
                autoFocus
              />
              {errors.brand && <p className="text-xs text-destructive">{errors.brand.message}</p>}
            </div>
          )}

          <div className={cn("space-y-1.5", isOther && "sm:col-span-2")}>
            <Label htmlFor="vm-model">Modelo*</Label>
            <Input
              id="vm-model"
              {...register("model")}
              placeholder="Ex.: FH 500, R 450, Atego 2430"
            />
            {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vm-year-start">Ano inicial</Label>
            <Input
              id="vm-year-start"
              inputMode="numeric"
              placeholder="2018"
              {...register("yearStart", {
                setValueAs: (v: string) => (v === "" || v == null ? undefined : Number(v)),
              })}
            />
            {errors.yearStart && (
              <p className="text-xs text-destructive">{errors.yearStart.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vm-year-end">Ano final</Label>
            <Input
              id="vm-year-end"
              inputMode="numeric"
              placeholder="vazio = atual"
              {...register("yearEnd", {
                setValueAs: (v: string) => (v === "" || v == null ? undefined : Number(v)),
              })}
            />
            {errors.yearEnd && <p className="text-xs text-destructive">{errors.yearEnd.message}</p>}
          </div>
        </div>
      </section>

      {/* Motores — the repeatable field is what stops "FH 460" being typed three times */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Icon icon="mdi:engine-outline" size={14} className="text-muted-foreground" />
          <span className="flex-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {repeatable ? "Motores" : "Motor"}
          </span>
          {repeatable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setEngines([...engines, ""])}
            >
              <Icon icon="mdi:plus" size={14} />
              Outro motor
            </Button>
          )}
        </header>

        <div className="flex flex-col gap-2 p-4">
          {engines.map((engine, index) => (
            <div key={index} className="flex items-center gap-2.5">
              {repeatable && (
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
              )}
              <Input
                value={engine}
                aria-label={repeatable ? `Motor ${index + 1}` : "Motor"}
                placeholder="Ex.: DC13 143 EURO 5"
                onChange={(e) =>
                  setEngines(engines.map((cur, i) => (i === index ? e.target.value : cur)))
                }
              />
              {repeatable && engines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remover motor ${index + 1}`}
                  onClick={() => setEngines(engines.filter((_, i) => i !== index))}
                >
                  <Icon icon="mdi:trash-can-outline" size={16} />
                </Button>
              )}
            </div>
          ))}

          {errors.engines && <p className="text-xs text-destructive">{errors.engines.message}</p>}

          {repeatable && (
            <p className="pl-7 text-xs text-muted-foreground">
              {state.engines.length > 1
                ? `${state.engines.length} modelos serão criados — um por motor. O kit pode ser copiado entre eles depois.`
                : "Motores diferentes filtram diferente: cada um recebe o seu kit."}
            </p>
          )}
        </div>
      </section>

      {/* Save bar — states what will be created, or why it cannot be */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 border-t border-border bg-background py-3",
          multiEngine && "sticky bottom-0 z-10",
        )}
      >
        <span
          className={cn(
            "flex flex-1 items-center gap-2 text-sm",
            state.error ? "text-severity-warning" : "text-muted-foreground",
          )}
        >
          {state.error ? (
            <>
              <Icon icon="mdi:alert-outline" size={15} />
              {state.error}
            </>
          ) : (
            <>
              <Icon icon="mdi:check" size={15} className="text-severity-success" />
              {state.summary}
            </>
          )}
        </span>

        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}

        {onSaveAndBuild && !editing && state.engines.length === 1 && (
          <Button
            type="button"
            variant="outline"
            disabled={saving || Boolean(state.error)}
            onClick={() => void onSaveAndBuild(toInputs(watch()))}
          >
            Salvar e montar kit
          </Button>
        )}

        <Button type="submit" className="gap-1.5" disabled={saving || Boolean(state.error)}>
          {saving ? (
            <Icon icon="mdi:loading" size={16} className="animate-spin" />
          ) : (
            <Icon icon="mdi:content-save-outline" size={16} />
          )}
          {saving ? "Salvando…" : saveLabel}
        </Button>
      </div>
    </form>
  );
}
