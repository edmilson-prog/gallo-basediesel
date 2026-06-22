// src/features/tour/components/WelcomeCard.tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { TourDef } from "../types";
import { TOUR_STRINGS as S } from "../i18n/pt-BR";

export function WelcomeCard({ def, onClose }: { def: TourDef; onClose: () => void }) {
  const step = def.steps[0];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(2,6,23,0.45)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={S.dialogLabel}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-lg duration-200 animate-in fade-in zoom-in-95 motion-reduce:animate-none"
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon icon={step.icon} size={20} />
          </span>
          <h2 className="text-base font-medium text-foreground">{step.title}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
          {step.body}
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            {S.gotIt}
          </Button>
        </div>
      </div>
    </div>
  );
}
