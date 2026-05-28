import { useMemo, useState } from "react";
import type { IPart } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface IVehicleFilterProps {
  brand: string | null;
  model: string | null;
  year: number | null;
  /** Catalog used to derive the dropdown options (brand → model → year). */
  parts: IPart[];
  onApply: (brand: string | null, model: string | null, year: number | null) => void;
}

interface IVehicleCascade {
  brands: string[];
  modelsByBrand: Map<string, string[]>;
  yearsByModel: Map<string, { start: number; end: number }>;
}

function buildCascade(parts: IPart[]): IVehicleCascade {
  const brands = new Set<string>();
  const modelsByBrand = new Map<string, Set<string>>();
  const yearsByModel = new Map<string, { start: number; end: number }>();
  for (const part of parts) {
    for (const app of part.applications) {
      brands.add(app.vehicleBrand);
      const models = modelsByBrand.get(app.vehicleBrand) ?? new Set<string>();
      models.add(app.vehicleModel);
      modelsByBrand.set(app.vehicleBrand, models);
      const key = `${app.vehicleBrand}__${app.vehicleModel}`;
      const range = yearsByModel.get(key);
      if (!range) {
        yearsByModel.set(key, { start: app.yearStart, end: app.yearEnd });
      } else {
        yearsByModel.set(key, {
          start: Math.min(range.start, app.yearStart),
          end: Math.max(range.end, app.yearEnd),
        });
      }
    }
  }
  return {
    brands: [...brands].sort(),
    modelsByBrand: new Map(
      [...modelsByBrand.entries()].map(([k, set]) => [k, [...set].sort()] as const),
    ),
    yearsByModel,
  };
}

/**
 * Cascading vehicle picker (PRD-061 RF-008) — Marca → Modelo → Ano.
 *
 * Options are derived from the parts catalog so the filter never offers
 * a vehicle for which we have no compatible part. Draft state lives
 * locally; the parent is notified only on "Aplicar".
 */
export function VehicleFilter({ brand, model, year, parts, onApply }: IVehicleFilterProps) {
  const [draftBrand, setDraftBrand] = useState<string | null>(brand);
  const [draftModel, setDraftModel] = useState<string | null>(model);
  const [draftYear, setDraftYear] = useState<number | null>(year);

  const cascade = useMemo(() => buildCascade(parts), [parts]);

  const models = useMemo(() => {
    if (!draftBrand) return [];
    return cascade.modelsByBrand.get(draftBrand) ?? [];
  }, [cascade, draftBrand]);

  const years = useMemo(() => {
    if (!draftBrand || !draftModel) return [];
    const range = cascade.yearsByModel.get(`${draftBrand}__${draftModel}`);
    if (!range) return [];
    const out: number[] = [];
    for (let y = range.end; y >= range.start; y -= 1) out.push(y);
    return out;
  }, [cascade, draftBrand, draftModel]);

  const hasActive = brand !== null || model !== null || year !== null;

  return (
    <div className="space-y-3 rounded-md border-2 border-primary/30 bg-primary/5 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:truck" size={18} className="text-primary" aria-hidden />
          {S.vehicleFilterTitle}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{S.vehicleFilterSubtitle}</p>
      </div>

      {hasActive && (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-primary/30 bg-background px-3 py-2 text-xs">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
            🚛 {S.vehicleClearLabel(brand ?? "", model ?? "", year)}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={S.vehicleClearAria}
            onClick={() => {
              setDraftBrand(null);
              setDraftModel(null);
              setDraftYear(null);
              onApply(null, null, null);
            }}
          >
            <Icon icon="mdi:close" size={14} />
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {S.vehicleBrandLabel}
          </label>
          <Select
            value={draftBrand ?? ""}
            onValueChange={(v) => {
              setDraftBrand(v || null);
              setDraftModel(null);
              setDraftYear(null);
            }}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={S.vehicleBrandPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {cascade.brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {S.vehicleModelLabel}
          </label>
          <Select
            value={draftModel ?? ""}
            disabled={!draftBrand || models.length === 0}
            onValueChange={(v) => {
              setDraftModel(v || null);
              setDraftYear(null);
            }}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={S.vehicleModelPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {S.vehicleYearLabel}
          </label>
          <Select
            value={draftYear !== null ? String(draftYear) : ""}
            disabled={!draftModel || years.length === 0}
            onValueChange={(v) => setDraftYear(v ? Number(v) : null)}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={S.vehicleYearPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full"
          disabled={!draftBrand}
          onClick={() => onApply(draftBrand, draftModel, draftYear)}
        >
          <Icon icon="mdi:filter-check" size={14} className="mr-1" aria-hidden />
          {S.vehicleApplyCta}
        </Button>
      </div>
    </div>
  );
}
