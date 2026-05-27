import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { IGoalWithProgress } from "./useGoalsWithProgress";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";

const STORAGE_KEY = "gallo-goal-milestones";
const MILESTONES = [50, 80, 100] as const;
type Milestone = (typeof MILESTONES)[number];

type SeenMap = Record<string, Milestone[]>;

function readSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SeenMap;
  } catch {
    return {};
  }
}

function writeSeen(map: SeenMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* localStorage may be unavailable — best effort */
  }
}

function toastFor(milestone: Milestone, name: string): void {
  if (milestone === 100) {
    toast.success(S.milestone100(name), { duration: 8000 });
    return;
  }
  if (milestone === 80) {
    toast(S.milestone80(name), { duration: 6000 });
    return;
  }
  toast(S.milestone50(name), { duration: 5000 });
}

/**
 * Hook that fires a toast when a goal crosses a milestone (50/80/100%). Each
 * milestone per goal is fired at most once per browser — guarded via
 * `localStorage` so reloads don't spam. The first invocation seeds the storage
 * with the current state so we don't re-fire for goals already past a
 * milestone before the user opened the dashboard.
 */
export function useGoalMilestoneToast(items: IGoalWithProgress[]): void {
  const seededRef = useRef(false);

  useEffect(() => {
    if (items.length === 0) return;
    const seen = readSeen();

    if (!seededRef.current) {
      for (const { goal, progress } of items) {
        const reached = MILESTONES.filter((m) => progress.percentage >= m);
        if (reached.length > 0) {
          seen[goal.id] = Array.from(new Set([...(seen[goal.id] ?? []), ...reached]));
        }
      }
      writeSeen(seen);
      seededRef.current = true;
      return;
    }

    let mutated = false;
    for (const { goal, progress } of items) {
      const reached = MILESTONES.filter((m) => progress.percentage >= m);
      const previous = seen[goal.id] ?? [];
      const newOnes = reached.filter((m) => !previous.includes(m));
      if (newOnes.length === 0) continue;
      const highest = newOnes.reduce<Milestone>((acc, m) => (m > acc ? m : acc), 0 as Milestone);
      toastFor(highest, goal.name ?? "meta");
      seen[goal.id] = Array.from(new Set([...previous, ...reached]));
      mutated = true;
    }
    if (mutated) writeSeen(seen);
  }, [items]);
}
