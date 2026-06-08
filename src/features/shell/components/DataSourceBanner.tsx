import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useDataHealth } from "@/features/shell/hooks/useDataHealth";
import type { DataSource } from "@/providers/data";

/** Human label for each data origin (no technical jargon for end users). */
const SOURCE_LABEL: Record<DataSource, string> = {
  supabase: "Supabase",
  mock: "dados de demonstração",
};

/**
 * App-wide banner that makes a data-origin break impossible to miss. It appears
 * only when the active source (mock or Supabase) fails to load data for a screen
 * the user is viewing — telling apart a real failure from a genuinely empty list
 * — and offers a one-click retry. It hides itself the moment data recovers.
 */
export function DataSourceBanner() {
  const { isFailing, source, retry } = useDataHealth();

  if (!isFailing) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center gap-3 border-b border-severity-critical/30 bg-severity-critical/15 px-4 py-2 text-sm text-severity-critical"
    >
      <Icon icon="mdi:cloud-alert-outline" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Não foi possível carregar alguns dados</span>
        <span className="text-severity-critical/80">
          {" "}
          (origem: {SOURCE_LABEL[source]}). Verifique sua conexão e tente novamente.
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={retry}
        className="shrink-0 border-severity-critical/40 text-severity-critical hover:bg-severity-critical/10 hover:text-severity-critical"
      >
        Tentar novamente
      </Button>
    </div>
  );
}
