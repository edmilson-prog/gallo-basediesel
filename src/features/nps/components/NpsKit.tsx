import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

/**
 * Primitives shared by every tab of /app/nps, translated from `ui_kits/nps`
 * (`nps-ui.jsx`: NpsChip, NpsNota, NpsAvatar, NpsCard, NpsSeg, NpsToggle,
 * NpsConfigRow).
 *
 * The kit names hex colours because it renders standalone in the Black Gold
 * theme. Here each of them becomes the semantic token that plays the same role,
 * so the screen follows whatever theme the user is on:
 *
 *   gold #E0BB4E  → primary          green #5BB07A → severity-success
 *   red  #E23A40  → severity-critical  t1/t2/t3/t4 → foreground / muted-foreground
 *   card #1c1819  → card               line        → border
 *
 * Tones are looked up as complete class strings. Tailwind scans source text, so
 * a class assembled at runtime (`text-${tone}`) is never generated and the
 * colour silently disappears in the production build — a failure that only
 * shows up after deploy.
 */

export type INpsTone = "primary" | "success" | "critical" | "muted";

const CHIP_SOFT: Record<INpsTone, string> = {
  primary: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40",
  success: "bg-severity-success/15 text-severity-success ring-1 ring-inset ring-severity-success/40",
  critical:
    "bg-severity-critical/15 text-severity-critical ring-1 ring-inset ring-severity-critical/40",
  muted: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

export const TEXT_TONE: Record<INpsTone, string> = {
  primary: "text-primary",
  success: "text-severity-success",
  critical: "text-severity-critical",
  muted: "text-muted-foreground",
};

const BOX_TONE: Record<INpsTone, string> = {
  primary: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/45",
  success: "bg-severity-success/15 text-severity-success ring-1 ring-inset ring-severity-success/45",
  critical:
    "bg-severity-critical/15 text-severity-critical ring-1 ring-inset ring-severity-critical/45",
  muted: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

const BAR_TONE: Record<INpsTone, string> = {
  primary: "bg-primary",
  success: "bg-severity-success",
  critical: "bg-severity-critical",
  muted: "bg-muted-foreground/40",
};

/** Tone of a raw 0–10 answer. The single place that maps score to colour. */
export function scoreTone(score: number): INpsTone {
  if (score >= 9) return "success";
  if (score >= 7) return "muted";
  return "critical";
}

/** Uppercase label pill — the kit's `NpsChip`. */
export function NpsChip({
  children,
  tone = "muted",
  variant = "soft",
  icon,
  size = "md",
}: {
  children: ReactNode;
  tone?: INpsTone;
  variant?: "soft" | "line";
  icon?: string;
  size?: "sm" | "md";
}) {
  const sizing = size === "sm" ? "px-2 py-[3px] text-[10.5px]" : "px-2.5 py-1 text-[11.5px]";
  const skin =
    variant === "line" ? "text-muted-foreground ring-1 ring-inset ring-border" : CHIP_SOFT[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-bold uppercase tracking-[0.05em] ${sizing} ${skin}`}
    >
      {icon ? <Icon icon={icon} size={size === "sm" ? 12 : 13} /> : null}
      {children}
    </span>
  );
}

/** The answer itself, in a tinted square — the kit's `NpsNota`. */
export function NpsScoreBox({ score, size = 38 }: { score: number; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg font-display font-bold ${BOX_TONE[scoreTone(score)]}`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {score}
    </span>
  );
}

/** Initials bubble — the kit's `NpsAvatar`. */
export function NpsAvatar({ initials, size = 26 }: { initials: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary/20 font-display font-bold text-primary ring-1 ring-inset ring-primary/40"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  );
}

/** First letters of a name, at most two — for {@link NpsAvatar}. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

/** Card with an icon in its header — the kit's `NpsCard`. */
export function NpsCard({
  title,
  icon,
  iconTone = "muted",
  sub,
  right,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title?: string;
  icon?: string;
  iconTone?: INpsTone;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      {title ? (
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {icon ? <Icon icon={icon} size={15} className={TEXT_TONE[iconTone]} /> : null}
          <span className="text-[13px] font-bold text-card-foreground">{title}</span>
          {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
          {right ? <div className="ml-auto">{right}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** Segmented control — the kit's `NpsSeg`. */
export function NpsSeg<T>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              active
                ? "bg-primary font-bold text-primary-foreground"
                : "font-semibold text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pill switch — the kit's `NpsToggle`. */
export function NpsToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "justify-end bg-primary" : "justify-start bg-muted-foreground/30"
      }`}
    >
      <span
        className={`block size-[18px] rounded-full ${checked ? "bg-primary-foreground" : "bg-background"}`}
      />
    </button>
  );
}

/**
 * Label, explanation and control on one line — the kit's `NpsConfigRow`.
 *
 * The explanation is not decoration: every one of these settings decides how
 * many real customers get messaged, so the row that hides its cost is the row
 * that gets changed carelessly.
 */
export function NpsConfigRow({
  label,
  help,
  children,
  note,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-card-foreground">{label}</div>
        {help ? <div className="mt-0.5 text-[12.5px] text-muted-foreground">{help}</div> : null}
        {note ? (
          <div className="mt-1 text-[11.5px] font-semibold text-severity-warning">{note}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Key/value line of the kit's read-only summary cards ("Cálculo", "Últimos 30 dias"). */
export function NpsFactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <b className="ml-auto text-right text-[13px] font-bold text-card-foreground">{value}</b>
    </div>
  );
}

/** Horizontal bar of a labelled count — used by the reasons and band cards. */
export function NpsMeterRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: INpsTone;
}) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span className="w-24 shrink-0 truncate text-[12.5px] text-muted-foreground">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
        <span
          className={`block h-full rounded ${BAR_TONE[tone]}`}
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </span>
      <span className="w-7 text-right font-display text-sm font-bold text-card-foreground">
        {value}
      </span>
    </div>
  );
}

/**
 * Placeholder for a kit block whose backend does not exist yet.
 *
 * Rendering the block greyed out with the reason stated is the honest option:
 * dropping it hides that the design asks for it, and wiring a live-looking
 * control to nothing would let someone flip a switch and believe it took.
 */
export function NpsNotWired({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5">
      <Icon icon="lucide:construction" size={15} className="mt-0.5 shrink-0 text-primary" />
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
