import type { IIdleAlertsSettings } from "@/shared/types";

/** Ladder position for a conversation, from business seconds waited. */
export function computeIdleLevel(
  businessSeconds: number,
  settings: IIdleAlertsSettings,
): 0 | 1 | 2 | 3 {
  if (businessSeconds >= settings.level3Hours * 3600) return 3;
  if (businessSeconds >= settings.level2Hours * 3600) return 2;
  if (businessSeconds >= settings.level1Hours * 3600) return 1;
  return 0;
}

/** Compact pt-BR elapsed label from an ISO instant: "25min", "3h", "4d 2h". */
export function formatElapsed(fromIso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(fromIso).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}
