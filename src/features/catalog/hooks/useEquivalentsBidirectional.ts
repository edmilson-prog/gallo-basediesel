import type { ID } from "@/shared/types";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";

/**
 * Apply bidirectional consistency between two equivalent-id lists.
 *
 * For every id added: load the counterpart and add `partId` to its
 * `equivalentPartIds` (idempotent).
 * For every id removed: load the counterpart and drop `partId` from its
 * `equivalentPartIds` (idempotent).
 */
export function useEquivalentsBidirectional() {
  const provider = usePartsProvider();

  async function reconcile(partId: ID, previous: ID[], next: ID[]) {
    const prevSet = new Set(previous);
    const nextSet = new Set(next);
    const added = next.filter((id) => !prevSet.has(id));
    const removed = previous.filter((id) => !nextSet.has(id));

    for (const counterpartId of added) {
      try {
        const counterpart = await provider.get(counterpartId);
        if (!counterpart.equivalentPartIds.includes(partId)) {
          await provider.update(counterpartId, {
            equivalentPartIds: [...counterpart.equivalentPartIds, partId],
          });
          auditLog({
            action: "part_equivalent_update",
            resource: "part",
            resourceId: counterpartId,
            before: { equivalentPartIds: counterpart.equivalentPartIds },
            after: { equivalentPartIds: [...counterpart.equivalentPartIds, partId] },
          });
        }
      } catch {
        // Counterpart vanished — ignore.
      }
    }

    for (const counterpartId of removed) {
      try {
        const counterpart = await provider.get(counterpartId);
        if (counterpart.equivalentPartIds.includes(partId)) {
          const filtered = counterpart.equivalentPartIds.filter((id) => id !== partId);
          await provider.update(counterpartId, { equivalentPartIds: filtered });
          auditLog({
            action: "part_equivalent_update",
            resource: "part",
            resourceId: counterpartId,
            before: { equivalentPartIds: counterpart.equivalentPartIds },
            after: { equivalentPartIds: filtered },
          });
        }
      } catch {
        // ignore
      }
    }
  }

  return { reconcile };
}
