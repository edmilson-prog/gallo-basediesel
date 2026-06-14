/**
 * Pure helpers for in-browser voice-note recording (the `MediaRecorder` and
 * `getUserMedia` side effects live in `hooks/useAudioRecorder`). Kept DOM-free so
 * the codec selection and file naming stay unit-testable.
 */

/**
 * Candidate recorder MIME types in preference order. `audio/ogg;codecs=opus`
 * comes first because it is the only Opus container the Meta Cloud API accepts
 * as a media upload; Chrome falls back to `audio/webm;codecs=opus` (Evolution's
 * `sendWhatsAppAudio` transcodes any playable source into a WhatsApp voice
 * note, so webm is fine on the production engine).
 */
export const RECORDER_MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

/** Minimum useful recording length — guards against accidental zero-length taps. */
export const MIN_RECORDING_SECONDS = 1;

/** Container extension for a recorder MIME type (codec params and case ignored). */
export function mimeToExtension(mime: string): string {
  const base = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/webm") return "webm";
  if (base === "audio/mp4" || base === "audio/aac") return "m4a";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

/**
 * Best MIME type this browser can record, or `""` to let the browser pick its
 * default. `isSupported` is injected (defaults to `MediaRecorder.isTypeSupported`)
 * so the selection is testable without a real `MediaRecorder`.
 */
export function pickRecorderMimeType(
  isSupported: ((mime: string) => boolean) | undefined = defaultIsTypeSupported(),
): string {
  if (!isSupported) return "";
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (isSupported(candidate)) return candidate;
  }
  return "";
}

/** Recipient-side file name for a recorded voice note. */
export function recordingFileName(mime: string): string {
  return `nota-de-voz.${mimeToExtension(mime)}`;
}

/**
 * Stopwatch format `MM:SS.d` (tenths of a second) for the live recording timer —
 * the decimal makes it obvious the capture is running in real time.
 */
export function formatStopwatch(totalSeconds: number): string {
  const total = Math.max(0, totalSeconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total) % 60;
  const tenths = Math.floor(total * 10) % 10;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}

/** Resolve `MediaRecorder.isTypeSupported` when present (undefined in jsdom/SSR). */
function defaultIsTypeSupported(): ((mime: string) => boolean) | undefined {
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
    return (mime: string) => MediaRecorder.isTypeSupported(mime);
  }
  return undefined;
}
