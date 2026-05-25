import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

export interface IEmptyStateProps {
  /** Iconify name. */
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;
}

export function EmptyState({
  icon = "mdi:hammer-wrench",
  title,
  description,
  actionLabel,
  actionTo,
}: IEmptyStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={icon} size={32} />
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
      {actionLabel && actionTo && (
        <Button asChild className="mt-6">
          <Link to={actionTo}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Placeholder shown by every route that hasn't been implemented yet.
 * Internal routes mention the next PRD; public routes use a softer copy.
 */
export interface IPlaceholderPageProps {
  /** PRD code that will deliver this screen, e.g. "047". */
  prd?: string;
  title?: string;
  icon?: string;
  /** When true, hides any mention of PRDs (use on /loja/*). */
  publicTone?: boolean;
  /** Optional override of the back link target. */
  backTo?: string;
  backLabel?: string;
}

export function PlaceholderPage({
  prd,
  title = "Em construção",
  icon,
  publicTone = false,
  backTo = "/app/inicio",
  backLabel = "Voltar ao início",
}: IPlaceholderPageProps) {
  const description = publicTone
    ? "Esta página estará disponível em breve."
    : prd
      ? `Esta tela será implementada no PRD-${prd}.`
      : "Esta tela ainda está sendo construída.";

  return (
    <EmptyState
      icon={icon ?? (publicTone ? "mdi:storefront-outline" : "mdi:hammer-wrench")}
      title={title}
      description={description}
      actionLabel={backLabel}
      actionTo={backTo}
    />
  );
}
