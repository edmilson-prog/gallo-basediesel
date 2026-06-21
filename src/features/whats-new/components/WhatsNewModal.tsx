import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useWhatsNew } from "../hooks/useWhatsNew";
import { WhatsNewReleaseCard } from "./WhatsNewReleaseCard";
import { WHATS_NEW_I18N } from "../i18n/pt-BR";

/**
 * Auto-opening "what's new" modal. Renders nothing until the gate selects
 * releases to show. Semi-blocking: closes via the footer buttons or Esc only.
 */
export function WhatsNewModal() {
  const { open, releases, overflowCount, dismiss, seeAll } = useWhatsNew();

  if (releases.length === 0) return null;

  const subtitle = WHATS_NEW_I18N.subtitleTemplate.replace("{{count}}", String(releases.length));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0 [&>button]:hidden motion-reduce:animate-none"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-background/90 px-5 py-4 backdrop-blur">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/10">
            <Icon icon="mdi:party-popper" size={22} className="text-success" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base">{WHATS_NEW_I18N.title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">{subtitle}</DialogDescription>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {releases.map((release, i) => (
            <WhatsNewReleaseCard key={release.version} release={release} highlighted={i === 0} />
          ))}
          {overflowCount > 0 && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              {WHATS_NEW_I18N.overflowTemplate.replace("{{count}}", String(overflowCount))}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <span className="mr-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Icon icon="mdi:information-outline" size={14} />
            {WHATS_NEW_I18N.escHint}
          </span>
          <Button variant="outline" size="sm" onClick={seeAll}>
            {WHATS_NEW_I18N.seeAll}
          </Button>
          <Button size="sm" onClick={dismiss}>
            {WHATS_NEW_I18N.dismiss}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
