// src/features/tour/components/TourStepCard.tsx
import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { TourDef } from "../types";
import { computePlacement } from "../engine/popoverPlacement";
import { isFirstStep, isLastStep } from "../engine/tourNavigation";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

interface TourStepCardProps {
  def: TourDef;
  stepIndex: number;
  rect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

const CARD_WIDTH = 300;

export function TourStepCard({ def, stepIndex, rect, onNext, onPrev, onClose }: TourStepCardProps) {
  const step = def.steps[stepIndex];
  const total = def.steps.length;
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!rect) {
      setPos(null);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const placement = computePlacement(
      { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      step.placement ?? "bottom",
    );
    setPos({ top: placement.top, left: placement.left });
  }, [rect, stepIndex, step.placement]);

  const centered = !rect || !pos;
  const wrapperClass = centered
    ? "fixed inset-0 z-[51] flex items-center justify-center p-4"
    : "fixed z-[51]";
  const wrapperStyle = centered ? undefined : { top: pos!.top, left: pos!.left, width: CARD_WIDTH };

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={S.dialogLabel}
        style={centered ? { width: CARD_WIDTH } : undefined}
        className="rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg duration-200 animate-in fade-in zoom-in-95 motion-reduce:animate-none"
      >
        <div className="mb-2 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon icon={step.icon} size={18} />
          </span>
          <h2 className="text-sm font-medium text-foreground">{step.title}</h2>
        </div>
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
          {step.body}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1" aria-hidden="true">
              {def.steps.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === stepIndex
                      ? "h-1.5 w-3.5 rounded-full bg-primary transition-all"
                      : "h-1.5 w-1.5 rounded-full bg-border"
                  }
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{S.stepProgress(stepIndex + 1, total)}</span>
          </div>
          <div className="flex items-center gap-1">
            {!isFirstStep(stepIndex) && (
              <Button variant="ghost" size="sm" onClick={onPrev}>
                {S.back}
              </Button>
            )}
            {!isLastStep(stepIndex, total) && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                {S.skip}
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLastStep(stepIndex, total) ? S.finish : S.next}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
