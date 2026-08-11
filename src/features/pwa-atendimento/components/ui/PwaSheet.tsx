import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface IPwaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Bottom sheet of the app.
 *
 * Built on the shadcn `Sheet` rather than the kit's hand-rolled overlay so it
 * inherits the focus trap, the Escape key and the scroll lock — a phone-sized
 * modal that swallows the back gesture is worse than one that looks slightly
 * different.
 */
export function PwaSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
}: IPwaSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "flex max-h-[82svh] flex-col gap-0 rounded-t-[10px] border-x-0 border-b-0 border-t border-border bg-popover p-0",
          className,
        )}
      >
        <SheetHeader className="space-y-0 px-4 pb-2.5 pt-3.5 text-left">
          <SheetTitle className="font-display text-[17px] font-extrabold uppercase tracking-[0.02em] text-foreground">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
