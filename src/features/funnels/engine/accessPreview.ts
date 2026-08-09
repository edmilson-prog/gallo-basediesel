import type { ID, ISeller } from "@/shared/types";

export interface IAccessPreviewInput {
  /** Every seller in the store, in display order. */
  sellers: ISeller[];
  /** Nominal grants — `lead_funnel_access`. */
  grantedIds: ID[];
  /** The `open_to_store` shortcut. */
  openToStore: boolean;
  /** Owners and managers, who reach every funnel through their role. */
  staffIds: ID[];
}

export interface IAccessPreview {
  /** Everybody who reaches this funnel, counted once. */
  reachCount: number;
  viaRole: ISeller[];
  viaStore: ISeller[];
  viaGrant: ISeller[];
  /** No seller reaches it — staff alone does not count as reach. */
  isEmpty: boolean;
}

/**
 * Who ends up seeing this funnel, and by which route.
 *
 * The two dimensions ADD, never intersect: "todos da loja" plus a nominal grant
 * is a union, and a person appears once. `open_to_store` is a shortcut, not a
 * contradiction of the owner's decision 2 — that decision discarded access by
 * DEPARTMENT, not opening a funnel to the whole store. Without it, admitting one
 * new seller would mean editing every funnel by hand, and nobody would remember.
 *
 * The order of the buckets is the explanation the user reads, so it is fixed:
 * role beats store, store beats grant. Somebody who reaches the funnel because
 * they are a manager should not be shown as "ticked", because unticking them
 * would change nothing.
 *
 * `isEmpty` deliberately ignores staff. Owners and managers always reach every
 * funnel, so counting them would mean the "ninguém enxerga este funil" warning
 * could never fire — and that warning is the whole point of the preview.
 */
export function resolveAccessPreview({
  sellers,
  grantedIds,
  openToStore,
  staffIds,
}: IAccessPreviewInput): IAccessPreview {
  const staff = new Set(staffIds);
  const granted = new Set(grantedIds);
  const claimed = new Set<ID>();

  const viaRole: ISeller[] = [];
  const viaStore: ISeller[] = [];
  const viaGrant: ISeller[] = [];

  for (const s of sellers) {
    if (staff.has(s.id)) {
      viaRole.push(s);
      claimed.add(s.id);
    }
  }

  if (openToStore) {
    for (const s of sellers) {
      if (claimed.has(s.id)) continue;
      viaStore.push(s);
      claimed.add(s.id);
    }
  }

  for (const s of sellers) {
    if (claimed.has(s.id) || !granted.has(s.id)) continue;
    viaGrant.push(s);
    claimed.add(s.id);
  }

  return {
    reachCount: claimed.size,
    viaRole,
    viaStore,
    viaGrant,
    isEmpty: viaStore.length === 0 && viaGrant.length === 0,
  };
}
