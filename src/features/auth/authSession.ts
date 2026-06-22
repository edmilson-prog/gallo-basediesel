import type { RoleName } from "@/shared/types";

/**
 * Minimal session snapshot read synchronously, outside React, by route guards
 * (`readCurrentUserSync`) and the mock data scoping (`getCurrentContext`).
 *
 * Whichever auth backend is active — mock or supabase — writes this mirror on
 * sign-in and clears it on sign-out, so the synchronous readers keep working
 * without knowing which backend produced the session.
 */
export interface IAuthSyncMirror {
  id: string;
  role: RoleName;
  /**
   * Effective RBAC key (assigned role slug — system or custom). Mirrored so the
   * synchronous route guards resolve custom-role permissions, not just the base.
   * Undefined for base-role users (the lookup keys by `role`).
   */
  roleKey?: string;
  /** Linked seller id — the identity audit trails reference (FK → sellers). */
  sellerId?: string | null;
}

export const AUTH_SYNC_KEY = "gallo-auth-sync";

export function writeAuthSyncMirror(value: IAuthSyncMirror | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(AUTH_SYNC_KEY);
    else window.localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode). Session-only fallback.
  }
}

export function readAuthSyncMirror(): IAuthSyncMirror | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IAuthSyncMirror>;
    if (typeof parsed?.id === "string" && typeof parsed?.role === "string") {
      return {
        id: parsed.id,
        role: parsed.role as RoleName,
        roleKey: typeof parsed.roleKey === "string" ? parsed.roleKey : undefined,
        sellerId: typeof parsed.sellerId === "string" ? parsed.sellerId : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}
