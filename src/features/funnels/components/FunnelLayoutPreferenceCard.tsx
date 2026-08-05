import { cn } from "@/lib/utils";
import { FUNNEL_LAYOUTS, type FunnelLayout } from "../engine/resolveLayout";
import { COPY } from "../i18n/pt-BR";
import { useFunnelLayoutPreference } from "../hooks/useFunnelLayoutPreference";

/**
 * Schematic thumbnails, drawn with semantic tokens only. Deliberately abstract
 * rather than a screenshot: the point is where the chooser sits on the page,
 * and a screenshot would go stale the first time Leads changes.
 */
function Thumb({ layout, active }: { layout: FunnelLayout; active: boolean }) {
  const accent = active ? "bg-primary" : "bg-muted-foreground/40";
  const plain = "bg-muted-foreground/20";

  return (
    <div
      aria-hidden
      className="flex h-14 w-full gap-1 rounded border border-border bg-background p-1.5"
    >
      {layout === "rail" && (
        <>
          <div className="flex w-1/4 flex-col gap-0.5">
            <span className={cn("h-1.5 rounded-sm", accent)} />
            <span className={cn("h-1.5 rounded-sm", plain)} />
            <span className={cn("h-1.5 rounded-sm", plain)} />
          </div>
          <div className="flex flex-1 gap-0.5">
            <span className={cn("flex-1 rounded-sm", plain)} />
            <span className={cn("flex-1 rounded-sm", plain)} />
          </div>
        </>
      )}

      {layout === "header" && (
        <div className="flex flex-1 flex-col gap-1">
          <span className={cn("h-2 w-1/2 rounded-sm", accent)} />
          <div className="flex flex-1 gap-0.5">
            <span className={cn("flex-1 rounded-sm", plain)} />
            <span className={cn("flex-1 rounded-sm", plain)} />
          </div>
        </div>
      )}

      {layout === "tabs" && (
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex gap-0.5">
            <span className={cn("h-1.5 w-1/4 rounded-sm", accent)} />
            <span className={cn("h-1.5 w-1/4 rounded-sm", plain)} />
            <span className={cn("h-1.5 w-1/4 rounded-sm", plain)} />
          </div>
          <div className="flex flex-1 gap-0.5">
            <span className={cn("flex-1 rounded-sm", plain)} />
            <span className={cn("flex-1 rounded-sm", plain)} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Second and last home for the funnel layout control (spec 6.5). Reads and
 * writes the same localStorage key as the in-selector menu, so the two mirror
 * each other with no synchronisation code.
 */
export function FunnelLayoutPreferenceCard() {
  const [layout, setLayout] = useFunnelLayoutPreference();

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold">{COPY.layoutSettingsTitle}</p>
      <p className="mt-1 text-xs text-muted-foreground">{COPY.layoutSettingsDescription}</p>

      <div
        role="radiogroup"
        aria-label={COPY.layoutSettingsTitle}
        className="mt-4 grid gap-3 sm:grid-cols-3"
      >
        {FUNNEL_LAYOUTS.map((l) => {
          const active = l === layout;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLayout(l)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                active ? "border-primary bg-muted/50" : "border-border hover:bg-muted/30",
              )}
            >
              <Thumb layout={l} active={active} />
              <span
                className={cn(
                  "text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {COPY.layoutOptions[l]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
