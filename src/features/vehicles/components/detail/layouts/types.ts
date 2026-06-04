import type { IVehicle } from "@/shared/types";

/** Shared contract for all three layout composers — they only arrange cards. */
export interface IVehicleLayoutProps {
  vehicle: IVehicle;
  now: Date;
  canEdit: boolean;
  onAddService: () => void;
  onUpdated: () => void;
  onSeeFullHistory: () => void;
  /** Opens the link-model dialog (used by header badge + orphan empty states). */
  onRequestLinkModel: () => void;
}
