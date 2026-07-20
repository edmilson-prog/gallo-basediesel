import {
  DEFAULT_SOUND_SETTINGS,
  type ISoundEventConfig,
  type ISoundSettings,
  type SoundEventId,
} from "@/shared/types";
import { SOUND_TEMPLATES } from "./soundTemplates";

export interface ISoundEventMeta {
  id: SoundEventId;
  label: string;
  description: string;
}

/** UI catalog of the configurable events, in display order. */
export const SOUND_EVENTS: ISoundEventMeta[] = [
  {
    id: "updateAvailable",
    label: "Atualização disponível",
    description: "Quando uma nova versão da plataforma está pronta.",
  },
  {
    id: "inboxAssignedMine",
    label: "Mensagem na minha conversa",
    description: "Chegou mensagem numa conversa em que você já atende.",
  },
  {
    id: "inboxNewInQueue",
    label: "Novo cliente na fila",
    description: "Uma nova conversa sem dono entrou na fila.",
  },
  {
    id: "sessionTimeout",
    label: "Aviso de inatividade",
    description: "Durante a contagem regressiva antes do logout automático.",
  },
];

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/**
 * Resolves the effective config for an event, tolerating absent/legacy/corrupt
 * blobs: missing settings or event → the event default; an unknown templateId →
 * the event's default template; out-of-range volume → clamped.
 */
export function resolveEventConfig(
  settings: ISoundSettings | undefined,
  eventId: SoundEventId,
): ISoundEventConfig {
  const fallback = DEFAULT_SOUND_SETTINGS.events[eventId];
  const cfg = settings?.events?.[eventId];
  if (!cfg) return fallback;
  const templateId = cfg.templateId in SOUND_TEMPLATES ? cfg.templateId : fallback.templateId;
  return {
    enabled: Boolean(cfg.enabled),
    templateId,
    volume: clamp01(cfg.volume),
  };
}
