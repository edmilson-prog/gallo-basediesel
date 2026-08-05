/**
 * Date formatting for the profile identity header.
 *
 * Everything is rendered on the São Paulo calendar (the platform's operating
 * timezone — same convention as the work-schedule engine), so the labels do not
 * drift with the viewer's machine timezone.
 */

const TIME_ZONE = "America/Sao_Paulo";

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "março de 2024" — used by "Na equipe desde". */
export function formatMemberSince(iso: string | null | undefined): string | null {
  const date = parse(iso);
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** São Paulo calendar day as "YYYY-MM-DD", for same-day comparisons. */
function calendarDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

function clockTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(date);
}

/** "hoje, 08:42" · "ontem, 19:05" · "28/07/2026, 10:15". */
export function formatLastAccess(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const date = parse(iso);
  if (!date) return null;

  const time = clockTime(date);
  const today = calendarDay(now);
  const target = calendarDay(date);
  if (target === today) return `hoje, ${time}`;

  const yesterday = calendarDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (target === yesterday) return `ontem, ${time}`;

  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
  return `${day}, ${time}`;
}
