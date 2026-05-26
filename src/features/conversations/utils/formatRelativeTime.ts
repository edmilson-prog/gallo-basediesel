import { format, formatDistanceToNow, isThisYear, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Format a timestamp the way the inbox list shows it:
 *   - < 60s → "agora"
 *   - same day → "há 2 min" / "há 1 h"
 *   - yesterday → "ontem"
 *   - same year → "12/05"
 *   - older → "12/05/2025"
 *
 * Centralized here so every place that renders relative times (list item,
 * tooltips, hover cards) stays consistent.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return "agora";

  if (isToday(date)) {
    return `há ${formatDistanceToNow(date, { locale: ptBR })}`.replace("cerca de ", "");
  }
  if (isYesterday(date)) return "ontem";
  if (isThisYear(date)) return format(date, "dd/MM", { locale: ptBR });
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

/** True when the conversation should display a "Novo!" badge (< 60s). */
export function isFresh(iso: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(iso).getTime() < 60_000;
}
