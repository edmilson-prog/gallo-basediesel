import { useCallback, useMemo, useState } from "react";
import type { IPermission, IRole, PermissionAction, PermissionScope } from "@/shared/types";

/** Default scope assigned when a resource gains its first action. */
const DEFAULT_SCOPE: PermissionScope = "own";

/** Draft entry per resource: the set of granted actions + the chosen scope. */
export interface IDraftEntry {
  actions: Set<PermissionAction>;
  scope: PermissionScope;
}

/** Draft matrix keyed by resource key. */
export type DraftMatrix = Map<string, IDraftEntry>;

function buildDraft(role: IRole): DraftMatrix {
  const map: DraftMatrix = new Map();
  for (const perm of role.permissions) {
    map.set(perm.resource, {
      actions: new Set(perm.actions),
      scope: perm.scope,
    });
  }
  return map;
}

/**
 * Serializes a draft matrix to `IPermission[]` for `setPermissions` (PRD-211).
 *
 * A resource has an entry IFF it has ≥1 action selected — `setPermissions`
 * replaces the whole set, so the complete list of non-empty entries is sent.
 */
export function serializeDraft(draft: DraftMatrix): IPermission[] {
  const out: IPermission[] = [];
  for (const [resource, entry] of draft) {
    if (entry.actions.size === 0) continue;
    out.push({
      resource,
      actions: [...entry.actions],
      scope: entry.scope,
    });
  }
  return out;
}

/** Stable string signature of a draft, for cheap dirty comparison. */
function signature(draft: DraftMatrix): string {
  return serializeDraft(draft)
    .map((p) => `${p.resource}:${[...p.actions].sort().join(",")}:${p.scope}`)
    .sort()
    .join("|");
}

export interface IPermissionDraft {
  /** The current editable matrix keyed by resource. */
  draft: DraftMatrix;
  /** True when the draft diverges from the role's persisted permissions. */
  dirty: boolean;
  /** Set of resource keys whose entry differs from the baseline (changed rows). */
  changedResources: Set<string>;
  /** Toggles one action on a resource (creates/drops the entry as needed). */
  toggleAction: (resource: string, action: PermissionAction) => void;
  /** Changes the scope of a resource that already has actions. */
  setScope: (resource: string, scope: PermissionScope) => void;
  /** Resets the draft to a fresh copy of the given role's permissions. */
  reset: (role: IRole) => void;
  /** Re-bases the draft onto a new persisted role (post save/restore). */
  rebase: (role: IRole) => void;
  /** The serialized non-empty permission set. */
  serialize: () => IPermission[];
}

/**
 * Per-role editable permission draft (PRD-211 Task 10).
 *
 * Holds a working copy of the selected role's matrix, tracks dirtiness against a
 * baseline signature, and exposes mutators. The baseline is re-set whenever the
 * caller switches roles or re-bases after a successful save/restore.
 */
export function usePermissionDraft(role: IRole): IPermissionDraft {
  const [draft, setDraft] = useState<DraftMatrix>(() => buildDraft(role));
  const [baseline, setBaseline] = useState<string>(() => signature(buildDraft(role)));

  const reset = useCallback((nextRole: IRole) => {
    const fresh = buildDraft(nextRole);
    setDraft(fresh);
    setBaseline(signature(fresh));
  }, []);

  const rebase = useCallback((nextRole: IRole) => {
    const fresh = buildDraft(nextRole);
    setDraft(fresh);
    setBaseline(signature(fresh));
  }, []);

  const toggleAction = useCallback((resource: string, action: PermissionAction) => {
    setDraft((prev) => {
      const next = new Map(prev);
      const entry = next.get(resource);
      if (!entry) {
        // First action on a resource that had none — create with default scope.
        next.set(resource, { actions: new Set([action]), scope: DEFAULT_SCOPE });
        return next;
      }
      const actions = new Set(entry.actions);
      if (actions.has(action)) {
        actions.delete(action);
      } else {
        actions.add(action);
      }
      if (actions.size === 0) {
        // Last action removed — drop the entry entirely.
        next.delete(resource);
      } else {
        next.set(resource, { actions, scope: entry.scope });
      }
      return next;
    });
  }, []);

  const setScope = useCallback((resource: string, scope: PermissionScope) => {
    setDraft((prev) => {
      const entry = prev.get(resource);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(resource, { actions: new Set(entry.actions), scope });
      return next;
    });
  }, []);

  const currentSignature = useMemo(() => signature(draft), [draft]);
  const dirty = currentSignature !== baseline;

  const changedResources = useMemo(() => {
    const baselineByResource = new Map(
      baseline
        ? baseline.split("|").filter(Boolean).map((token) => {
            const resource = token.slice(0, token.indexOf(":"));
            return [resource, token] as const;
          })
        : [],
    );
    const changed = new Set<string>();
    const currentTokens = currentSignature.split("|").filter(Boolean);
    const currentByResource = new Map(
      currentTokens.map((token) => [token.slice(0, token.indexOf(":")), token] as const),
    );
    // Rows present now whose token changed, or that appeared.
    for (const [resource, token] of currentByResource) {
      if (baselineByResource.get(resource) !== token) changed.add(resource);
    }
    // Rows that disappeared.
    for (const resource of baselineByResource.keys()) {
      if (!currentByResource.has(resource)) changed.add(resource);
    }
    return changed;
  }, [baseline, currentSignature]);

  const serialize = useCallback(() => serializeDraft(draft), [draft]);

  return {
    draft,
    dirty,
    changedResources,
    toggleAction,
    setScope,
    reset,
    rebase,
    serialize,
  };
}
