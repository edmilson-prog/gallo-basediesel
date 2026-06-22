// src/features/tour/components/TourHelpButton.tsx
import { useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useTourStore } from "../store/useTourStore";
import { resolveTourForPath } from "../engine/tourResolution";
import { TOURS } from "../config/tours";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

// Context-aware help button for the TopBar: reopens the current screen's tour.
// Renders nothing when the current route has no registered tour.
export function TourHelpButton() {
  const { currentUser } = useAuth();
  const pathname = useLocation({ select: (l) => l.pathname });
  const start = useTourStore((s) => s.start);
  const def = resolveTourForPath(pathname, TOURS);
  if (!def || !currentUser) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={S.helpButtonLabel}
      title={S.helpButtonLabel}
      onClick={() => start(def, currentUser.id)}
    >
      <Icon icon="mdi:help-circle-outline" size={20} />
    </Button>
  );
}
