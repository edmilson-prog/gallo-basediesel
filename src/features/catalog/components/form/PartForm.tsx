import { useEffect, useMemo, useState } from "react";
import type { ID, IPart, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import {
  PART_CATEGORY_DESCRIPTORS,
  getSubcategoriesFor,
} from "../../utils/categories";
import {
  ApplicationsEditor,
  applicationsToDrafts,
  type IApplicationDraft,
} from "./ApplicationsEditor";
import { EquivalentsEditor } from "./EquivalentsEditor";

export interface IPartFormValues {
  name: string;
  description: string;
  oemPrimary: string;
  oemAlternatives: string;
  brand: string;
  supplier: string;
  isOriginal: boolean;
  category: PartCategory | undefined;
  subcategory: string | undefined;
  unitPrice: number;
  unitCost: number;
  stockAvailable: number;
  stockMinimum: number;
  applications: IApplicationDraft[];
  equivalentPartIds: ID[];
}

export interface IPartFormErrors {
  name?: string;
  oemPrimary?: string;
  brand?: string;
  category?: string;
  unitPrice?: string;
}

export interface IPartFormProps {
  initial?: IPart;
  /** When true, owner-only price field is disabled. */
  priceLocked?: boolean;
  saving: boolean;
  submitLabel: string;
  errors: IPartFormErrors;
  onSubmit: (values: IPartFormValues) => void;
  onCancel: () => void;
}

function fromPart(part: IPart | undefined): IPartFormValues {
  return {
    name: part?.name ?? "",
    description: part?.description ?? "",
    oemPrimary: part?.oemCodes[0] ?? "",
    oemAlternatives: part?.oemCodes.slice(1).join(", ") ?? "",
    brand: part?.brand ?? "",
    supplier: part?.supplier ?? "",
    isOriginal: part?.isOriginal ?? false,
    category: part?.category,
    subcategory: part?.subcategory,
    unitPrice: part?.unitPrice ?? 0,
    unitCost: part?.unitCost ?? 0,
    stockAvailable: part?.stockAvailable ?? 0,
    stockMinimum: part?.stockMinimum ?? 5,
    applications: part ? applicationsToDrafts(part.applications) : [],
    equivalentPartIds: part?.equivalentPartIds ?? [],
  };
}

export function PartForm({
  initial,
  priceLocked = false,
  saving,
  submitLabel,
  errors,
  onSubmit,
  onCancel,
}: IPartFormProps) {
  const [values, setValues] = useState<IPartFormValues>(() => fromPart(initial));

  useEffect(() => {
    setValues(fromPart(initial));
  }, [initial]);

  const subOptions = useMemo(() => getSubcategoriesFor(values.category), [values.category]);

  const set = <K extends keyof IPartFormValues>(key: K, value: IPartFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identificação */}
      <FormSection title={CATALOG_STRINGS.form.sections.identification} icon="mdi:identifier">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={CATALOG_STRINGS.form.fields.name} required error={errors.name}>
            <Input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Filtro de óleo Volvo FH"
            />
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.oemPrimary} required error={errors.oemPrimary}>
            <Input
              value={values.oemPrimary}
              onChange={(e) => set("oemPrimary", e.target.value)}
              className="font-mono"
              placeholder="VOL-123456"
            />
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.oemAlternatives} hint="Separados por vírgula">
            <Input
              value={values.oemAlternatives}
              onChange={(e) => set("oemAlternatives", e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.manufacturer} required error={errors.brand}>
            <Input value={values.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.supplier}>
            <Input value={values.supplier} onChange={(e) => set("supplier", e.target.value)} />
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.isOriginal}>
            <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
              <Switch
                checked={values.isOriginal}
                onCheckedChange={(v) => set("isOriginal", v)}
                id="is-original"
              />
              <Label htmlFor="is-original" className="cursor-pointer text-xs">
                {values.isOriginal ? "Peça original" : "Peça equivalente"}
              </Label>
            </div>
          </Field>
          <div className="md:col-span-2">
            <Field label={CATALOG_STRINGS.form.fields.description}>
              <Textarea
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
              />
            </Field>
          </div>
        </div>
      </FormSection>

      {/* Categoria */}
      <FormSection title={CATALOG_STRINGS.form.sections.categorization} icon="mdi:shape-outline">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={CATALOG_STRINGS.form.fields.category} required error={errors.category}>
            <Select
              value={values.category ?? ""}
              onValueChange={(v) =>
                set("category", v === "" ? undefined : (v as PartCategory))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {PART_CATEGORY_DESCRIPTORS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.subcategory}>
            <Select
              value={values.subcategory ?? ""}
              onValueChange={(v) => set("subcategory", v === "" ? undefined : v)}
              disabled={subOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={subOptions.length === 0 ? "—" : "Selecione…"} />
              </SelectTrigger>
              <SelectContent>
                {subOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      {/* Aplicações */}
      <FormSection title={CATALOG_STRINGS.form.sections.applications} icon="mdi:truck-outline">
        <ApplicationsEditor
          applications={values.applications}
          onChange={(next) => set("applications", next)}
        />
      </FormSection>

      {/* Equivalências */}
      <FormSection title={CATALOG_STRINGS.form.sections.equivalents} icon="mdi:swap-horizontal">
        <EquivalentsEditor
          selectedIds={values.equivalentPartIds}
          excludeId={initial?.id}
          onChange={(ids) => set("equivalentPartIds", ids)}
        />
      </FormSection>

      {/* Comercial */}
      <FormSection title={CATALOG_STRINGS.form.sections.commercial} icon="mdi:cash">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field
            label={CATALOG_STRINGS.form.fields.price}
            required
            error={errors.unitPrice}
            hint={priceLocked ? CATALOG_STRINGS.form.priceLocked : undefined}
          >
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={values.unitPrice || ""}
              onChange={(e) => set("unitPrice", Number(e.target.value) || 0)}
              disabled={priceLocked}
            />
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.cost}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={values.unitCost || ""}
              onChange={(e) => set("unitCost", Number(e.target.value) || 0)}
            />
          </Field>
        </div>
      </FormSection>

      {/* Estoque */}
      <FormSection title={CATALOG_STRINGS.form.sections.stock} icon="mdi:warehouse">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={CATALOG_STRINGS.form.fields.stockQuantity}>
            <Input
              type="number"
              inputMode="numeric"
              value={values.stockAvailable}
              onChange={(e) => set("stockAvailable", Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          <Field label={CATALOG_STRINGS.form.fields.stockMinimum}>
            <Input
              type="number"
              inputMode="numeric"
              value={values.stockMinimum}
              onChange={(e) => set("stockMinimum", Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {CATALOG_STRINGS.form.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Icon icon="svg-spinners:ring-resize" size={14} />
              {CATALOG_STRINGS.form.saving}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-border bg-card/40 p-4">
      <legend className="flex items-center gap-2 px-2 text-sm font-semibold tracking-tight text-foreground">
        <Icon icon={icon} size={16} className="text-muted-foreground" />
        {title}
      </legend>
      <div className="mt-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
