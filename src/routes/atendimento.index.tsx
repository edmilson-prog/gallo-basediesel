import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";
import {
  INSTALL_SEEN_KEY,
  shouldShowInstallScreen,
} from "@/features/pwa-atendimento/engine/installGate";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

function readSeenMarker(): string | null {
  try {
    return window.localStorage.getItem(INSTALL_SEEN_KEY);
  } catch {
    // No storage: treat it as already seen so a private tab is not nagged.
    return "1";
  }
}

export const Route = createFileRoute("/atendimento/")({
  beforeLoad: () => {
    if (readCurrentUserSync()) throw redirect({ to: "/atendimento/conversas" });
    const showInstall = shouldShowInstallScreen({
      isStandalone: isStandalone(),
      seenMarker: readSeenMarker(),
    });
    throw redirect({ to: showInstall ? "/atendimento/instalar" : "/atendimento/entrar" });
  },
});
