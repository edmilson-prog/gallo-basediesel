import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IRelease } from "@/shared/types/about";
import { useChangelog } from "@/features/about/hooks/useChangelog";
import { ROUTES } from "@/features/shell/config/routes";
import { LOCALSTORAGE_KEYS } from "@/config/themes";
import { latestVersionToMark, selectNewReleases } from "../engine/versionGate";

/** Small settle delay so the modal does not flash mid-login. */
const OPEN_DELAY_MS = 500;

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LOCALSTORAGE_KEYS.lastSeenVersion);
  } catch {
    return null;
  }
}

function writeLastSeen(version: string): void {
  try {
    localStorage.setItem(LOCALSTORAGE_KEYS.lastSeenVersion, version);
  } catch {
    // localStorage unavailable (private mode / disabled) — no-op.
  }
}

export interface UseWhatsNewResult {
  open: boolean;
  releases: IRelease[];
  overflowCount: number;
  dismiss: () => void;
  seeAll: () => void;
}

/**
 * Decides whether the what's-new modal should open after login and exposes the
 * releases to show plus close handlers. Evaluated once per mount, after the
 * changelog query resolves. Never throws — a changelog failure simply keeps the
 * modal closed.
 */
export function useWhatsNew(): UseWhatsNewResult {
  const { data } = useChangelog();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState<{ releases: IRelease[]; overflowCount: number }>({
    releases: [],
    overflowCount: 0,
  });
  // One-shot guard so the gate is evaluated a single time per mount.
  const evaluatedRef = useRef(false);

  useEffect(() => {
    if (!data || data.length === 0 || evaluatedRef.current) return;
    evaluatedRef.current = true;

    const lastSeen = readLastSeen();

    // First visit → silent baseline: record current version, do not open.
    if (lastSeen === null) {
      const mark = latestVersionToMark(data);
      if (mark) writeLastSeen(mark);
      return;
    }

    const result = selectNewReleases(data, lastSeen);
    if (!result.shouldOpen) return;

    setGate({ releases: result.newReleases, overflowCount: result.overflowCount });
    const timer = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data]);

  const markSeen = useCallback(() => {
    if (!data) return;
    const mark = latestVersionToMark(data);
    if (mark) writeLastSeen(mark);
  }, [data]);

  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  const seeAll = useCallback(() => {
    markSeen();
    setOpen(false);
    navigate({ to: ROUTES.CONFIG_SOBRE });
  }, [markSeen, navigate]);

  return { open, releases: gate.releases, overflowCount: gate.overflowCount, dismiss, seeAll };
}
