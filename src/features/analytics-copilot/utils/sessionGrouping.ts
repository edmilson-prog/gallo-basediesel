// src/features/analytics-copilot/utils/sessionGrouping.ts
import type { ICopilotSessionRecord } from "../engine/sessionStore";

export interface ISessionGroup {
  label: "Hoje" | "Ontem" | "Anteriores";
  sessions: ICopilotSessionRecord[];
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Group sessions by relative day (Hoje/Ontem/Anteriores), newest first within each group. */
export function groupSessionsByDate(
  sessions: ICopilotSessionRecord[],
  now: Date = new Date(),
): ISessionGroup[] {
  const todayStart = startOfDay(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const yesterdayStart = todayStart - dayMs;

  const buckets: Record<ISessionGroup["label"], ICopilotSessionRecord[]> = {
    Hoje: [],
    Ontem: [],
    Anteriores: [],
  };

  for (const s of sessions) {
    const t = new Date(s.updatedAt).getTime();
    if (Number.isNaN(t)) {
      buckets.Anteriores.push(s);
    } else if (t >= todayStart) {
      buckets.Hoje.push(s);
    } else if (t >= yesterdayStart) {
      buckets.Ontem.push(s);
    } else {
      buckets.Anteriores.push(s);
    }
  }

  const order: ISessionGroup["label"][] = ["Hoje", "Ontem", "Anteriores"];
  return order
    .map((label) => ({
      label,
      sessions: buckets[label].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .filter((g) => g.sessions.length > 0);
}
