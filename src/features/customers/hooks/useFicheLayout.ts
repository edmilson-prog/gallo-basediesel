import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";

/**
 * Discrete layout mode of the customer fiche (PRD-012 RF-040..042):
 *
 *  - `column`  — ≥ 1280px: lateral 360px column inside `ConversationPage`.
 *  - `drawer`  — 768..1279: overlay sheet toggled by the header button.
 *  - `route`   — < 768: the "Ficha" button navigates to `/app/clientes/:id`
 *                 (the page renders the same component with `variant="page"`).
 *
 * `undefined` during the first paint to prevent SSR/hydration jumps; consumers
 * should render nothing fiche-related until it resolves.
 */
export type FicheLayoutMode = "column" | "drawer" | "route";

const COLUMN_MIN_PX = 1280;
const DRAWER_MIN_PX = 768;

function readMode(): FicheLayoutMode {
  if (typeof window === "undefined") return "column";
  const w = window.innerWidth;
  if (w >= COLUMN_MIN_PX) return "column";
  if (w >= DRAWER_MIN_PX) return "drawer";
  return "route";
}

export function useFicheLayout(): FicheLayoutMode {
  const [mode, setMode] = useState<FicheLayoutMode>(() => readMode());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desktopMql = window.matchMedia(`(min-width: ${COLUMN_MIN_PX}px)`);
    const tabletMql = window.matchMedia(`(min-width: ${DRAWER_MIN_PX}px)`);
    const sync = () => setMode(readMode());
    desktopMql.addEventListener("change", sync);
    tabletMql.addEventListener("change", sync);
    sync();
    return () => {
      desktopMql.removeEventListener("change", sync);
      tabletMql.removeEventListener("change", sync);
    };
  }, []);

  return mode;
}

/**
 * Returns a click handler for the "Ficha" button in the conversation header
 * that does the right thing per breakpoint: toggle on tablet/desktop, navigate
 * on mobile. Lead-anchored conversations always TOGGLE (LeadProfileFiche
 * renders its overlay Sheet on route mode too): navigating to /app/leads/:id
 * would dead-end on "Lead não encontrado" for a pool attendant, since the
 * lead PAGE reads under the per-owner leads RLS — only the fiche is
 * conversation-gated.
 */
export function useFicheButtonHandler(params: {
  customerId: ID | null;
  toggle: () => void;
}): () => void {
  const mode = useFicheLayout();
  const navigate = useNavigate();
  return () => {
    if (mode === "route" && params.customerId) {
      void navigate({ to: `/app/clientes/${params.customerId}` as never });
      return;
    }
    params.toggle();
  };
}

/** Localized accessible label for the responsive "Ficha" button. */
export function getFicheButtonLabel(mode: FicheLayoutMode): string {
  if (mode === "route") return CUSTOMER_STRINGS.fiche.openOnMobileLabel;
  return "Ficha";
}
