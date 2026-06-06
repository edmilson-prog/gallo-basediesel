// src/features/media/components/SensitiveLock.tsx
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface ISensitiveLockProps {
  /** Variant: tile overlay (compact) or lightbox body (full). */
  variant?: "tile" | "full";
  /** Fired when the user attempts to view — caller audits it (PRD-006). */
  onAttempt?: () => void;
  /** Fired when the user requests access (caller may audit / notify). */
  onRequestAccess?: () => void;
  className?: string;
}

/** Redacted, statically-blurred placeholder + lock + access-request dialog (D-4/D-6). */
export function SensitiveLock({
  variant = "tile",
  onAttempt,
  onRequestAccess,
  className,
}: ISensitiveLockProps) {
  const [open, setOpen] = useState(false);
  const s = MEDIA_STRINGS.sensitive;

  const handleOpen = () => {
    onAttempt?.();
    setOpen(true);
  };

  const handleRequest = () => {
    onRequestAccess?.();
    toast.success(s.requestSent);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={s.caption}
        className={cn(
          "group relative flex h-full w-full flex-col items-center justify-center gap-1",
          // NOTE: static blur — never transition/animate (prefers-reduced-motion safe, spec §7)
          "bg-[linear-gradient(135deg,var(--muted),color-mix(in_oklab,var(--muted),black_8%))] blur-[2px]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <span aria-hidden className="pointer-events-none select-none text-muted-foreground/40">
          {/* redacted bars — not the real content */}
          <span className="block h-2 w-24 rounded bg-muted-foreground/30" />
          <span className="mt-1 block h-2 w-16 rounded bg-muted-foreground/20" />
        </span>
      </button>
      {/* lock + caption overlaid sharp (not blurred) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
        <Icon
          icon="mdi:lock"
          size={variant === "full" ? 40 : 22}
          className="text-severity-warning"
          aria-hidden
        />
        {variant === "full" && (
          <span className="px-4 text-center text-xs text-muted-foreground">{s.caption}</span>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon icon="mdi:lock" size={18} className="text-severity-warning" />
              {s.dialogTitle}
            </DialogTitle>
            <DialogDescription>{s.dialogBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {s.close}
            </Button>
            <Button onClick={handleRequest}>{s.requestAccess}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
