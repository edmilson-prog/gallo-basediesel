import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.panel.sections;

/**
 * The panel's sections, in the kit's order
 * (`PN_RAIL` in ui_kits/atendimento/painel/pn-ui.jsx).
 *
 * The kit says the rail carries "as mesmas seções do painel de cliente
 * convertido", and it does: this list is the lead-side mirror of `TAB_ORDER` in
 * `customers/components/ProfileTabs.tsx`, one entry each. What differs is the
 * lock — four sections describe things a lead cannot have yet, and the kit
 * shows them present-but-locked rather than hidden, because "converter destrava
 * isto" is the panel's whole argument. Hiding them would make the same point
 * invisible.
 *
 * `delegates` marks a section that is NOT rendered inside the panel: the
 * conversation screen already owns a full-height panel for it, and duplicating
 * one inside a 360px column would be a second implementation of the media
 * gallery to keep in sync.
 */
export type LeadPanelSectionId =
  | "overview"
  | "history"
  | "record"
  | "products"
  | "quotes"
  | "deliveries"
  | "conversations"
  | "media"
  | "notes"
  | "insights";

export interface ILeadPanelSection {
  id: LeadPanelSectionId;
  icon: string;
  label: string;
  /** False when the section only exists for a converted customer. */
  available: boolean;
  /** Opens one of the conversation screen's own panels instead of a body here. */
  delegates?: boolean;
}

export const LEAD_PANEL_SECTIONS: ILeadPanelSection[] = [
  { id: "overview", icon: "mdi:gauge", label: COPY.overview, available: true },
  { id: "history", icon: "mdi:history", label: COPY.history, available: true },
  { id: "record", icon: "mdi:card-account-details-outline", label: COPY.record, available: true },
  { id: "products", icon: "mdi:package-variant-closed", label: COPY.products, available: false },
  { id: "quotes", icon: "mdi:file-document-outline", label: COPY.quotes, available: false },
  { id: "deliveries", icon: "mdi:truck-outline", label: COPY.deliveries, available: false },
  { id: "conversations", icon: "mdi:chat-outline", label: COPY.conversations, available: true },
  {
    id: "media",
    icon: "mdi:image-multiple-outline",
    label: COPY.media,
    available: true,
    delegates: true,
  },
  { id: "notes", icon: "mdi:note-text-outline", label: COPY.notes, available: true },
  { id: "insights", icon: "mdi:lightbulb-outline", label: COPY.insights, available: false },
];

/** Sections that render a body inside the panel — everything else delegates. */
export const LEAD_PANEL_BODY_SECTIONS = LEAD_PANEL_SECTIONS.filter(
  (s) => s.available && !s.delegates,
).map((s) => s.id);
