import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { PlatformIdentityCard } from "../components/PlatformIdentityCard";
import { CurrentVersionCard } from "../components/CurrentVersionCard";
import { ReleaseHistorySection } from "../components/ReleaseHistorySection";
import { AboutFooterCards } from "../components/AboutFooterCards";
import { useChangelog } from "../hooks/useChangelog";
import { ABOUT_I18N } from "../i18n/pt-BR";

export function AboutPage() {
  const queryClient = useQueryClient();
  const { data: releases, isLoading, isError } = useChangelog();

  const retry = () => {
    queryClient.invalidateQueries({ queryKey: ["changelog"] });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{ABOUT_I18N.page.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ABOUT_I18N.page.subtitle}</p>
      </header>

      <PlatformIdentityCard />

      {isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          <Icon icon="mdi:loading" size={16} className="animate-spin" />
          {ABOUT_I18N.loading}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">{ABOUT_I18N.error.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ABOUT_I18N.error.description}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            <Icon icon="mdi:refresh" size={14} />
            {ABOUT_I18N.error.retry}
          </Button>
        </div>
      )}

      {releases && releases.length > 0 && (
        <>
          <CurrentVersionCard release={releases[0]} />
          <ReleaseHistorySection releases={releases} />
        </>
      )}

      <AboutFooterCards releaseCount={releases?.length ?? 0} />
    </div>
  );
}
