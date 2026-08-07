/**
 * On-screen alert for an inbound message that lands on a conversation the
 * signed-in seller is NOT looking at (v0.165.0 Chime).
 *
 * Deliberately separate from `ISoundSettings`: that block models audio
 * (template + volume), this one models the visual alert. They share a screen
 * (Configurações → Sons de notificação) and an event, not a lifecycle — turning
 * the sound off must never take the on-screen alert with it.
 */
export interface IInboundToastSettings {
  /** Whether the on-screen alert appears at all. */
  enabled: boolean;
  /** Show the message text. When false, only the contact name is shown. */
  showPreview: boolean;
  /** How long the alert stays on screen. */
  durationSeconds: number;
}

/** Applied when `IPlatformSettings.inboundToast` is absent (existing stores). */
export const DEFAULT_INBOUND_TOAST_SETTINGS: IInboundToastSettings = {
  enabled: true,
  showPreview: true,
  durationSeconds: 8,
};

/** Below this the alert closes before it can be read and clicked. */
export const INBOUND_TOAST_DURATION_MIN_SECONDS = 3;
/** Above this a burst of alerts would pile up on screen. */
export const INBOUND_TOAST_DURATION_MAX_SECONDS = 30;
