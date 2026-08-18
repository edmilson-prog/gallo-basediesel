import type { IApplication } from "@/shared/types";

export interface IApplicationDraft extends Omit<IApplication, "id"> {
  /** Local-only id used as React key. */
  draftId: string;
  id?: string;
}

export function applicationsToDrafts(applications: IApplication[]): IApplicationDraft[] {
  return applications.map((a) => ({
    draftId: a.id,
    id: a.id,
    vehicleBrand: a.vehicleBrand,
    vehicleModel: a.vehicleModel,
    yearStart: a.yearStart,
    yearEnd: a.yearEnd,
    engine: a.engine,
  }));
}

export function draftsToApplications(drafts: IApplicationDraft[], partId: string): IApplication[] {
  return drafts
    .filter((d) => d.vehicleBrand && d.vehicleModel)
    .map((d, i) => ({
      id: d.id ?? `app-${partId}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      vehicleBrand: d.vehicleBrand,
      vehicleModel: d.vehicleModel,
      yearStart: d.yearStart,
      yearEnd: d.yearEnd,
      engine: d.engine,
    }));
}
