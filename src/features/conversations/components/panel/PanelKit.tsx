import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/**
 * The lateral panel's shared grammar, ported from
 * `ui_kits/atendimento/painel/pn-ui.jsx`.
 *
 * The kit's value is that every block obeys the same three rules — a card is a
 * titled box with an optional tone stripe, a row is label-left/value-right at a
 * fixed height, and an empty value is an invitation to fill it rather than a
 * dash. Before this the panel had four different row shapes across three
 * components; naming the grammar once is what stops that drifting again.
 *
 * The kit is dark-only and written in hex. Everything here is expressed in
 * semantic tokens instead (`.claude/rules/temas.md`): the panel sits on
 * `bg-background` with cards raised on `bg-card`, which reproduces the kit's
 * panel/card relationship in dark mode and reads as the conventional raised
 * card in light mode.
 */

export type PanelTone = "primary" | "success" | "warning" | "critical" | "info" | "muted";

const TONE_TEXT: Record<PanelTone, string> = {
  primary: "text-primary",
  success: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
  info: "text-severity-info",
  muted: "text-muted-foreground",
};

const TONE_BG: Record<PanelTone, string> = {
  primary: "bg-primary",
  success: "bg-severity-success",
  warning: "bg-severity-warning",
  critical: "bg-severity-critical",
  info: "bg-severity-info",
  muted: "bg-muted-foreground",
};

const TONE_SOFT: Record<PanelTone, string> = {
  primary: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/35",
  success: "bg-severity-success/15 text-severity-success ring-1 ring-inset ring-severity-success/35",
  warning: "bg-severity-warning/15 text-severity-warning ring-1 ring-inset ring-severity-warning/35",
  critical:
    "bg-severity-critical/15 text-severity-critical ring-1 ring-inset ring-severity-critical/35",
  info: "bg-severity-info/15 text-severity-info ring-1 ring-inset ring-severity-info/35",
  muted: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

export interface IPanelCardProps {
  icon?: string;
  title?: string;
  /** Rendered at the far right of the title row — usually a single icon button. */
  right?: ReactNode;
  /** Colours the 3px left stripe. Omit for a neutral card. */
  tone?: PanelTone;
  children: ReactNode;
  className?: string;
}

export function PanelCard({ icon, title, right, tone, children, className }: IPanelCardProps) {
  return (
    <section
      className={cn(
        "relative mx-3 mb-2.5 overflow-hidden rounded-lg border border-border bg-card p-3",
        className,
      )}
    >
      {tone && (
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BG[tone])}
          data-testid="panel-card-stripe"
        />
      )}
      {title && (
        <header className="mb-2.5 flex items-center gap-1.5">
          {icon && <Icon icon={icon} size={12} className="text-muted-foreground" />}
          <h3 className="flex-1 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-foreground/80">
            {title}
          </h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export interface IPanelRowProps {
  label: ReactNode;
  children: ReactNode;
  /** Makes the whole row a button — the kit's affordance for "this opens something". */
  onClick?: () => void;
  /** Renders the value in the muted weight, for things nobody acts on. */
  muted?: boolean;
  className?: string;
}

export function PanelRow({ label, children, onClick, muted, className }: IPanelRowProps) {
  const body = (
    <>
      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 text-right text-[12.5px]",
          muted ? "font-medium text-muted-foreground" : "font-semibold text-foreground",
        )}
      >
        {children}
      </span>
    </>
  );
  const shell = "flex min-h-[29px] items-center justify-between gap-2.5 rounded px-1 -mx-1";
  if (!onClick) return <div className={cn(shell, className)}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        shell,
        "w-[calc(100%+0.5rem)] text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {body}
    </button>
  );
}

export function PanelChip({
  children,
  tone = "muted",
  icon,
  variant = "soft",
  className,
}: {
  children: ReactNode;
  tone?: PanelTone;
  icon?: string;
  variant?: "soft" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em]",
        variant === "soft"
          ? TONE_SOFT[tone]
          : "text-muted-foreground ring-1 ring-inset ring-border",
        className,
      )}
    >
      {icon && <Icon icon={icon} size={10.5} />}
      {children}
    </span>
  );
}

export function PanelDivider({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-px bg-border", className)} />;
}

/**
 * Progress ring for the conversion card. An SVG rather than the linear
 * `Progress` primitive because the count has to sit INSIDE it — the kit puts
 * "2/5" in the middle, and a bar with a number beside it says the same thing
 * with twice the width, which this panel does not have.
 */
export function PanelRing({
  percent,
  tone,
  size = 44,
  children,
}: {
  percent: number;
  tone: PanelTone;
  size?: number;
  children?: ReactNode;
}) {
  const radius = (size - 5) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, percent)) / 100)}
          className={cn("transition-[stroke-dashoffset] duration-300 ease-out", TONE_TEXT[tone])}
          stroke="currentColor"
        />
      </svg>
      {children && (
        <span className="absolute text-[13px] font-extrabold text-foreground">{children}</span>
      )}
    </div>
  );
}
