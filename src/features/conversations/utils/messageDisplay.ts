import type { IMessage, MessageMediaType, MessageStatus } from "@/shared/types";

/** Pretty `HH:mm` formatter in the user's local time. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Pretty `mm:ss` for audio durations. */
export function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Friendly byte size — KB / MB / GB with one decimal place. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/** Icon name (Iconify) for each media type / extension. */
export function mediaIcon(mediaType: MessageMediaType | undefined, fileName?: string): string {
  if (!mediaType) return "mdi:file-document-outline";
  if (mediaType === "image") return "mdi:image-outline";
  if (mediaType === "audio") return "mdi:waveform";
  if (mediaType === "video") return "mdi:video-outline";
  if (mediaType === "sticker") return "mdi:sticker-emoji";
  // document
  const ext = (fileName ?? "").toLowerCase();
  if (ext.endsWith(".pdf")) return "mdi:file-pdf-box";
  if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) return "mdi:file-excel-box";
  if (ext.endsWith(".docx") || ext.endsWith(".doc")) return "mdi:file-word-box";
  if (ext.endsWith(".zip") || ext.endsWith(".rar")) return "mdi:zip-box-outline";
  return "mdi:file-document-outline";
}

export interface IStatusVisual {
  /** Iconify icon name. */
  icon: string;
  /** Tailwind classes for the foreground colour. */
  className: string;
  /** Short `aria-label`. */
  label: string;
}

export function statusVisual(status: MessageStatus): IStatusVisual {
  switch (status) {
    case "sent":
      return {
        icon: "mdi:check",
        className: "text-muted-foreground",
        label: "Enviada",
      };
    case "delivered":
      return {
        icon: "mdi:check-all",
        className: "text-muted-foreground",
        label: "Entregue",
      };
    case "read":
      return {
        icon: "mdi:check-all",
        className: "text-sky-500 dark:text-sky-400",
        label: "Lida",
      };
    case "failed":
      return {
        icon: "mdi:alert-circle",
        className: "text-destructive",
        label: "Falha no envio",
      };
  }
}

/** Resolve a friendly file name for a document bubble. */
export function fileNameFromUrl(url?: string): string {
  if (!url) return "anexo";
  const clean = url.split("?")[0] ?? url;
  const segments = clean.split("/");
  return decodeURIComponent(segments[segments.length - 1] ?? "anexo");
}

/** Estimated audio duration from a deterministic hash of the message id. */
export function fakeAudioSeconds(message: IMessage): number {
  let h = 0;
  for (let i = 0; i < message.id.length; i += 1) {
    h = (h * 31 + message.id.charCodeAt(i)) | 0;
  }
  return 8 + (Math.abs(h) % 60);
}
