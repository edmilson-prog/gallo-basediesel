import type { IVehicleModel, IVehicleModelKit, ModelKitCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BrandAvatar } from "@/features/vehicle-models/components/BrandAvatar";
import { formatYearRange } from "@/features/vehicle-models/utils/formatYearRange";
import { CATEGORY_FAMILIES, KIT_CATEGORY_CONFIG, KIT_FAMILIES } from "../engine";
import { KitStatusBadge } from "./KitStatusBadge";

const CATEGORIES = Object.keys(KIT_CATEGORY_CONFIG) as ModelKitCategory[];

function categoryLabel(category: ModelKitCategory): string {
  const label = KIT_CATEGORY_CONFIG[category].label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "famílias: Óleo, Combustível, Ar" — what picking this category will ask for. */
function categoryHint(category: ModelKitCategory): string {
  const { slots } = CATEGORY_FAMILIES[category];
  if (slots.length === 0) return "sem famílias definidas";
  return `famílias: ${slots.map((f) => KIT_FAMILIES[f].label).join(", ")}`;
}

export interface IKitBuildHeaderProps {
  model: IVehicleModel;
  /** The kit being edited, if any. */
  kit?: IVehicleModelKit;
  /** Quotes that already applied this kit. */
  appliedCount?: number;
  name: string;
  onNameChange: (name: string) => void;
  category: ModelKitCategory;
  onCategoryChange: (category: ModelKitCategory) => void;
}

/**
 * What is being curated and for which truck. Editing a kit that already reached
 * quotes says so out loud — the kit is a live definition, so a change here is a
 * change to the next quote, not to the ones already sent.
 */
export function KitBuildHeader({
  model,
  kit,
  appliedCount,
  name,
  onNameChange,
  category,
  onCategoryChange,
}: IKitBuildHeaderProps) {
  const years = formatYearRange(model.yearStart, model.yearEnd);

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <BrandAvatar brand={model.brand} className="size-7" />
        <span className="text-sm font-semibold text-foreground">
          {model.brand} {model.model}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{model.engine}</span>
        {years && <span className="text-xs tabular-nums text-muted-foreground">{years}</span>}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {kit ? (
            <>
              <KitStatusBadge status={kit.status} />
              <span className="text-xs text-muted-foreground">
                {appliedCount != null && appliedCount > 0
                  ? `aplicado ${appliedCount}× — mexer aqui muda o próximo orçamento`
                  : "ainda não aplicado"}
              </span>
            </>
          ) : (
            <Badge
              variant="outline"
              className="border-severity-warning/40 gap-1 text-severity-warning"
            >
              <Icon icon="mdi:pencil-ruler" size={13} />
              Novo
            </Badge>
          )}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div className="min-w-[13rem] flex-1 space-y-1.5">
          <Label htmlFor="kit-name">Nome do kit</Label>
          <Input
            id="kit-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ex.: Kit de filtros revisão 30.000 km"
            className="h-10 text-base font-semibold"
          />
        </div>

        <div className="space-y-1.5">
          <Label id="kit-category-label">Categoria</Label>
          <div
            role="group"
            aria-labelledby="kit-category-label"
            className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5"
          >
            {CATEGORIES.map((option) => {
              const active = option === category;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  title={categoryHint(option)}
                  onClick={() => onCategoryChange(option)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon icon={KIT_CATEGORY_CONFIG[option].icon} size={14} />
                  {categoryLabel(option)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
