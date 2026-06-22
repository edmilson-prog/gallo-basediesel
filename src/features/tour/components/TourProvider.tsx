// src/features/tour/components/TourProvider.tsx
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/useAuth";
import { useTourStore } from "../store/useTourStore";
import { resolveTourForPath, shouldAutoStart } from "../engine/tourResolution";
import { TOURS } from "../config/tours";
import { getOptOut, isSeen } from "../storage/tourStorage";
import { useTargetRect } from "../hooks/useTargetRect";
import type { TourDef } from "../types";
import { Spotlight } from "./Spotlight";
import { TourStepCard } from "./TourStepCard";
import { WelcomeCard } from "./WelcomeCard";

export function TourProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const pathname = useLocation({ select: (l) => l.pathname });
  const activeTour = useTourStore((s) => s.activeTour);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const start = useTourStore((s) => s.start);
  const next = useTourStore((s) => s.next);
  const prev = useTourStore((s) => s.prev);
  const close = useTourStore((s) => s.close);
  const userId = currentUser?.id ?? null;
  const lastPathRef = useRef<string | null>(null);

  // Close an active tour when the route changes (marks it seen).
  useEffect(() => {
    if (lastPathRef.current !== null && lastPathRef.current !== pathname) {
      if (useTourStore.getState().activeTour) close();
    }
    lastPathRef.current = pathname;
  }, [pathname, close]);

  // Auto-start the registered tour on first visit.
  useEffect(() => {
    if (!userId) return;
    const def = resolveTourForPath(pathname, TOURS);
    if (!def) return;
    if (shouldAutoStart({ optOut: getOptOut(userId), seen: isSeen(userId, def.key) })) {
      start(def, userId);
    }
  }, [pathname, userId, start]);

  // Keyboard controls.
  useEffect(() => {
    if (!activeTour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTour, next, prev, close]);

  return (
    <>
      {children}
      {activeTour &&
        createPortal(
          <TourLayer def={activeTour} stepIndex={stepIndex} onNext={next} onPrev={prev} onClose={close} />,
          document.body,
        )}
    </>
  );
}

interface TourLayerProps {
  def: TourDef;
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

function TourLayer({ def, stepIndex, onNext, onPrev, onClose }: TourLayerProps) {
  // useTargetRect must run unconditionally (hooks rule); it returns null for
  // welcome tours / centered steps.
  const step = def.steps[stepIndex];
  const rect = useTargetRect(def.kind === "rich" ? step.target : undefined, def.kind === "rich");

  if (def.kind === "welcome") {
    return <WelcomeCard def={def} onClose={onClose} />;
  }
  return (
    <>
      <Spotlight rect={rect} />
      <TourStepCard def={def} stepIndex={stepIndex} rect={rect} onNext={onNext} onPrev={onPrev} onClose={onClose} />
    </>
  );
}
