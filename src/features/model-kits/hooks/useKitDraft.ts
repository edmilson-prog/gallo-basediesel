import { useCallback, useState } from "react";
import type {
  ID,
  IKitItem,
  IVehicleModel,
  IVehicleModelKit,
  ModelKitCategory,
} from "@/shared/types";
import { KIT_CATEGORY_CONFIG } from "../engine";

export interface IKitDraft {
  name: string;
  setName: (name: string) => void;
  category: ModelKitCategory;
  setCategory: (category: ModelKitCategory) => void;
  items: IKitItem[];
  /** No-op when the part is already in the composition. */
  add: (partId: ID, isOptional?: boolean) => void;
  patch: (partId: ID, patch: Partial<IKitItem>) => void;
  remove: (partId: ID) => void;
  /** Adopts another kit's composition and category — "começar de um kit parecido". */
  adopt: (kit: IVehicleModelKit) => void;
}

function defaultName(model: IVehicleModel | undefined, category: ModelKitCategory): string {
  const label = KIT_CATEGORY_CONFIG[category].label;
  const title = label.charAt(0).toUpperCase() + label.slice(1);
  if (!model) return `Kit ${title}`;
  return `Kit ${title} — ${model.brand} ${model.model} ${model.engine}`;
}

export interface IUseKitDraftParams {
  model: IVehicleModel | undefined;
  /** The kit being edited, if any. */
  kit?: IVehicleModelKit;
  /** Part carried in from the ficha via `?addPartId=`. */
  seedPartId?: ID;
}

/**
 * The composition being curated. Kept keyed by `partId` rather than by index:
 * every surface that edits a line — the family slots, the extras card, the
 * catalog search — addresses the part, and a kit never holds the same part
 * twice.
 */
export function useKitDraft({ model, kit, seedPartId }: IUseKitDraftParams): IKitDraft {
  const [category, setCategory] = useState<ModelKitCategory>(kit?.category ?? "filtros");
  const [name, setName] = useState(
    () => kit?.name ?? defaultName(model, kit?.category ?? "filtros"),
  );
  const [items, setItems] = useState<IKitItem[]>(() => {
    if (kit) return kit.items.map((item) => ({ ...item }));
    if (seedPartId) return [{ partId: seedPartId, defaultQuantity: 1, isOptional: false }];
    return [];
  });

  const add = useCallback((partId: ID, isOptional = false) => {
    setItems((current) =>
      current.some((item) => item.partId === partId)
        ? current
        : [...current, { partId, defaultQuantity: 1, isOptional }],
    );
  }, []);

  const patch = useCallback((partId: ID, next: Partial<IKitItem>) => {
    setItems((current) =>
      current.map((item) => (item.partId === partId ? { ...item, ...next } : item)),
    );
  }, []);

  const remove = useCallback((partId: ID) => {
    setItems((current) => current.filter((item) => item.partId !== partId));
  }, []);

  const adopt = useCallback((source: IVehicleModelKit) => {
    setItems(source.items.map((item) => ({ ...item })));
    setCategory(source.category);
  }, []);

  return { name, setName, category, setCategory, items, add, patch, remove, adopt };
}
