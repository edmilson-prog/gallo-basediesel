import type { IVehicle } from "@/shared/types";

/** Shared contract for the layout composers — they only arrange cards. */
export interface IVehicleLayoutProps {
  vehicle: IVehicle;
  now: Date;
  canEdit: boolean;
  onAddService: () => void;
  onUpdated: () => void;
  onSeeFullHistory: () => void;
  /** Opens the link-model dialog (used by header badge + orphan empty states). */
  onRequestLinkModel: () => void;
  /** Opens the odometer modal — the input that unblocks health and the km curve. */
  onUpdateKm: () => void;
  /** Opens the vehicle form, where engine and VIN are edited. */
  onEdit: () => void;
}
