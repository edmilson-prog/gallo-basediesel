export type PartLookupLayout = "headline" | "dense" | "tabs";

export const PART_LOOKUP_LAYOUTS: readonly PartLookupLayout[] = ["headline", "dense", "tabs"];
export const DEFAULT_PART_LOOKUP_LAYOUT: PartLookupLayout = "headline";

export function parsePartLookupLayout(raw: string | null): PartLookupLayout {
  return PART_LOOKUP_LAYOUTS.includes(raw as PartLookupLayout)
    ? (raw as PartLookupLayout)
    : DEFAULT_PART_LOOKUP_LAYOUT;
}
