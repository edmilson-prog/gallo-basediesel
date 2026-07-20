/**
 * Sound-center domain model (Configurações → Sons de notificação).
 *
 * Lives in `shared/types` (not in the feature) so `IPlatformSettings` can
 * reference it without shared/types depending on `features/`. The feature's
 * engine adds the synthesis + labels keyed by these ids.
 */

/** A synthesizable sound preset in the library. */
export type SoundTemplateId =
  | "marimba"
  | "diesel"
  | "buzina"
  | "sino"
  | "powerup"
  | "fanfarra"
  | "classic-short"
  | "classic-queue";

/** A platform event that can emit a sound. */
export type SoundEventId =
  | "updateAvailable"
  | "inboxAssignedMine"
  | "inboxNewInQueue"
  | "sessionTimeout";

/** Per-event sound config, stored per-store. */
export interface ISoundEventConfig {
  enabled: boolean;
  templateId: SoundTemplateId;
  /** 0..1 */
  volume: number;
}

/** The `sound` block of `IPlatformSettings`. */
export interface ISoundSettings {
  events: Record<SoundEventId, ISoundEventConfig>;
}

/** Applied when `IPlatformSettings.sound` is absent (existing stores). */
export const DEFAULT_SOUND_SETTINGS: ISoundSettings = {
  events: {
    updateAvailable: { enabled: true, templateId: "marimba", volume: 0.7 },
    inboxAssignedMine: { enabled: true, templateId: "classic-short", volume: 0.5 },
    inboxNewInQueue: { enabled: true, templateId: "classic-queue", volume: 0.6 },
    sessionTimeout: { enabled: true, templateId: "classic-short", volume: 0.6 },
  },
};
