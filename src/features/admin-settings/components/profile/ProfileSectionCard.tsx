import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

interface IProfileSectionCardProps {
  title: string;
  /** Iconify name (lucide set, mirroring the design kit). */
  icon: string;
  /** Tailwind text color class for the header icon. Defaults to the accent. */
  iconClassName?: string;
  /** Optional element pinned to the right of the header. */
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Visually de-emphasizes the whole card (feature not available yet). */
  dimmed?: boolean;
}

/**
 * Titled card used by every block of "Meu perfil" — header strip with icon and
 * an optional right slot, then the body. Mirrors the design kit's DashCard,
 * rebuilt on semantic tokens so it follows the active theme and light mode.
 */
export function ProfileSectionCard({
  title,
  icon,
  iconClassName = "text-primary",
  right,
  children,
  className,
  dimmed = false,
}: IProfileSectionCardProps) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <Icon icon={icon} className={cn("size-4 shrink-0", iconClassName)} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </header>
      <div className={cn("px-5 py-1", dimmed && "opacity-60")}>{children}</div>
    </section>
  );
}
