import {
  DEFAULT_INBOUND_TOAST_SETTINGS,
  INBOUND_TOAST_DURATION_MAX_SECONDS,
  INBOUND_TOAST_DURATION_MIN_SECONDS,
  type IInboundToastSettings,
} from "@/shared/types";

/**
 * Effective on-screen alert config, tolerating absent / legacy / corrupt blobs —
 * same contract as `sound-settings`' `resolveEventConfig`.
 *
 * Missing booleans resolve to the DEFAULT (true), never to `false`: a blob
 * written before these fields existed must not silently mute the alert for a
 * whole store. Only an explicit `false` turns something off.
 */
export function resolveInboundToastSettings(
  raw: IInboundToastSettings | undefined,
): IInboundToastSettings {
  if (!raw) return { ...DEFAULT_INBOUND_TOAST_SETTINGS };

  const rawDuration = Number(raw.durationSeconds);
  const durationSeconds = Number.isFinite(rawDuration)
    ? Math.min(
        INBOUND_TOAST_DURATION_MAX_SECONDS,
        Math.max(INBOUND_TOAST_DURATION_MIN_SECONDS, rawDuration),
      )
    : DEFAULT_INBOUND_TOAST_SETTINGS.durationSeconds;

  return {
    enabled: raw.enabled ?? DEFAULT_INBOUND_TOAST_SETTINGS.enabled,
    showPreview: raw.showPreview ?? DEFAULT_INBOUND_TOAST_SETTINGS.showPreview,
    durationSeconds,
  };
}
