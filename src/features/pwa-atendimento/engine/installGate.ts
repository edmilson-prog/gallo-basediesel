/**
 * Whether the "add to home screen" screen should still be shown.
 *
 * It comes BEFORE the login on purpose — on iOS a PWA only receives push once
 * installed, so asking after sign-in would be asking too late. But it is a
 * one-time nudge, not a wall: once the app runs standalone, or once the user
 * has walked past it, it never appears again.
 */
export const INSTALL_SEEN_KEY = "gallo-atendimento-install-seen";

export interface IInstallGateState {
  /** Running from the home screen already. */
  isStandalone: boolean;
  /** The stored "already walked past it" marker, or null. */
  seenMarker: string | null;
}

export function shouldShowInstallScreen({ isStandalone, seenMarker }: IInstallGateState): boolean {
  if (isStandalone) return false;
  return seenMarker === null;
}
