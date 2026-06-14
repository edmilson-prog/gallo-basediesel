import { useCallback, useEffect, useRef, useState } from "react";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { pickRecorderMimeType, recordingFileName } from "../utils/audioRecording";

const V = CONVERSATION_STRINGS.voice;

export type RecorderStatus = "idle" | "recording" | "recorded";

export interface IUseAudioRecorderOptions {
  /** Called with a localized message when recording can't start (permission/device). */
  onError?: (message: string) => void;
}

export interface IUseAudioRecorderResult {
  status: RecorderStatus;
  /** False when the browser lacks `MediaRecorder`/`getUserMedia` (hide the button). */
  isSupported: boolean;
  /** Seconds elapsed while recording / final length of the recorded note. */
  elapsedSeconds: number;
  /** Object URL of the recorded blob for the preview `<audio>` (null until recorded). */
  recordedUrl: string | null;
  /** Request mic permission and begin capturing. No-op if unsupported or already recording. */
  start: () => Promise<void>;
  /** Stop capturing and materialize the recorded note (→ status "recorded"). */
  stop: () => void;
  /** Abort the in-flight recording or discard the preview (→ status "idle"). */
  cancel: () => void;
  /** Clear the recorded result after a successful send (→ status "idle"). */
  reset: () => void;
  /** Build a `File` from the recorded blob to feed the attachment pipeline. */
  getRecordedFile: () => File | null;
}

function detectSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * In-browser voice-note recorder. Captures a single Opus blob via `MediaRecorder`
 * and exposes a small state machine (idle → recording → recorded) plus a live
 * elapsed timer. The microphone stream is always released on stop/cancel/unmount,
 * and the preview object URL is revoked to avoid leaks.
 */
export function useAudioRecorder(options: IUseAudioRecorderOptions = {}): IUseAudioRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);

  // Keep the latest onError without re-creating `start` on every parent render.
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onErrorRef.current = options.onError;
  }, [options.onError]);

  const isSupported = detectSupport();

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!isSupported || recorderRef.current?.state === "recording") return;
    revokeUrl();
    setRecordedUrl(null);
    blobRef.current = null;
    chunksRef.current = [];
    setElapsedSeconds(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      onErrorRef.current?.(denied ? V.permissionDenied : V.unavailable);
      return;
    }
    streamRef.current = stream;

    const chosen = pickRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = chosen
        ? new MediaRecorder(stream, { mimeType: chosen })
        : new MediaRecorder(stream);
    } catch {
      // The chosen mimeType was rejected — fall back to the browser default.
      recorder = new MediaRecorder(stream);
    }
    mimeRef.current = recorder.mimeType || chosen || "audio/webm";
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimer();
      const type = mimeRef.current || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setRecordedUrl(url);
      setStatus("recorded");
      stopTracks();
    };

    try {
      recorder.start();
    } catch {
      stopTracks();
      onErrorRef.current?.(V.unavailable);
      return;
    }
    setStatus("recording");
    // Tick at 100ms with a monotonic clock so the timer shows accurate tenths
    // of a second without accumulating setInterval drift.
    startedAtRef.current = performance.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds((performance.now() - startedAtRef.current) / 1000);
    }, 100);
  }, [isSupported, revokeUrl, clearTimer, stopTracks]);

  const stop = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // → onstop builds the blob and flips to "recorded"
    }
  }, [clearTimer]);

  const cancel = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null; // suppress result materialization
      try {
        recorder.stop();
      } catch {
        /* already stopping */
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    blobRef.current = null;
    revokeUrl();
    setRecordedUrl(null);
    setElapsedSeconds(0);
    stopTracks();
    setStatus("idle");
  }, [clearTimer, revokeUrl, stopTracks]);

  const reset = useCallback(() => {
    revokeUrl();
    setRecordedUrl(null);
    blobRef.current = null;
    chunksRef.current = [];
    setElapsedSeconds(0);
    setStatus("idle");
  }, [revokeUrl]);

  const getRecordedFile = useCallback((): File | null => {
    const blob = blobRef.current;
    if (!blob) return null;
    const mime = mimeRef.current || "audio/webm";
    return new File([blob], recordingFileName(mime), { type: mime });
  }, []);

  // Release the mic, stop any active recorder and revoke the URL on unmount.
  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          /* noop */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [clearTimer]);

  return {
    status,
    isSupported,
    elapsedSeconds,
    recordedUrl,
    start,
    stop,
    cancel,
    reset,
    getRecordedFile,
  };
}
