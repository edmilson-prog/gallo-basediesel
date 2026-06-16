import { describe, it, expect } from "vitest";
import type { IRole } from "@/shared/types";
import {
  buildDraft,
  computeChangedResources,
  computeSignature,
  serializeDraft,
  setScopeInDraft,
  toggleActionInDraft,
} from "./usePermissionDraft";

/**
 * Unit tests for the permission-draft engine (PRD-211 Task 10).
 *
 * The Vitest environment here is `node` (no DOM, no `@testing-library/react`),
 * so we exercise the exported PURE functions that the `usePermissionDraft` hook
 * delegates to — `buildDraft` / `toggleActionInDraft` / `setScopeInDraft` /
 * `serializeDraft` / `computeSignature` / `computeChangedResources`. The hook is
 * a thin `useState` wrapper over these, so this covers the engine behaviour
 * (a–d) the matrix relies on.
 */

/** Minimal role fixture with two seeded permissions. */
function makeRole(): IRole {
  return {
    id: "role-1",
    slug: "vendedor",
    name: "Vendedor",
    isSystem: true,
    isOwnerImmutable: false,
    baseRole: "Vendedor",
    storeId: null,
    permissions: [
      { resource: "customer", actions: ["view", "edit"], scope: "own" },
      { resource: "order", actions: ["view"], scope: "store" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("usePermissionDraft engine — serialization (PRD-211 Task 10)", () => {
  it("(a) enabling the first action on an empty resource creates an entry with default scope 'own'", () => {
    const draft = buildDraft(makeRole());
    expect(draft.has("quote")).toBe(false);

    const next = toggleActionInDraft(draft, "quote", "approve");
    const entry = next.get("quote");
    expect(entry).toBeDefined();
    expect([...entry!.actions]).toEqual(["approve"]);
    expect(entry!.scope).toBe("own");

    const serialized = serializeDraft(next).find((p) => p.resource === "quote");
    expect(serialized).toEqual({ resource: "quote", actions: ["approve"], scope: "own" });
  });

  it("(b) removing the last action drops the resource entry from the serialized output", () => {
    const draft = buildDraft(makeRole());
    // `order` only has `view`; removing it must drop the whole entry.
    const next = toggleActionInDraft(draft, "order", "view");
    expect(next.has("order")).toBe(false);

    const serialized = serializeDraft(next);
    expect(serialized.some((p) => p.resource === "order")).toBe(false);
    // `customer` (two actions) survives.
    expect(serialized.some((p) => p.resource === "customer")).toBe(true);
  });

  it("preserves the chosen scope when toggling additional actions", () => {
    let draft = buildDraft(makeRole());
    draft = setScopeInDraft(draft, "customer", "all");
    draft = toggleActionInDraft(draft, "customer", "delete");
    const entry = draft.get("customer");
    expect(entry!.scope).toBe("all");
    expect([...entry!.actions].sort()).toEqual(["delete", "edit", "view"]);
  });
});

describe("usePermissionDraft engine — dirty signature (PRD-211 Task 10)", () => {
  it("(c) is clean at baseline, dirty after a toggle, and clean again after rebase to the same role", () => {
    const role = makeRole();
    const baseline = computeSignature(buildDraft(role));

    // Baseline: pristine draft equals baseline signature → not dirty.
    expect(computeSignature(buildDraft(role))).toBe(baseline);

    // After a toggle the signature diverges → dirty.
    const edited = toggleActionInDraft(buildDraft(role), "customer", "delete");
    expect(computeSignature(edited)).not.toBe(baseline);

    // Rebase = rebuild from the (unchanged) role → signature matches baseline.
    expect(computeSignature(buildDraft(role))).toBe(baseline);
  });

  it("scope change alone makes the draft dirty", () => {
    const role = makeRole();
    const baseline = computeSignature(buildDraft(role));
    const scoped = setScopeInDraft(buildDraft(role), "order", "all");
    expect(computeSignature(scoped)).not.toBe(baseline);
  });

  it("toggling an action on and back off returns to the baseline signature", () => {
    const role = makeRole();
    const baseline = computeSignature(buildDraft(role));
    let draft = toggleActionInDraft(buildDraft(role), "customer", "delete");
    draft = toggleActionInDraft(draft, "customer", "delete");
    expect(computeSignature(draft)).toBe(baseline);
  });
});

describe("usePermissionDraft engine — changedResources (PRD-211 Task 10)", () => {
  it("(d) reflects added, removed and scope-changed rows", () => {
    const role = makeRole();
    const baseline = computeSignature(buildDraft(role));

    // Added row: brand-new resource.
    const added = toggleActionInDraft(buildDraft(role), "lead", "view");
    expect([...computeChangedResources(baseline, computeSignature(added))]).toEqual(["lead"]);

    // Removed row: drop `order`'s only action.
    const removed = toggleActionInDraft(buildDraft(role), "order", "view");
    expect(computeChangedResources(baseline, computeSignature(removed)).has("order")).toBe(true);

    // Scope-changed row: same actions, different scope.
    const rescoped = setScopeInDraft(buildDraft(role), "customer", "all");
    const changed = computeChangedResources(baseline, computeSignature(rescoped));
    expect(changed.has("customer")).toBe(true);
    expect(changed.has("order")).toBe(false);
  });

  it("reports no changed rows for a pristine draft", () => {
    const role = makeRole();
    const baseline = computeSignature(buildDraft(role));
    const changed = computeChangedResources(baseline, computeSignature(buildDraft(role)));
    expect(changed.size).toBe(0);
  });

  it("flags an action change on an existing row", () => {
    const role = makeRole();
    const baseline = computeSignature(buildDraft(role));
    const edited = toggleActionInDraft(buildDraft(role), "customer", "delete");
    const changed = computeChangedResources(baseline, computeSignature(edited));
    expect(changed.has("customer")).toBe(true);
  });
});
