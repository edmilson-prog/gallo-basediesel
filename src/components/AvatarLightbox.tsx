import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface IAvatarLightboxProps {
  /** Full-resolution image URL. When absent, children render without zoom. */
  src?: string;
  /** Contact/customer name — alt text + trigger aria-label. */
  name: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps an avatar so its synced WhatsApp photo opens enlarged in a dialog on
 * click. When there's no photo (`src` absent) the children render as-is with no
 * interaction — the initials/icon fallback isn't something to enlarge. The
 * stored photo is already the best resolution WhatsApp provides; the dialog just
 * shows it larger (fit-to-screen, aspect ratio preserved).
 */
export function AvatarLightbox({ src, name, children, className }: IAvatarLightboxProps) {
  const [open, setOpen] = useState(false);
  if (!src) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ampliar foto de ${name}`}
        className={cn(
          "rounded-full outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[92vw] border-0 bg-transparent p-0 shadow-none sm:max-w-lg">
          <DialogTitle className="sr-only">{`Foto de ${name}`}</DialogTitle>
          <DialogDescription className="sr-only">
            Visualização ampliada da foto do contato
          </DialogDescription>
          <img
            src={src}
            alt={`Foto de ${name}`}
            className="max-h-[85vh] w-full rounded-xl object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
