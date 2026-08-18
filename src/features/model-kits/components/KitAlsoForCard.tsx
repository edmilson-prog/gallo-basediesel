import type { ID, IVehicleModel } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IAlsoForCandidate } from "../engine";

export interface IKitAlsoForCardProps {
  candidates: IAlsoForCandidate<IVehicleModel>[];
  /** Models the curator chose to receive a copy on save. */
  selected: ID[];
  onChange: (next: ID[]) => void;
}

/**
 * The answer to a filter kit serving `D13K460` and `D13K500` with no difference:
 * models with no kit where every base part of this composition applies. Saving
 * creates a copy in each, which beats curating the same kit twice.
 */
export function KitAlsoForCard({ candidates, selected, onChange }: IKitAlsoForCardProps) {
  if (candidates.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <header className="flex flex-wrap items-center gap-2">
        <Icon icon="mdi:layers-outline" size={15} className="text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Este kit também vale para</span>
        <span className="text-xs text-muted-foreground">
          modelos sem kit onde todas as peças base servem — salvar cria uma cópia em cada um
        </span>
      </header>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {candidates.map(({ model, isSibling }) => {
          const on = selected.includes(model.id);
          return (
            <button
              key={model.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? selected.filter((id) => id !== model.id) : [...selected, model.id])
              }
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon icon={on ? "mdi:check" : "mdi:plus"} size={13} />
              {model.model} {model.engine}
              {isSibling && " · mesmo modelo"}
            </button>
          );
        })}
      </div>
    </section>
  );
}
