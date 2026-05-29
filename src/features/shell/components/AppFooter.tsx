import { Link } from "@tanstack/react-router";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { ReleaseKind } from "@/shared/types/about";
import { useChangelog } from "@/features/about/hooks/useChangelog";
import { RELEASE_KIND_LABEL } from "@/features/about/i18n/pt-BR";
import { ROUTES } from "@/features/shell/config/routes";

const PRODUCT_NAME = "GALLO BASE DIESEL";
const MAINTAINER = "AILA Sistemas Inteligentes";
const COPYRIGHT_YEAR = 2026;

/** Short, human description of what a release kind means — shown in the hover card. */
const KIND_DESCRIPTION: Record<ReleaseKind, string> = {
  major: "Mudanças estruturais",
  minor: "Novas funcionalidades",
  patch: "Correções e ajustes",
};

const KIND_BADGE: Record<ReleaseKind, string> = {
  major: "bg-primary/10 text-primary",
  minor: "bg-info/10 text-info",
  patch: "bg-success/10 text-success",
};

// Guarded so a stale dev server (started before the Vite `define` was added)
// or any environment without the define falls back to empty/version instead
// of throwing a ReferenceError on the bare global.
const GIT_BRANCH = typeof __GIT_BRANCH__ !== "undefined" ? __GIT_BRANCH__ : "";
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

interface IProps {
  /**
   * Display/visibility utilities for the `<footer>` container. Lets each shell
   * decide whether the bar is desktop-only (internal app) or always visible
   * (B2B portal, external-seller PWA).
   */
  className?: string;
  /**
   * When true, the version chip links to the internal About page and the hover
   * card shows a "what's new" CTA. Disabled on external surfaces (portal/PWA)
   * where `/app/configuracoes/sobre` is not reachable for the signed-in user.
   */
  showWhatsNew?: boolean;
}

/**
 * Thin status bar surfacing the current version + codename + release kind
 * (via a hover card, single source of truth: CHANGELOG.md) and, in development
 * only, the active git branch.
 *
 * In the internal app (`/app/*`) it is mounted as a non-scrolling sibling of
 * the scrollable `<main>` inside the full-height content column, so it stays
 * visible without `position: fixed` and respects the sidebar width. In the
 * scrolling portal/PWA shells it sits at the very bottom of the page as a
 * static build stamp.
 */
export function AppFooter({ className = "hidden md:flex", showWhatsNew = true }: IProps) {
  const { data: releases } = useChangelog();
  const current = releases?.[0];

  const version = current?.version ?? APP_VERSION;
  const codename = current?.codename ?? null;
  const kind = current?.kind ?? null;

  const showBranch = import.meta.env.DEV && GIT_BRANCH.length > 0;

  const versionChip = (
    <>
      <span className="font-semibold">v{version}</span>
      {codename && (
        <span className="text-success/70" aria-hidden>
          &ldquo;{codename}&rdquo;
        </span>
      )}
    </>
  );

  return (
    <footer
      className={cn(
        "h-8 shrink-0 items-center justify-between gap-4 border-t border-border bg-muted/30 px-4 text-[11px] text-muted-foreground backdrop-blur",
        className,
      )}
      aria-label="Informações da plataforma"
    >
      {/* Left — product wordmark + version hover card */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold tracking-wide text-foreground/80">
          {PRODUCT_NAME}
        </span>

        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>
            {showWhatsNew ? (
              <Link
                to={ROUTES.CONFIG_SOBRE}
                className="flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-success outline-none transition-colors hover:bg-success/10 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Versão ${version}. Ver novidades`}
              >
                {versionChip}
              </Link>
            ) : (
              <span
                className="flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-success"
                aria-label={`Versão ${version}`}
              >
                {versionChip}
              </span>
            )}
          </HoverCardTrigger>

          <HoverCardContent side="top" align="start" className="w-72">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-success">v{version}</span>
              {kind && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    KIND_BADGE[kind],
                  )}
                >
                  {RELEASE_KIND_LABEL[kind]}
                </span>
              )}
            </div>

            {codename && (
              <p className="mt-1.5 text-sm">
                Codinome <strong className="font-semibold text-foreground">{codename}</strong>
              </p>
            )}

            <p className="mt-1 text-xs text-muted-foreground">
              {current ? formatDateBr(current.date) : "—"}
              {kind && ` · ${KIND_DESCRIPTION[kind]}`}
            </p>

            {showWhatsNew && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-xs font-medium text-success">
                <span>Ver o que há de novo</span>
                <Icon icon="mdi:arrow-right" size={14} />
              </div>
            )}
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Center — dev-only branch chip */}
      {showBranch && (
        <span
          className="flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-warning"
          title="Branch de desenvolvimento ativa"
        >
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/70 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
          </span>
          <Icon icon="mdi:source-branch" size={12} aria-hidden />
          <span className="max-w-[16ch] truncate">{GIT_BRANCH}</span>
          <span className="text-warning/70">· dev</span>
        </span>
      )}

      {/* Right — maintainer + copyright */}
      <span className="hidden shrink-0 truncate lg:inline">
        © {COPYRIGHT_YEAR} {MAINTAINER}
      </span>
    </footer>
  );
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
