import type { ID, ILeadFunnel } from "@/shared/types";

/**
 * Sentinel for the consolidated view. Not a funnel id: every funnel owns its
 * own stages, so there is no common X axis and a unified board is impossible
 * (spec 6.3). Selecting it forces the list view.
 */
export const ALL_FUNNELS = "todos" as const;

export interface IResolveInitialFunnelInput {
  /** `?funil=` — may be the ALL_FUNNELS sentinel. */
  urlFunnelId: string | undefined;
  /** `gallo-leads-last-funnel:<storeId>`. */
  lastFunnelId: string | null;
  /** Funnels this user actually reaches, archived already excluded. */
  accessible: ILeadFunnel[];
}

export interface IInitialFunnelResolution {
  funnelId: ID | typeof ALL_FUNNELS | null;
  /** The URL pointed at something unreachable — worth telling the user. */
  invalidLink: boolean;
  /** The stored key is stale and should be dropped. Not worth a toast. */
  clearLastFunnel: boolean;
}

function fallbackFunnelId(accessible: ILeadFunnel[]): ID | null {
  // The triage funnel is the stable destination the whole model leans on; it
  // is only ever absent in fixtures, so array order is the last resort.
  const preferred = accessible.find((f) => f.isDefault) ?? accessible[0];
  return preferred ? preferred.id : null;
}

export function resolveInitialFunnel({
  urlFunnelId,
  lastFunnelId,
  accessible,
}: IResolveInitialFunnelInput): IInitialFunnelResolution {
  if (urlFunnelId === ALL_FUNNELS) {
    return { funnelId: ALL_FUNNELS, invalidLink: false, clearLastFunnel: false };
  }

  const reachable = (id: string) => accessible.some((f) => f.id === id);

  if (urlFunnelId) {
    if (reachable(urlFunnelId)) {
      return { funnelId: urlFunnelId, invalidLink: false, clearLastFunnel: false };
    }
    // A shared link the user cannot open. Tell them, and land somewhere useful.
    return { funnelId: fallbackFunnelId(accessible), invalidLink: true, clearLastFunnel: false };
  }

  if (lastFunnelId) {
    if (reachable(lastFunnelId)) {
      return { funnelId: lastFunnelId, invalidLink: false, clearLastFunnel: false };
    }
    // Local leftover, not a user action: drop it quietly. Surfacing this as a
    // broken link would blame the user for their own history.
    return { funnelId: fallbackFunnelId(accessible), invalidLink: false, clearLastFunnel: true };
  }

  return { funnelId: fallbackFunnelId(accessible), invalidLink: false, clearLastFunnel: false };
}
